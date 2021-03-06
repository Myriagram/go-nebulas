'use strict';

var HttpRequest = require("../../node-request");

var Wallet = require("../../../cmd/console/neb.js/lib/wallet");
var Neb = Wallet.Neb;
var neb = new Neb();
var Account = Wallet.Account;
var Transaction = Wallet.Transaction;
var Utils = Wallet.Utils;
var Unit = Wallet.Unit;

var expect = require('chai').expect;
var BigNumber = require('bignumber.js');
neb.setRequest(new HttpRequest("http://localhost:8685"));
var ChainID = 100;
var sourceAccount = new Account("a6e5eb290e1438fce79f5cb8774a72621637c2c9654c8b2525ed1d7e4e73653f");
/*
 * make sure every node of testnet has the same coinbase, and substitute the address below
 */
var coinbase = "eb31ad2d8a89a0ca6935c308d5425730430bc2d63f2573b8";
var coinState;

var env = 'testneb1';
if (env === 'testneb1') {
    neb.setRequest(new HttpRequest("http://35.182.48.19:8685"));
    ChainID = 1001;
    sourceAccount = new Wallet.Account("43181d58178263837a9a6b08f06379a348a5b362bfab3631ac78d2ac771c5df3");
    coinbase = "0b9cd051a6d7129ab44b17833c63fe4abead40c3714cde6d";
} else if (env === "testneb2") {
    neb.setRequest(new HttpRequest("http://34.205.26.12:8685"));
    ChainID = 1002;
    sourceAccount = new Wallet.Account("43181d58178263837a9a6b08f06379a348a5b362bfab3631ac78d2ac771c5df3");
    coinbase = "0b9cd051a6d7129ab44b17833c63fe4abead40c3714cde6d";
}

var from;
var fromState;
var initFromBalance = 10;

/*
 * set this value according to the status of your testnet.
 * the smaller the value, the faster the test, with the risk of causing error
 */
var maxCheckTime = 20;
var checkTimes = 0;

function checkTransaction(hash, callback) {
    checkTimes += 1;

    if (checkTimes > maxCheckTime) {
        console.log("check tx receipt timeout:" + hash);
        checkTimes = 0;
        callback();
        return;
    }

    neb.api.getTransactionReceipt(hash).then(function (resp) {

        console.log("tx receipt status:" + resp.status);
        if (resp.status === 2) {
            setTimeout(function () {
                checkTransaction(hash, callback);
            }, 2000);
        } else {
            checkTimes = 0;
            callback(resp);
        }
    }).catch(function (err) {
        console.log("fail to get tx receipt hash: " + hash);
        console.log("it may because the tx is being packing, we are going on to check it!");
        console.log(err.error);
        setTimeout(function () {
            checkTransaction(hash, callback);
        }, 2000);
    });
}

var maxCheckEventTimes = 20;
var checkEventTimes = 0;

function checkEvent(hash, callback) {
    checkEventTimes += 1;
    console.log("[checkEvent] try " + checkEventTimes + " times");

    if (checkEventTimes > maxCheckEventTimes) {
        console.log("check event timeout:" + hash);
        checkEventTimes = 0;
        callback();
        return;
    }

    neb.api.getEventsByHash(hash).then(function (resp) {
        console.log("[checkEvent] response: " + JSON.stringify(resp));

        if (resp.hasOwnProperty("error")){
            console.log("[checkEvent] contains error");
            setTimeout(function () {
                checkEvent(hash, callback);
            }, 2000);
        } else {
            // success
            checkEventTimes = 0;
            callback(resp);
        }

    }).catch(function (err) {
        console.log("fail to get event by hash: " + hash);
        console.log(err.error);
        setTimeout(function () {
           checkEvent(hash, callback);
        }, 2000);
    });
}

function test_transfer(testInput, testExpect, done) {
    neb.api.getAccountState(from.getAddressString()).then(function (state) {

        fromState = state;
        console.log("from state:" + JSON.stringify(state));
        return neb.api.getAccountState(coinbase);
    }).then(function (resp) {

        var toAddr = Account.NewAccount();
        if (testInput.isSameAddr === true) {
            toAddr = from;
        }
        coinState = resp;
        console.log("get coinbase state before tx:" + JSON.stringify(resp));
        var tx = new Transaction(ChainID, from, toAddr, Unit.nasToBasic(testInput.transferValue), parseInt(fromState.nonce) + testInput.nonceIncrement, testInput.gasPrice, testInput.gasLimit);
        tx.signTransaction();
        return neb.api.sendRawTransaction(tx.toProtoString());
    }).catch(function (err) {
        if (true === testExpect.canSendTx) {
            done(err);
        } else {
            done();
        }
    }).then(function (resp) {

        if (true === testExpect.canSendTx) {
            console.log("send Rax Tx:" + JSON.stringify(resp));
            expect(resp).to.be.have.property('txhash');
            checkTransaction(resp.txhash, function (receipt) {

                try {
                    if (true === testExpect.canSubmitTx) {
                        expect(receipt).to.not.be.a('undefined');

                        if (true === testExpect.canExcuteTx) {
                            expect(receipt).to.be.have.property('status').equal(1);
                        } else {
                            expect(receipt).to.not.have.property('status');
                        }
                        console.log("tx receipt : " + JSON.stringify(receipt));

                        neb.api.getAccountState(receipt.from).then(function (state) {

                            console.log("get from account state :" + JSON.stringify(state));
                            expect(state.balance).to.equal(testExpect.fromBalanceAfterTx);
                            return neb.api.getAccountState(receipt.to);
                        }).then(function (state) {

                            console.log("get to account state :" + JSON.stringify(state));
                            expect(state.balance).to.equal(testExpect.toBalanceAfterTx);
                            return neb.api.getAccountState(coinbase);
                        }).then(function (state) {

                            console.log("get coinbase account state after tx:" + JSON.stringify(state));
                            var reward = new BigNumber(state.balance).sub(coinState.balance);
                            reward = reward.mod(new BigNumber(0.48).mul(new BigNumber(10).pow(18)));
                            // The transaction should be only
                            expect(reward.toString()).to.equal(testExpect.transferReward);
                            done();
                        }).catch(function (err) {

                            console.log(JSON.stringify(err));
                            done(err);
                        });
                    } else {
                        expect(receipt).to.be.a('undefined');
                        done();
                    }

                    // might fail in local environment due to ( block height < OptimizeHeight )
                    checkEvent(resp.txhash, function (eventResult) {
                        console.log("[eventCheck] event[0] topic: " + JSON.stringify(eventResult.events[0].topic));

                        expect(eventResult.events[0].topic).to.equal("chain.transactionResult");

                        if (eventResult.hasOwnProperty('eventError')) {
                            expect(eventResult.events[0].error).to.equal(eventResult.eventError);
                        }
                    });

                } catch (err) {
                    console.log(JSON.stringify(err));
                    done(err);
                }
            });
        } else {
            expect(resp).to.be.a('undefined');
        }

    }).catch(function (err) {

        console.log(JSON.stringify(err));
        done(err);
    });
}

describe('normal transaction', function () {
    beforeEach(function (done) {
        from = Account.NewAccount();
        neb.api.getAccountState(sourceAccount.getAddressString()).then(function (resp) {

            console.log("source state:" + JSON.stringify(resp));
            var tx = new Transaction(ChainID, sourceAccount, from, Unit.nasToBasic(initFromBalance), parseInt(resp.nonce) + 1);
            tx.signTransaction();
            // console.log("source tx:" + tx.toString());
            return neb.api.sendRawTransaction(tx.toProtoString());
        }).then(function (resp) {

            checkTransaction(resp.txhash, function (resp) {
                try {
                    expect(resp).to.be.have.property('status').equal(1);
                    console.log("complete from address claim.");
                    done();
                } catch (err) {
                    done(err);
                }
            });
        }).catch(function (err) {
            console.log("claim token failed:" + JSON.stringify(err));
            done(err);
        });
    });

    it('normal transfer', function (done) {

        var testInput = {
            transferValue: 1,
            isSameAddr: false,
            isAddressValid: true,
            gasLimit: -1,
            gasPrice: -1,
            nonceIncrement: 1
        };
        //can calc value by previous params
        var testExpect = {
            canSendTx: true,
            canSubmitTx: true,
            canExcuteTx: true,
            fromBalanceAfterTx: '8999999980000000000',
            toBalanceAfterTx: '1000000000000000000',
            transferReward: '20000000000'
        };
        test_transfer(testInput, testExpect, done);
    });

    it('the sum of gas and balance is insufficient', function (done) {

        var testInput = {
            transferValue: 9.999999999999,
            isSameAddr: false,
            isAddressValid: true,
            gasLimit: -1,
            gasPrice: -1,
            nonceIncrement: 1
        };
        //can calc value by previous params
        var testExpect = {
            canSendTx: true,
            canSubmitTx: true,
            canExcuteTx: false,
            fromBalanceAfterTx: '9999999980000000000',
            toBalanceAfterTx: '0',
            transferReward: '20000000000',
            eventError: 'insufficient balance'

        };
        test_transfer(testInput, testExpect, done);
    });

    // Below are some test cases using boundary values

    it('balanceOfFrom = GasLimit * GasPrice + valueOfTx ', function (done) {

        var testInput = {
            transferValue: 9.99999998,
            isSameAddr: false,
            isAddressValid: true,
            gasLimit: 20000,
            gasPrice: 1000000,
            nonceIncrement: 1
        };

        var testExpect = {
            canSendTx: true,
            canSubmitTx: true,
            canExcuteTx: true,
            fromBalanceAfterTx: '0',
            toBalanceAfterTx: '9999999980000000000',
            transferReward: '20000000000'
        };
        test_transfer(testInput, testExpect, done);
    });


    it(' (GasLimit * GasPrice + valueOfTx) > balanceOfFrom = ( TxBaseGasCount * GasPrice + valueOfTx ) ', function (done) {

        var testInput = {
            transferValue: 9.99999998,
            isSameAddr: false,
            isAddressValid: true,
            gasLimit: 400000,
            gasPrice: 1000000,
            nonceIncrement: 1
        };

        // The TxBaseGasCount in neb is 20000

        var testExpect = {
            canSendTx: true,
            canSubmitTx: true,
            canExcuteTx: true,
            fromBalanceAfterTx: '0',
            toBalanceAfterTx: '9999999980000000000',
            transferReward: '20000000000'
        };

        test_transfer(testInput, testExpect, done);
    });

});