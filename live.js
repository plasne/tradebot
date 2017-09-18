
// simple stop-loss
// x chg over y interval => upswing, downswing
// trailing stop-loss
// normal day trading
// calculate profit / loss
// track gain/loss per day
// track buy/sell log including profit
// allow for showing % of profits (Jason)
// track % efficiency; how much it could have gained during a 2 hr? period vs. what it did
// support multi-region
// record 1 day prices from a web service as a backup

// add a strategy around weekends and holidays
// add the mode detection

// references
const config = require("config");
const ipc = require("node-ipc");
const express = require("express");
const request = require("request");
const ws = require("ws");
const crypto = require("crypto");
const mysql = require("mysql");

// libraries
const Window = require("./lib/Window.js");
const DayTradeLimit = require("./lib/RollingMidpointStrategy.js");

// globals
let debug = false;

// configure express
const app = express();
app.use( express.static("www") );

// create a connection pool to the database
global.pool = mysql.createPool({
    host: config.get("db.host"),
    port: config.get("db.port"),
    user: config.get("db.user"),
    password: config.get("db.password"),
    database: config.get("db.name"),
    debug: (debug) ? ["ComQueryPacket"] : false
});

// create a function that can process synchronously
//   see: http://www.tivix.com/blog/making-promises-in-a-synchronous-manner/
const sync = fn => {
    let iterator = fn();
    let loop = result => {
        !result.done && result.value.then(
            res => loop(iterator.next(res)),
            err => loop(iterator.throw(err))
        );
    };
    loop(iterator.next());
};

class Coin {

    startMarketFeed() {
        const self = this;
        
        // open the websocket
        self._feed = new ws(`wss://api.gemini.com/v1/marketdata/${self.code}USD`);

        // report on open
        self._feed.on("open", () => {
            console.log(`${self.code} listening...`);
        });

        // trap close, so it can be re-opened after a delay
        self._feed.on("close", () => {
            console.log(`${self.code} stopped.`);
        });

        // log errors
        self._feed.on("error", error => {
            console.error(`${self.code}: ${self.error}`);
        });

        // process messages
        self._feed.on("message", data => {

            // filter to trades
            let messages = JSON.parse(data);
            if (!Array.isArray(messages)) messages = [ messages ];
            messages.forEach(message => {
                if (message.type == "update") {
                    message.events.forEach(event => {
                        if (event.reason == "trade") {

                            // give the price to the in-memory windows
                            const now = new Date().getTime();
                            self.windows.forEach(window => {
                                if (window.isInMemory) {
                                    window.push({
                                        ts: now,
                                        price: parseFloat(event.price)
                                    });
                                }
                            });

                            // if debug, show the message
                            if (debug) console.log(event);

                        }
                    });
                }
            });

        });

    }

    get status() {
        const self = this;
        switch (self._feed.readyState) {
            case 0: return "connecting";
            case 1: return "open";
            case 2: return "closing";
            case 3: return "closed";
        }
    }

    report() {
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
    }

    constructor(code) {
        const self = this;

        // assign variables
        self.code = code;
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

    }

}

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

events.on("open", () => {
    console.log("listening...");
});

events.on("close", () => {
    // restart after
    console.log("stopped listening.");
});

events.on("error", error => {
    // log
    console.error(error);
});

events.on("message", data => {

    // get a list of messages
    let messages = JSON.parse(data);
    if (!Array.isArray(messages)) messages = [ messages ];

    // log types other than heartbeat
    messages.forEach(message => {
        if (message.type != "heartbeat") {
            console.log(message);
        }
    });

});

const coins = [
    new Coin("ETH"),
    new Coin("BTC")
];

coins.forEach(coin => {
    coin.startMarketFeed();
});

function recordPrices() {
    for (let coin of coins) {
        coin.windows[0].calc().then(calc => {
            if (calc.last == Number.MIN_SAFE_INTEGER) {
                console.error("There is not a price to record " + new Date());
                return;
            }
            global.pool.query("INSERT INTO coinprice SET ?;", {
                code: coin.code,
                price: calc.last
            }, (error, results, fields) => {
                if (!error) {
                    // success
                } else {
                    console.error(`Cannot connect to database: ${error}`);
                }
            });
        }, ex => {
            console.error(`Error reading latest price: ${ex}`);
        });
    };
}

setInterval(recordPrices, 5 * 60 * 1000);

// return a JSON file with all the current data
app.get("/all", (req, res) => {
    sync(function* () {
        const all = {
            coins: []
        };
        for (let coin of coins) {
            const report = yield coin.report();
            all.coins.push(report);
        }
        res.send(all);
    });
});

// redirect to main portal page
app.get("/", (req, res) => {
    res.redirect("/default.html");
});

// startup the portal
const port = config.get("portal.port")
app.listen(port, () => {
    console.log(`listening on port ${port}...`);
});

// configure ipc (local commands)
ipc.config.id = config.get("ipc.bot");
ipc.config.retry = 1500;
ipc.config.silent = true;
ipc.serve(() => {
    console.log(`listening on ${ipc.config.id}...`);
    ipc.server.on("command", (message, socket) => {
        switch(message) {

            // report on the feed status of all coins
            case "status":
                const reply = {
                    coins: []
                };
                for (let coin of coins) {
                    reply.coins.push({
                        code: coin.code,
                        status: coin.status
                    });
                }
                ipc.server.emit(socket, "reply", JSON.stringify(reply));
                break;

            // toggle the debug flag
            case "debug":
                debug = !debug;
                ipc.server.emit(socket, "reply", `debug is now ${debug}.`);
                break;
                
        }
    });
});
ipc.server.start();
