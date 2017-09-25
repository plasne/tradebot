
// includes
const assert = require("assert");
const ws = require("ws");
const config = require("config");
const crypto = require("crypto");
const request = require("request-promise");

// variables
const host = config.get("gemini.host");
const key_feed = config.get("gemini.key_feed");
const secret_feed = config.get("gemini.secret_feed");
const key_orders = config.get("gemini.key_orders");
const secret_orders = config.get("gemini.secret_orders");

module.exports = class Gemini {

    get id() {
        return `Gemini()`;
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

    startOrderFeed() {
        const self = this;

        // create the request and sign it
        const req = JSON.stringify({
            "request": "/v1/order/events",
            "nonce": new Date().getTime()
        });
        const payload = new Buffer(req).toString("base64");
        const hmac = crypto.createHmac("sha384", secret_feed);
        const signature = hmac.update(payload).digest("hex");
        
        // open the feed
        self.feed = new ws(`wss://${host}/v1/order/events`, {
            headers: {
                "X-GEMINI-APIKEY": key_feed,
                "X-GEMINI-PAYLOAD": payload,
                "X-GEMINI-SIGNATURE": signature
            }
        });
        
        self.feed.on("open", () => {
            console.log(`${self.id}.startOrderFeed(): listening...`);
        });
        
        self.feed.on("close", () => {
            console.log(`${self.id}.startOrderFeed(): stopped listening.`);
        });
        
        self.feed.on("error", error => {
            console.error(`${self.id}.startOrderFeed(): ${error}`);
        });
        
        self.feed.on("message", data => {
            self.heartbeat = new Date(); // regardless of message type
        
            // get a list of messages
            let messages = JSON.parse(data);
            if (!Array.isArray(messages)) messages = [ messages ];
        
            // log types other than heartbeat
            messages.forEach(message => {
                switch (message.type) {

                    case "heartbeat":
                        console.log(`heartbeat @ ${new Date()}.`);
                        break;

                    // an attempt to place an order was rejected
                    case "rejected":

                        break;

                }


                if (message.type != "heartbeat") {
                    console.log(message);
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
                self.startOrderFeed();
            }
        }
    }

    // this method will record a transaction to the database
    // fields: { exchange: String, guid: String, code: String, type: String, volume: Float, price: Float, ts: Timestamp }
    //  NOTE: move to parent class
    record(fields) {
        const self = this;
        return new Promise((resolve, reject) => {
            global.pool.getConnection(function(error, connection) {
                if (!error) {
                    connection.query("START TRANSACTION;", (error, results) => {
                        if (!error) {
                            connection.query("INSERT INTO orders SET ?;", fields, (error, results) => {
                                if (!error) {
                                    resolve(connection);
                                } else {
                                    console.error(`${self.id}.record(): ${error}`);
                                    reject(error);
                                }
                            });    
                        } else {
                            console.error(`${self.id}.record(): ${error}`);
                            reject(error);
                        }
                    });
                } else {
                    console.error(`${self.id}.record(): ${error}`);
                    reject(error);
                }
            });
        });
    }

    cancel() {

        // create the request and sign it
        const req = JSON.stringify({
            "request": "/v1/order/cancel/session",
            "nonce": new Date().getTime()
        });
        const payload = new Buffer(req).toString("base64");
        const hmac = crypto.createHmac("sha384", secret_orders);
        const signature = hmac.update(payload).digest("hex");

        // post the cancelation
        return request({
            method: "POST",
            uri: `https://${host}/v1/order/cancel/session`,
            headers: {
                "Content-Type": "text/plain",
                "X-GEMINI-APIKEY": key_orders,
                "X-GEMINI-PAYLOAD": payload,
                "X-GEMINI-SIGNATURE": signature            
            }
        });

    }

    // this method is a direct buy action with no intelligence
    buy(method, code, volume, price) {
        const self = this;

        // create the request and sign it
        const req = JSON.stringify({
            "request": "/v1/order/new",
            "nonce": new Date().getTime(),
            "client_order_id": "TEST GUID",
            "symbol": `${code.toUpperCase()}USD`,
            "amount": volume.toString(),
            "price": price.toString(),
            "side": "buy",
            "type": "exchange limit",
            "options": (method === "market") ? ["immediate-or-cancel"] : []
        });
        const payload = new Buffer(req).toString("base64");
        const hmac = crypto.createHmac("sha384", secret_orders);
        const signature = hmac.update(payload).digest("hex");

        // record the transaction to the database and then post to Gemini
        self.record({
            exchange: "Gemini",
            guid: "new-guid",
            code: code,
            type: "buy",
            volume: volume,
            price: price,
            ts: new Date()
        }).then(connection => {
            return request({
                method: "POST",
                uri: `https://${host}/v1/order/new`,
                headers: {
                    "Content-Type": "text/plain",
                    "X-GEMINI-APIKEY": key_orders,
                    "X-GEMINI-PAYLOAD": payload,
                    "X-GEMINI-SIGNATURE": signature
                }
            }).then(() => {
                connection.query("COMMIT;");
            }, () => {
                connection.query("ROLLBACK;");
            });
        }).then(() => {
            console.log(`${self.id}.buy(): successfully posted ${method} order for ${volume} ${code} @ ${price} ${new Date()}.`);
        }).catch(ex => {
            console.log(`${self.id}.buy(): ${ex}`);
        });

    }

    // this method is a direct sell action with no intelligence
    sell(method, code, volume, price) {
        const self = this;

        // create the request and sign it
        const req = JSON.stringify({
            "request": "/v1/order/new",
            "nonce": new Date().getTime(),
            "client_order_id": "TEST GUID",
            "symbol": `${code.toUpperCase()}USD`,
            "amount": volume.toString(),
            "price": price.toString(),
            "side": "sell",
            "type": "exchange limit",
            "options": (method === "market") ? ["immediate-or-cancel"] : []
        });
        const payload = new Buffer(req).toString("base64");
        const hmac = crypto.createHmac("sha384", secret_orders);
        const signature = hmac.update(payload).digest("hex");

        // record the transaction to the database and then post to Gemini
        self.record({
            exchange: "Gemini",
            guid: "new-guid",
            code: code,
            type: "sell",
            volume: volume,
            price: price,
            ts: new Date()
        }).then(connection => {
            return request({
                method: "POST",
                uri: `https://${host}/v1/order/new`,
                headers: {
                    "Content-Type": "text/plain",
                    "X-GEMINI-APIKEY": key_orders,
                    "X-GEMINI-PAYLOAD": payload,
                    "X-GEMINI-SIGNATURE": signature
                }
            }).then(() => {
                connection.query("COMMIT;");
            }, () => {
                connection.query("ROLLBACK;");
            });
        }).then(() => {
            console.log(`${self.id}.sell(): successfully posted ${method} order for ${volume} ${code} @ ${price} ${new Date()}.`);
        }).catch(ex => {
            console.log(`${self.id}.sell(): ${ex}`);
        });

    }

    constructor() {
        const self = this;

        // connectivity check (every 2 min)
        setInterval(self.keepalive.bind(self), 2 * 60 * 1000);        

    }

}