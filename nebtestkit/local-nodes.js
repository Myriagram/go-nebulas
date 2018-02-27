'use strict';

var Neblet = require('./neblet');

var local = "127.0.0.1";
var test_net = "https://testnet.nebulas.io"
var port = 10000;
var http_port = 8090;
var rpc_port = 9090;
var miners = [
    "1a263547d167c74cf4b8f9166cfa244de0481c514a45aa2c",
    "2fe3f9f51f9a05dd5f7c5329127f7c917917149b4e16b0b8",
    "333cb3ed8c417971845382ede3cf67a0a96270c05fe2f700",
    "48f981ed38910f1232c1bab124f650c482a57271632db9e3",
    "59fc526072b09af8a8ca9732dae17132c4e9127e43cf2232",
    "75e4e5a71d647298b88928d8cb5da43d90ab1a6c52d0905f",
    "7da9dabedb4c6e121146fb4250a9883d6180570e63d6b080",
    "98a3eed687640b75ec55bf5c9e284371bdcaeab943524d51",
    "a8f1f53952c535c6600c77cf92b65e0c9b64496a8a328569",
    "b040353ec0f2c113d5639444f7253681aecda1f8b91f179f",
    "b414432e15f21237013017fa6ee90fc99433dec82c1c8370",
    "b49f30d0e5c9c88cade54cd1adecf6bc2c7e0e5af646d903",
    "b7d83b44a3719720ec54cdb9f54c0202de68f1ebcb927b4f",
    "ba56cc452e450551b7b9cffe25084a069e8c1e94412aad22",
    "c5bcfcb3fa8250be4f2bf2b1e70e1da500c668377ba8cd4a",
    "c79d9667c71bb09d6ca7c3ed12bfe5e7be24e2ffe13a833d",
    "d1abde197e97398864ba74511f02832726edad596775420a",
    "d86f99d97a394fa7a623fdf84fdc7446b99c3cb335fca4bf",
    "e0f78b011e639ce6d8b76f97712118f3fe4a12dd954eba49",
    "f38db3b6c801dddd624d6ddc2088aa64b5a24936619e4848",
    "fc751b484bd5296f8d267a8537d33f25a848f7f7af8cfcf6"
]

var Node = function (count) {
    if (count > miners.length) {
        throw "out of nodes count";
    }

    this.count = count;
};

Node.prototype = {
    Start: function () {
        var nodes = new Array();
        for (var i = 0; i < this.count; i++) {
            var server = new Neblet(
                local, port + i, http_port + i, rpc_port + i,
                miners[i], miners[i], 'passphrase'
            );
            if (i == 0) {
                server.Init()
            } else {
                server.Init(nodes[0])
            }
            server.Start();
            nodes.push(server);
            // console.log(server);
        }
        this.nodes = nodes;
    },
    NewNode: function (index) {
        var i = index;
        var server = new Neblet(
            local, port + i, http_port + i, rpc_port + i,
            miners[i], miners[i], 'passphrase'
        );
        if (i == 0) {
            server.Init()
        } else {
            server.Init(this.nodes[0])
        }
        server.Start();
        this.nodes.push(server);
    },
    Nodes: function () {
        return this.nodes;
    },
    Node: function (index) {
        return this.nodes[index];
    },
    RPC: function (index) {
        return this.nodes[index].RPC();
    },
    Coinbase: function (index) {
        return this.nodes[index].Coinbase();
    },
    Passphrase: function (index) {
        return this.nodes[index].Passphrase();
    },
    Stop: function () {
        for (var i = 0; i < this.nodes.length; i++) {
            this.nodes[i].Kill();
        }
    },
};

module.exports = Node;