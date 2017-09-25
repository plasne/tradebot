
const assert = require('assert');
const Manager = require("./Manager.js");

// at some point, there should be a way to allocate more funds or take funds
// put caps on min/max price
// where to put mode changes?
// don't allow buy/sell when pending (not specifically relevant here)
// add a max loss

module.exports = class SimulationManager extends Manager {
    // this handler is designed to take a range of data and a strategy to
    // score how much money it could have made over that time period, it has
    // the following characteristics:
    // 1. track how much money has been made
    // 2. track all the transactions

    // the strategy wants to buy, it will inform regarding the expected profit
    buy(strategy, intent) {
        const self = this;

        // if there is no price, assume a market buy
        const price = intent.price || self.last.price;

        // calculate fees and count
        const fee = self.funds * self.options.fee;
        const count = (self.funds - fee - 10) / price;

        // see if buying is appropriate
        if (count * price < self.options.minbuy) {
            // below minimum buy
        } else {

            // decrement funds, increment coins
            self.funds -= (count * price);
            self.coins += count;

            // record the transaction
            self._transactions.push({
                type: "buy",
                ts: intent.ts,
                coin: self.options.code,
                strategy: strategy.name,
                number: count,
                price: price,
                total: (count * price)
            });

            console.log("bought (" + intent.reason + ") " + count + " @ " + price + " = " + (count * price) + " on " + intent.ts);
        }

    }

    // the strategy wants to sell
    sell(strategy, intent) {
        const self = this;
        const count = self.coins;
        if (count > 0) {

            // if there is no price, assume a market sell
            const price = intent.price || self.last.price;

            // increment funds, decrement coins
            self.funds += (count * price);
            self.coins = 0;

            // record the transaction
            self._transactions.push({
                type: "sell",
                ts: intent.ts,
                coin: self.options.code,
                strategy: strategy.name,
                number: count,
                price: price,
                total: (count * price)
            });

            console.log("sold (" + intent.reason + ") " + count + " @ " + price + " = " + (count * price) + " on " + intent.ts);
        }
    }

    // report on the profit that has been made
    get calc () {
        const self = this;
        const result = {
            profit: 0,
            value: 0,
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

        result.value = (self.coins * self.last.price) + self.funds;

        return result;
    }

    // gets transactions from the order feed to resolve against what it is desired
    set transaction(log) {
        // not necessary to be implemented for the simulator
    }

    // price updates are important for STOP-LOSS, MAX-LOSS, ERRONEOUS
    update(priceInTime) {
        return super.update(priceInTime);
    }

    constructor(options) {
        super(options);
    }

}