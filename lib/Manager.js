
const assert = require('assert');
const Window = require("./Window.js");

module.exports = class Manager {

    get fee() {
        return this.options.fee;
    }

    update(priceInTime) {
        const self = this;
        return new Promise((resolve, reject) => {

            // record the last price
            self.last = priceInTime;

            // update the strategy
            self.options.strategy.update(priceInTime).then(intents => {

                // process the first intent
                if (intents.length > 0) {
                    const intent = intents[0];
                    switch (intent.type) {
                        case "buy":
                            self.buy(self.options.strategy, intent);
                            break;
                        case "sell":
                            self.sell(self.options.strategy, intent);
                            break;
                    }
                }
                resolve();

            }, error => {
                console.error(error);
                throw error;
            }).catch(ex => {
                console.error(ex);
                throw ex;
            });

        });
    }

    // report on the transactions that have made
    get transactions() {
        const self = this;
        return self._transactions;
    }

    // gets the last transaction, usually this is called by a strategy to make sure it doesn't do something stupid
    //  like suggest a buy at a higher price than a sell
    get lastTransaction() {
        const self = this;
        if (self._transactions.length < 1) return null;
        return self._transactions[ self._transactions.length - 1 ];
    }

    constructor(options) {
        const self = this;

        // options
        assert.ok(options.code, "You must specify the coin code to the Simulator.");
        assert.ok(options.funds, "You must provide some funds to the Simulator.");
        assert.ok(options.fee, "You must provide the fee as a percent to the Simulator.");
        assert.ok(options.strategy, "You must specify a strategy.");
        options.minbuy = (options.minbuy != null) ? options.minbuy : 100; // $100
        self.options = options;
        
        // variables
        self.funds = options.funds;
        self.coins = 0;
        self._transactions = [];

        // introduce to strategy
        options.strategy.introduce(self);

    }

}