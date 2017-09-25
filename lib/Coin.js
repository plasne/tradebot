
// includes
const assert = require('assert');
const config = require("config");
const ws = require("ws");
const mysql = require("mysql");

// libraries
const Window = require("./Window.js");

// variables
const host = config.get("gemini.host");

module.exports = class Coin {

    get id() {
        const self = this;
        return `Coin(${self.code})`;
    }

    get code() {
        return this._code;
    }
    set code(value) {
        this._code = value;
    }

    get windows() {
        return this._windows;
    }
    set windows(value) {
        this._windows = value;
    }

    get heartbeat() {
        return this._heartbeat;
    }
    set heartbeat(value) {
        this._heartbeat = value;
    }

    get feed() {
        return this._feed;
    }
    set feed(value) {
        this._feed = value;
    }

    // this method starts the coin listening for price updates
    startMarketFeed() {
        const self = this;
        
        // open the websocket
        self.feed = new ws(`wss://${host}/v1/marketdata/${self.code}USD`);

        // report on open
        self.feed.on("open", () => {
            console.log(`${self.id}.startMarketFeed(): listening...`);
        });

        // trap close, so it can be re-opened after a delay
        self.feed.on("close", () => {
            console.log(`${self.id}.startMarketFeed(): stopped.`);
        });

        // log errors
        self.feed.on("error", error => {
            console.error(`${self.id}.startMarketFeed(): ${self.error}`);
        });

        // process messages
        self.feed.on("message", data => {
            self.heartbeat = new Date(); // regardless of message type

            // filter to trades
            let messages = JSON.parse(data);
            if (!Array.isArray(messages)) messages = [ messages ];
            messages.forEach(message => {
                switch(message.type) {

                    // keep alive
                    case "heartbeat":
                        break;

                    // info on trades
                    case "update":
                        message.events.forEach(event => {
                            if (event.reason == "trade") {

                                // give the price to the in-memory windows
                                const now = new Date();
                                for (let window of self.windows) {
                                    if (window.inMemory) {
                                        window.push({
                                            ts: now,
                                            price: parseFloat(event.price)
                                        });
                                    }
                                }

                                // if debug, show the message
                                if (global.debug) console.log(event);

                            }
                        });
                        break;

                }
            });

        });

    }

    // this method ensures the feed is always flowing
    keepalive() {
        const self = this;
        if (self.feed) {
            if (self.heartbeat == null || self.heartbeat + 2 * 60 * 1000 < new Date()) {
                console.log(`${self.id}.keepalive(): reconnecting feed...`)
                self.feed.terminate();
                self.startMarketFeed();
            }
        }
    }

    // this method records the last price to the database
    record() {
        const self = this;
        return new Promise((resolve, reject) => {

            // find the largest in-memory window
            const windows = self.windows.filter(w => w.inMemory);
            const window = windows[ windows.length - 1 ];

            // get the last value in that window
            const last = window.last();

            // record the value to the database
            if (last) {
                global.pool.query("INSERT INTO coinprice SET ?;", {
                    ts: last.ts,
                    code: self.code,
                    price: last.price
                }, (error, results, fields) => {
                    if (!error) {
                        if (global.debug) console.log(`${self.id}.record(): ${self.code} ${last.price} ${last.ts}`);
                        resolve();
                    } else {
                        console.error(`${self.id}.record(): ${error}`);
                        reject(error);
                    }
                });
            } else {
                console.error(`${self.id}.record(): There is not a price to record @ ${new Date()}.`);
                resolve();
            }

        });
    }

    get status() {
        const self = this;
        switch (self.feed.readyState) {
            case 0: return "connecting";
            case 1: return "open";
            case 2: return "closing";
            case 3: return "closed";
        }
    }

    report() {
        /*
        const self = this;
        return new Promise(resolve => {
            sync(function* () {
                const coin = {
                    code: self.code,
                    windows: []
                };
                for (let window of self.windows) {
                    const calc = yield window.calc();
                    calc.name = window.name;
                    coin.windows.push(calc);
                }
                resolve(coin);
            });
        });
        */
    }

    constructor(code) {
        const self = this;

        // assign variables
        assert.ok(code, "You must specify a code for this coin.");
        self.code = code;

        // windows
        self.windows = [
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
            }),
            new Window({
                name: "15 min",
                code: code,
                inMemory: true,
                isRolling: true,
                period: 15 * 60 * 1000
            }),
            new Window({
                name: "1 hour",
                code: code,
                isRolling: true,
                period: 1 * 60 * 60 * 1000
            }),
            new Window({
                name: "4 hour",
                code: code,
                isRolling: true,
                period: 4 * 60 * 60 * 1000
            }),
            new Window({
                name: "8 hour",
                code: code,
                isRolling: true,
                period: 8 * 60 * 60 * 1000
            }),
            new Window({
                name: "24 hour",
                code: code,
                isRolling: true,
                period: 24 * 60 * 60 * 1000
            }),
            new Window({
                name: "3 day",
                code: code,
                isRolling: true,
                period: 3 * 24 * 60 * 60 * 1000
            }),
            new Window({
                name: "7 day",
                code: code,
                isRolling: true,
                period: 7 * 24 * 60 * 60 * 1000
            }),
            new Window({
                name: "30 day",
                code: code,
                isRolling: true,
                period: 30 * 24 * 60 * 60 * 1000
            }),
            new Window({
                name: "90 day",
                code: code,
                isRolling: true,
                period: 90 * 24 * 60 * 60 * 1000
            })
        ];

        // connectivity check (every 2 min)
        setInterval(self.keepalive.bind(self), 2 * 60 * 1000);

        // record price (every 5 min)
        setInterval(self.record.bind(self), 5 * 60 * 1000);

    }

}
