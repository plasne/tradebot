
// references
const config = require("config");
const ipc = require("node-ipc");
const request = require("request-promise");
const ws = require("ws");
const crypto = require("crypto");
const bluebird = require("bluebird");

// globals
let debug = false;

// libraries
const Window = require("./lib/Window.js");

/*
const r = {
    "request": "/v1/order/events",
    "nonce": new Date().getTime()
}

const payload = new Buffer(JSON.stringify(r)).toString("base64");

const hmac = crypto.createHmac("sha384", config.get("gemini.secret"));

const signature = hmac.update(payload).digest("hex");

const events = new ws("wss://api.gemini.com/v1/order/events", {
    headers: {
        "X-GEMINI-APIKEY": config.get("gemini.key"),
        "X-GEMINI-PAYLOAD": payload,
        "X-GEMINI-SIGNATURE": signature
    }
});
*/

class CoinOnGemini {

    get code() {
        return this._code;
    }

    get windows() {
        return this._windows;
    }

    last() {
        return this._windows[0].last();
    }

    // fetch all trades since the last fetch
    fetch() {
        const self = this;
        console.log(self);
        
        // get the last 5 minutes or from the previous fetch
        const last = self.last();
        console.log(last);
        const ts = (last) ? last.ts : new Date().getTime() - 5 * 60 * 1000;

        // request from Gemini
        request({
            uri: `https://api.gemini.com/v1/pubticker/${self.code.toLowerCase()}usd`,
            qs: {
                ts: new Date()
            },
            json: true
        }).then(trade => {

            // for each trade, update each window
            for (let window of self.windows) {
                window.push({
                    price: parseFloat(trade.last),
                    ts: new Date(trade.volume.timestamp)
                });
            }

            console.log( new Date(trade.volume.timestamp) + " vs " + new Date() );

            //console.log(trades);
        }).catch(err => {
            console.error(`pubticker/${self.code.toLowerCase()}usd: ${err}`);
        });

    }

    constructor(code) {
        const self = this;

        // assign variables
        self._code = code;

        // windows
        self._windows = [
            new Window({
                name: "1 min",
                code: code,
                inMemory: true,
                isRolling: true,
                period: 1 * 60 * 1000
            }),
            new Window({
                name: "5 min",
                code: code,
                inMemory: true,
                isRolling: true,
                period: 5 * 60 * 1000
            })
        ];

        // start polling
        //self.fetch();
        setInterval(self.fetch.bind(self), 5 * 1000); // 30 sec

    }

}


// BTC: get the last price
const coin = new CoinOnGemini("BTC");
coin.fetch();

// configure ipc (local commands)
/*
ipc.config.id = config.get("ipc.bot");
ipc.config.retry = 1500;
ipc.config.silent = true;
ipc.serve(() => {
    console.log(`listening on ${ipc.config.id}...`);
    ipc.server.on("command", (message, socket) => {
        switch(message) {

            // toggle the debug flag
            case "debug":
                debug = !debug;
                ipc.server.emit(socket, "reply", `debug is now ${debug}.`);
                break;
                
        }
    });
});
ipc.server.start();
*/