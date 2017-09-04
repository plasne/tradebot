
const assert = require('assert');

// at some point, there should be a way to allocate more funds or take funds
// put caps on min/max price
// where to put mode changes?
// don't allow buy/sell when pending (not specifically relevant here)

module.exports = class SimulationManager {
    // this handler is designed to take a range of data and a strategy to
    // score how much money it could have made over that time period, it has
    // the following characteristics:
    // 1. track how much money has been made
    // 2. track all the transactions

    // the strategy wants to buy, it will inform regarding the expected profit
    buy(strategy, price, profit) {
        const self = this;
        const fee = self.funds * self.options.fee;
        const count = (self.funds - fee - 10) / price;
        if ((count * profit) < (2 * fee)) {
            // there isn't enough profit to make this trade
        } else {
            self.funds -= (count * price);
            self.coins += count;
            self._transactions.push({
                type: "buy",
                coin: self.options.code,
                strategy: strategy,
                number: count,
                price: price,
                total: (count * price)
            });
            console.log("bought " + count + " @ " + price + " = " + (count * price));
        }
    }

    // the strategy wants to sell
    sell(strategy, price) {
        const self = this;
        const count = self.coins;
        if (count > 0) {
            self._transactions.push({
                type: "sell",
                coin: self.options.code,
                strategy: strategy,
                number: count,
                price: price,
                total: (count * price)
            });
            console.log("sold " + count + " @ " + price + " = " + (count * price));
            self.coins = 0;
            self.funds += (count * price);
        }
    }

    // report on the profit that has been made
    get calc () {
        const self = this;
        const result = {
            profit: 0,
            good: 0,
            bad: 0
        };

        let debt = 0;
        for (let transaction of self._transactions) {
            switch (transaction.type) {
                case "buy":
                    debt += transaction.total;
                    break;
                case "sell":
                    const profit = (transaction.total - debt);
                    result.profit += profit;
                    if (profit > 0) {
                        result.good++;
                    } else if (profit < 0) {
                        result.bad++;
                    }
                    debt = 0;
                    break;
            }
        }

        return result;
    }

    // report on the transactions that have made
    get transactions() {
        const self = this;
        return self._transactions;
    }

    // gets transactions from the order feed to resolve against what it is desired
    set transaction(log) {
        // not necessary to be implemented for the simulator
    }

    // price updates are important for STOP-LOSS, MAX-LOSS, ERRONEOUS
    update(priceInTime) {
        const self = this;

        // pass to the strategy
        const promise = self.options.strategy.update(priceInTime);

        // execute the intent
        promise.then(() => {
            const intent = self.options.strategy.intent;
            switch (intent.type) {
                case "buy":
                    self.buy(self.options.strategy, intent.price, intent.profit);
                    break;
                case "sell":
                    self.sell(self.options.strategy, intent.price);
                    break;
            }
        });
        
        return promise;
    }

    constructor(options) {
        const self = this;

        // options
        assert.ok(options.code, "You must specify the coin code to the Simulator.");
        assert.ok(options.funds, "You must provide some funds to the Simulator.");
        assert.ok(options.fee, "You must provide the fee as a percent to the Simulator.");
        assert.ok(options.strategy, "You must specify a strategy.");
        self.options = options;
        
        // variables
        self.funds = options.funds;
        self.coins = 0;
        self._transactions = [];

    }

}