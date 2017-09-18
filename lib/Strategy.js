
const assert = require('assert');

module.exports = class Strategy {

    get name() {
        return this._options.name;
    }

    get code() {
        return this._options.code;
    }

    get score() {
        // this needs to return from the database for the last scoring session
        return 100;
    }

    get stoploss() {
        return this._options.stoploss;
    }

    get intent() {
        return this._intent;
    }
    set intent(value) {
        this._intent = value;
    } 

    get manager() {
        return this._manager;
    }

    introduce(manager) {
        this._manager = manager;
    }

    // this is called when there is a new price
    update(priceInTime) {
        const self = this;
        return new Promise((resolve, reject) => {
            const intents = [];

            // stop-loss
            const lastTransaction = self.manager.lastTransaction;
            if (lastTransaction && lastTransaction.type === "sell") {
                const min = lastTransaction.price - (lastTransaction.price * self.stoploss);
                if (priceInTime.price <= min && self.intent.type != "sell") {
                    intents.push({
                        type: "sell",
                        reason: "stop-loss",
                        price: priceInTime.price,
                        ts: priceInTime.ts
                    });
                }
            }

            resolve(intents);
        });
    }

    constructor(options) {
        const self = this;

        // options
        assert.ok(options.name, "You must specify a name.");
        assert.ok(options.code, "You must specify a coin code.");
        options.stoploss = (options.stoploss != null) ? options.stoploss : 0.15; // 15%
        self._options = options;

        // variables
        self.intent = {
            type: "defer",
            ts: new Date()
        };

    }

}