// Copyright (C) 2017 go-nebulas authors
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

package core

import (
	"encoding/json"

	"github.com/nebulasio/go-nebulas/util"
)

// BinaryPayloadDeprecated carry some data
type BinaryPayloadDeprecated struct {
	Data []byte
}

// LoadBinaryPayloadDeprecated from bytes
func LoadBinaryPayloadDeprecated(bytes []byte) (*BinaryPayloadDeprecated, error) {
	return NewBinaryPayloadDeprecated(bytes), nil
}

// LoadBinaryPayloadDeprecatedFail from bytes
func LoadBinaryPayloadDeprecatedFail(bytes []byte) (*BinaryPayloadDeprecated, error) {
	payload := &BinaryPayloadDeprecated{}
	err := json.Unmarshal(bytes, payload)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

// NewBinaryPayloadDeprecated with data
func NewBinaryPayloadDeprecated(data []byte) *BinaryPayloadDeprecated {
	return &BinaryPayloadDeprecated{
		Data: data,
	}
}

// ToBytes serialize payload
func (payload *BinaryPayloadDeprecated) ToBytes() ([]byte, error) {
	return json.Marshal(payload)
}

// BaseGasCount returns base gas count
func (payload *BinaryPayloadDeprecated) BaseGasCount() *util.Uint128 {
	return util.NewUint128()
}

// Execute the payload in tx
func (payload *BinaryPayloadDeprecated) Execute(block *Block, tx *Transaction) (*util.Uint128, string, error) {
	return util.NewUint128(), "", nil
}

// BinaryPayload carry some data
type BinaryPayload struct {
	Data []byte
}

// LoadBinaryPayload from bytes
func LoadBinaryPayload(bytes []byte) (*BinaryPayload, error) {
	return NewBinaryPayload(bytes), nil
}

// NewBinaryPayload with data
func NewBinaryPayload(data []byte) *BinaryPayload {
	return &BinaryPayload{
		Data: data,
	}
}

// ToBytes serialize payload
func (payload *BinaryPayload) ToBytes() ([]byte, error) {
	return payload.Data, nil
}

// BaseGasCount returns base gas count
func (payload *BinaryPayload) BaseGasCount() *util.Uint128 {
	return util.NewUint128()
}

// Execute the payload in tx
func (payload *BinaryPayload) Execute(block *Block, tx *Transaction) (*util.Uint128, string, error) {
	return util.NewUint128(), "", nil
}
