// Copyright (C) 2018 go-nebulas authors
//
// This file is part of the go-nebulas library.
//
// the go-nebulas library is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// the go-nebulas library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with the go-nebulas library.  If not, see <http://www.gnu.org/licenses/>.
//

package sync

import (
	"errors"
	"sync"
	"time"

	"github.com/nebulasio/go-nebulas/util/byteutils"

	"github.com/gogo/protobuf/proto"
	"github.com/nebulasio/go-nebulas/core"
	"github.com/nebulasio/go-nebulas/net"
	"github.com/nebulasio/go-nebulas/sync/pb"
	"github.com/nebulasio/go-nebulas/util/logging"
	"github.com/sirupsen/logrus"
)

// Errors
var (
	ErrInvalidChainSyncMessageData     = errors.New("invalid ChainSync message data")
	ErrInvalidChainGetChunkMessageData = errors.New("invalid ChainGetChunk message data")
)

// Service manage sync tasks
type Service struct {
	blockChain *core.BlockChain
	netService net.Service
	chunk      *Chunk
	quitCh     chan bool
	messageCh  chan net.Message

	activeTask      *Task
	activeTaskMutex sync.Mutex
}

// NewService return new Service.
func NewService(blockChain *core.BlockChain, netService net.Service) *Service {
	return &Service{
		blockChain: blockChain,
		netService: netService,
		chunk:      NewChunk(blockChain),
		quitCh:     make(chan bool, 1),
		activeTask: nil,
		messageCh:  make(chan net.Message, 128),
	}
}

// Start start sync service.
func (ss *Service) Start() {
	logging.VLog().Info("Starting Sync Service.")

	// register the network handler.
	netService := ss.netService
	netService.Register(net.NewSubscriber(ss, ss.messageCh, false, net.ChainSync, net.MessageWeightZero))
	netService.Register(net.NewSubscriber(ss, ss.messageCh, false, net.ChainChunks, net.MessageWeightChainChunks))
	netService.Register(net.NewSubscriber(ss, ss.messageCh, false, net.ChainGetChunk, net.MessageWeightZero))
	netService.Register(net.NewSubscriber(ss, ss.messageCh, false, net.ChainChunkData, net.MessageWeightChainChunkData))

	// start loop().
	go ss.startLoop()
}

// Stop stop sync service.
func (ss *Service) Stop() {
	// deregister the network handler.
	netService := ss.netService
	netService.Deregister(net.NewSubscriber(ss, ss.messageCh, false, net.ChainSync, net.MessageWeightZero))
	netService.Deregister(net.NewSubscriber(ss, ss.messageCh, false, net.ChainChunks, net.MessageWeightChainChunks))
	netService.Deregister(net.NewSubscriber(ss, ss.messageCh, false, net.ChainGetChunk, net.MessageWeightZero))
	netService.Deregister(net.NewSubscriber(ss, ss.messageCh, false, net.ChainChunkData, net.MessageWeightChainChunkData))

	ss.StopActiveSync()

	ss.quitCh <- true
}

// StartActiveSync starts an active sync task
func (ss *Service) StartActiveSync() bool {
	// lock.
	ss.activeTaskMutex.Lock()
	defer ss.activeTaskMutex.Unlock()

	if ss.IsActiveSyncing() {
		return false
	}

	ss.activeTask = NewTask(ss.blockChain, ss.netService, ss.chunk)
	ss.activeTask.Start()

	logging.CLog().WithFields(logrus.Fields{
		"syncpoint": ss.activeTask.syncPointBlock,
	}).Info("Started Active Sync Task.")
	return true
}

// StopActiveSync stops current sync task
func (ss *Service) StopActiveSync() {
	if ss.activeTask == nil {
		return
	}

	ss.activeTask.Stop()
	ss.activeTask = nil
}

// IsActiveSyncing return if there is active task now
func (ss *Service) IsActiveSyncing() bool {
	if ss.activeTask == nil {
		return false
	}

	return true
}

// WaitingForFinish wait for finishing current sync task
func (ss *Service) WaitingForFinish() error {
	if ss.activeTask == nil {
		return nil
	}

	err := <-ss.activeTask.statusCh

	logging.CLog().WithFields(logrus.Fields{
		"tail": ss.blockChain.TailBlock(),
	}).Info("Active Sync Task Finished.")

	ss.activeTask = nil
	return err
}

func (ss *Service) startLoop() {
	logging.CLog().Info("Started Sync Service.")
	timerChan := time.NewTicker(time.Second).C

	for {
		select {
		case <-timerChan:
			metricsCachedSync.Update(int64(len(ss.messageCh)))
		case <-ss.quitCh:
			if ss.activeTask != nil {
				ss.activeTask.Stop()
			}
			logging.CLog().Info("Stopped Sync Service.")
			return
		case message := <-ss.messageCh:
			switch message.MessageType() {
			case net.ChainSync:
				ss.onChainSync(message)
			case net.ChainChunks:
				ss.onChainChunks(message)
			case net.ChainGetChunk:
				ss.onChainGetChunk(message)
			case net.ChainChunkData:
				ss.onChainChunkData(message)
			default:
				logging.VLog().WithFields(logrus.Fields{
					"messageName": message.MessageType(),
				}).Debug("Received unknown message.")
			}
		}
	}
}

func (ss *Service) onChainSync(message net.Message) {
	if ss.IsActiveSyncing() {
		return
	}

	// handle ChainSync message.
	chunkSync := new(syncpb.Sync)
	err := proto.Unmarshal(message.Data(), chunkSync)
	if err != nil {
		logging.VLog().WithFields(logrus.Fields{
			"err": err,
			"pid": message.MessageFrom(),
		}).Debug("Invalid ChainSync message data.")
		ss.netService.ClosePeer(message.MessageFrom(), ErrInvalidChainSyncMessageData)
		return
	}

	// generate Chunks message.
	chunks, err := ss.chunk.generateChunkHeaders(chunkSync.TailBlockHash)
	if err != nil && err != ErrTooSmallGapToSync {
		logging.VLog().WithFields(logrus.Fields{
			"err":  err,
			"pid":  message.MessageFrom(),
			"hash": byteutils.Hex(chunkSync.TailBlockHash),
		}).Debug("Failed to generate chunk headers.")
		return
	}

	ss.sendChainChunks(message.MessageFrom(), chunks)
}

func (ss *Service) onChainChunks(message net.Message) {
	if ss.activeTask == nil {
		return
	}

	ss.activeTask.processChunkHeaders(message)
}

func (ss *Service) onChainGetChunk(message net.Message) {
	if ss.IsActiveSyncing() {
		return
	}

	// handle ChainGetChunk message.
	chunkHeader := new(syncpb.ChunkHeader)
	err := proto.Unmarshal(message.Data(), chunkHeader)
	if err != nil {
		logging.VLog().WithFields(logrus.Fields{
			"err": err,
			"pid": message.MessageFrom(),
		}).Debug("Invalid ChainGetChunk message data.")
		ss.netService.ClosePeer(message.MessageFrom(), ErrInvalidChainGetChunkMessageData)
		return
	}

	chunkData, err := ss.chunk.generateChunkData(chunkHeader)
	if err != nil {
		if err == ErrWrongChunkHeaderRootHash {
			ss.netService.ClosePeer(message.MessageFrom(), err)
		}
		return
	}

	ss.sendChainChunkData(message.MessageFrom(), chunkData)
}

func (ss *Service) onChainChunkData(message net.Message) {
	if ss.activeTask == nil {
		return
	}

	ss.activeTask.processChunkData(message)
}

func (ss *Service) sendChainChunks(peerID string, chunks *syncpb.ChunkHeaders) {
	data, err := proto.Marshal(chunks)
	if err != nil {
		logging.VLog().WithFields(logrus.Fields{
			"err": err,
		}).Debug("Failed to marshal syncpb.ChunkHeaders.")
		return
	}

	ss.netService.SendMessageToPeer(net.ChainChunks, data, net.MessagePriorityLow, peerID)
}

func (ss *Service) sendChainChunkData(peerID string, chunkData *syncpb.ChunkData) {
	data, err := proto.Marshal(chunkData)
	if err != nil {
		logging.VLog().WithFields(logrus.Fields{
			"err": err,
		}).Debug("Failed to marshal syncpb.ChunkData.")
		return
	}

	ss.netService.SendMessageToPeer(net.ChainChunkData, data, net.MessagePriorityLow, peerID)
}
