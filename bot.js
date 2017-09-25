
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
const request = require("request-promise");
const ws = require("ws");
const mysql = require("mysql");
const bluebird = require("bluebird");

// libraries
const Window = require("./lib/Window.js");
const Coin = require("./lib/Coin.js");
const Gemini = require("./lib/Gemini.js");

// globals
global.debug = false;

// create a connection pool to the database
global.pool = mysql.createPool({
    host: config.get("db.host"),
    port: config.get("db.port"),
    user: config.get("db.user"),
    password: config.get("db.password"),
    database: config.get("db.name"),
    debug: (debug) ? ["ComQueryPacket"] : false
});

// start the market feeds
const coins = [
    new Coin("ETH"),
    new Coin("BTC")
];
coins.forEach(coin => {
    coin.startMarketFeed();
});

// start the order feeds
const gemini = new Gemini();
gemini.startOrderFeed();

// configure ipc (local commands)
ipc.config.id = config.get("ipc.bot");
ipc.config.retry = 1500;
ipc.config.silent = true;
ipc.serve(() => {
    console.log(`bot(): listening on ${ipc.config.id}...`);
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
                global.debug = !global.debug;
                ipc.server.emit(socket, "reply", `debug is now ${global.debug}.`);
                break;

            // just for debugging
            case "buy":
                gemini.buy("limit", "BTC", 100, 100);
                ipc.server.emit(socket, "reply", "attempting to buy 100 BTC @ $100 each.");
                break;

            case "sell":
                gemini.sell("limit", "BTC", 100, 9000);
                ipc.server.emit(socket, "reply", "attempting to sell 100 BTC @ $9,000 each.");
                break;

            case "cancel":
                gemini.cancel();
                ipc.server.emit(socket, "reply", "cancelling open orders.");
                break;
                
        }
    });
});
ipc.server.start();
