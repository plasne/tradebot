
// variant that doesn't sell at a loss
// stop putting in very small buy orders

//const Strategy = require("./strategy.js");
const assert = require('assert');
const Window = require("./Window.js");

module.exports = class RollingMidpointStrategy {
    // this strategy has the following characteristics:
    // 1. "think" every to estimate a midpoint                      default  4 hours
    // 2. "consider" past midpoints over a period of time
    //   a. a% weight on average of past "consider" period          default  5/15
    //   b. b% weight on average of 4x past "consider" period       default  4/15
    //   c  c% weight on average of 16x past "consider" period      default  3/15
    //   d. d% weight on average of 64x past "consider" period      default  2/15
    //   e. e% weight on average of 256x past "consider" period     default  1/15
    // 3. try to buy at range/2 dollars below the midpoint
    // 4. try to sell at range/2 dollars above the midpoint

    get score() {
        // this needs to return from the database for the last scoring session
        return 100;
    }

    // this is called when there is a new price
    update(priceInTime) {
        const self = this;
        const promises = [];

        // determine if it needs to think or update intent
        if (self.last == null || self.last.ts.getTime() + self.options.think < priceInTime.ts.getTime()) {

            // think()
            const promise = self.think(priceInTime);
            promises.push(promise);
            self.last = priceInTime;

        } else {

            // establish an intent based on this new data
            const buyAt = self.midpoint - (self.options.range / 2);
            const sellAt = self.midpoint + (self.options.range / 2);
            if (priceInTime.price < buyAt) {
                const profit = (sellAt - buyAt);
                const adjusted = (priceInTime.price + priceInTime.price * self.options.adjustment);
                self.intent = {
                    type: "buy",
                    price: adjusted,
                    profit: profit,
                    since: new Date() 
                };
            } else if (priceInTime.price > sellAt) {
                const adjusted = (priceInTime.price - priceInTime.price * self.options.adjustment);
                self.intent = {
                    type: "sell",
                    price: adjusted,
                    since: new Date() 
                };
            } else if (self.intent.type != "hold") {
                self.intent = {
                    type: "hold",
                    since: new Date()
                };
            }

        }
        return Promise.all(promises);
    }

    // this preloads a data set of all the data it will need for thinking
    //   NOTE: this is primarily intended to speed up simulations
    cache(start, end) {
        const self = this;
        const offset = new Date(start.getTime() - self.options.consider * 4 * 5);
        self._cache = new Window({
            code: self.options.code,
            start: offset,
            end: end
        });
        return self._cache.load();
    }

    // this is called to tell the strategy that it should figure out what to do
    think(priceInTime) {
        const self = this;
        const promises = [];

        // figure out a target midpoint
        let midpoint = 0;
        let consider = self.options.consider;
        for (let i = 0; i < 5; i++) {
            const window = new Window({
                code: self.options.code,
                start: new Date(priceInTime.ts.getTime() - consider),
                end: priceInTime.ts
            });
            if (self._cache) window.from(self._cache);
            const promise = window.calc();
            promises.push(promise);
            promise.then(calc => {
                const bucket = String.fromCharCode(i + 97); // a, b, c, d, e
                if (self.options[bucket] > 0) {
                    midpoint += ( calc.avg * self.options[bucket] );
                }
            }, error => {
                console.error(`DayTradeLimit.think(): ${error}`);
            });
            consider *= 4;
        }
        
        // record the midpoint
        return Promise.all(promises).then(() => {
            self.midpoint = midpoint;
            console.log(priceInTime.ts + " " + self.midpoint);
        });
    }

    constructor(options) {
        const self = this;
        
        // options
        assert.ok(options.name, "You must specify a name.");
        assert.ok(options.code, "You must specify a code.");
        assert.ok(options.range, "You must specify a range.");
        options.type = (options.type || "normal");
        options.think = (options.think || 4 * 60 * 60 * 1000);
        options.consider = (options.consider || 4 * 60 * 60 * 1000);
        options.a = (options.a != null) ? options.a : 5/15;
        options.b = (options.b != null) ? options.b : 4/15;
        options.c = (options.c != null) ? options.c : 3/15;
        options.d = (options.d != null) ? options.d : 2/15;
        options.e = (options.e != null) ? options.e : 1/15;
        options.adjustment = (options.adjustment != null) ? options.adjustment : 0.00025;
        self.options = options;

        // variables
        self.intent = {
            type: "hold",
            since: new Date()
        };

    }

}