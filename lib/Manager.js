
const assert = require('assert');
const Window = require("./Window.js");

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

module.exports = class Manager {

    get fee() {
        return this.options.fee;
    }

    update(priceInTime) {
        const self = this;
        return new Promise((resolve, reject) => {
            sync(function* () {
                try {

                    // record the last price
                    self.last = priceInTime;
                
                    // accept the intent from the first strategy that doesn't defer
                    let intent;
                    for (let strategy of self.options.strategies) {
                        yield strategy.update(priceInTime).catch(ex => {
                            console.error(ex);
                            throw ex;
                        });
                        if (intent == null && strategy.intent.type !== "defer") {
                            intent = strategy.intent;
                            intent.strategy = strategy;
                        }
                    }
        
                    // process the intent
                    if (intent) {
                        switch (intent.type) {
                            case "falling":
                                self.sell(intent.strategy, intent.ts);
                                break;
                            case "rising":
                                self.buy(intent.strategy, intent.ts);
                                break;
                            case "buy":
                                self.buy(intent.strategy, intent.ts, intent.price, intent.profit);
                                break;
                            case "sell":
                                self.sell(intent.strategy, intent.ts, intent.price);
                                break;
                        }
                    }
        
                    resolve();
                } catch (ex) {
                    reject(ex);
                }
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
        assert.ok(options.strategies, "You must specify some strategies.");
        options.minbuy = (options.minbuy != null) ? options.minbuy : 100; // $100
        self.options = options;
        
        // variables
        self.funds = options.funds;
        self.coins = 0;
        self._transactions = [];

        // introduce to strategies
        for (let strategy of options.strategies) {
            strategy.introduce(self);
        }

    }

}