
const assert = require('assert');
const Window = require("./Window.js");
const Strategy = require("./Strategy.js");

module.exports = class Trending extends Strategy {
    // this strategy has the following characteristics:
    // 1. if trending up, buy
    // 2. if trending down, sell
    // 3. it can hold for favorable trades for a "maxhold"

    get window() {
        return this._window;
    }
    set window(value) {
        this._window = value;
    }
    
    get period() {
        return this._options.period;
    }

    get rising() {
        return this._options.rising;
    }

    get falling() {
        return this._options.falling;
    }

    get maxhold() {
        return this._options.maxhold;
    }

    get adjustment() {
        return this._options.adjustment;
    }

    get cache() {
        return this._cache;
    }
    set cache(value) {
        this._cache = value;
    }

    isFavorableToBuyAt(priceInTime) {
        const self = this;

        // make sure the transaction isn't worse than what was last done
        const lastTransaction = self.manager.lastTransaction;
        if (lastTransaction && lastTransaction.type === "sell") {
            if (lastTransaction.ts.getTime() + self.maxhold < priceInTime.ts.getTime()) {
                console.log("will allow unfavorable buy because of maxhold.");
            } else if (lastTransaction.price > (priceInTime.price + priceInTime.price * self.manager.fee)) {
                //console.log("will allow buy because sell price was higher (" + lastTransaction.price + ").");
            } else {
                return false;
            }
        }

        return true;
    }

    isFavorableToSellAt(priceInTime) {
        const self = this;

        // make sure the transaction isn't worse than what was last done
        const lastTransaction = self.manager.lastTransaction;
        if (lastTransaction && lastTransaction.type === "buy") {
            if (lastTransaction.ts.getTime() + self.maxhold < priceInTime.ts.getTime()) {
                console.log("will allow unfavorable sell because of maxhold.");
            } else if (lastTransaction.price < (priceInTime.price + priceInTime.price * self.manager.fee)) {
                //console.log("will allow sell because buy price was lower (" + lastTransaction.price + ").");
            } else {
                return false;
            }
        }

        return true;
    }

    // this is called when there is a new price
    update(priceInTime) {
        const self = this;
        const promises = [];

        // create a window
        self.window.start = new Date(priceInTime.ts - self.period);
        self.window.end = priceInTime.ts;
        self.window.push(priceInTime);
        return self.window.calc().then(calc => {

            // attempt to buy/sell if appropriate
            if (calc.chg > self.rising && self.isFavorableToBuyAt(priceInTime)) {
                const adjusted = (priceInTime.price + priceInTime.price * self.adjustment);
                self.intent = {
                    type: "buy",
                    price: adjusted,
                    profit: self.range,
                    ts: priceInTime.ts
                };                
            } else if (calc.chg < self.falling && self.isFavorableToSellAt(priceInTime)) {
                const adjusted = (priceInTime.price - priceInTime.price * self.adjustment);
                self.intent = {
                    type: "sell",
                    price: adjusted,
                    ts: priceInTime.ts
                };
            } else if (self.intent.type != "defer") {
                self.intent = {
                    type: "defer",
                    ts: priceInTime.ts
                };
            }

        }, error => {
            window.triggered = null;
            console.log("there was an error in calculating the window in TrendingStrategy.");
        });

    }

    // this preloads a data set of all the data it will need for the window
    //   NOTE: this is primarily intended to speed up simulations
    load(start, end) {
        const self = this;
        const offset = new Date(start.getTime() - self.period);
        self.cache = new Window({
            code: self.code,
            start: offset,
            end: end
        });
        return self.cache.load();
    }

    static permutations() {
        const list = [];

        // all code types
        const codes = [ "ETH", "BTC" ];
        for (let code of codes) {

            // the range of values
            let ranges;
            switch (code) {
                case "ETH":
                    ranges = [ 200, 180, 160, 140, 120, 100, 80, 60, 40, 30, 20, 16, 14, 10, 9, 8, 7, 6, 5, 4 ];
                    break;
                case "BTC":
                    ranges = [ 2000, 1500, 1000, 900, 800, 700, 600, 500, 400, 300, 200 ];
                    break;
            }
            const weights = [
                { name: "A", a: 1, b: 0, c: 0, d: 0, e: 0 },
                { name: "B", a: 2/3, b: 1/3, c: 0, d: 0, e: 0 },
                { name: "C", a: 3/5, b: 2/5, c: 1/5, d: 0, e: 0 },
                { name: "D", a: 5/15, b: 4/15, c: 3/15, d: 2/15, e: 1/15 }
            ];
            const thinktimes = [ 288, 144, 72, 36, 24, 16, 8, 4, 2, 1 ];
            const considers = [ 288, 144, 72, 36, 24, 16, 8, 4, 2, 1 ];
            const maxholds = [ 2304, 1152, 576, 288, 144, 72, 36, 24, 16, 8, 4 ];
        
            // generate the permutations
            for (let range = 0; range < ranges.length; range++) {
                for (let weight = 0; weight < weights.length; weight++) {
                    for (let thinktime = 0; thinktime < thinktimes.length; thinktime++) {
                        for (let consider = 0; consider < considers.length; consider++) {
                            for (let maxhold = 0; maxhold < maxholds.length; maxhold++) {
        
                                // create the permutation
                                const permutation = {
                                    strategy: "RollingMidpointStrategy",
                                    options: {
                                        name: `RMP.${code}.${ranges[range]}.${weights[weight].name}.${thinktimes[thinktime]}.${considers[consider]}.${maxholds[maxhold]}`,
                                        code: code,
                                        range: ranges[range],
                                        a: weights[weight].a,
                                        b: weights[weight].b,
                                        c: weights[weight].c,
                                        d: weights[weight].d,
                                        e: weights[weight].e,
                                        thinktime: thinktimes[thinktime] * 60 * 60 * 1000, // in hours
                                        consider: considers[consider] * 60 * 60 * 1000,    // in hours
                                        maxhold: maxholds[maxhold] * 60 * 60 * 1000        // in hours
                                    }
                                }
                                list.push(permutation);
                        
                            }
                        }
                    }
                }
            }

        }

        return list;
    }

    constructor(options) {
        super(options);
        const self = this;
        
        // options
        assert.ok(options.period, "You must specify a period.");
        assert.ok(options.rising, "You must specify a rising value.");
        assert.ok(options.falling, "You must specify a falling value.");
        options.adjustment = (options.adjustment != null) ? options.adjustment : 0.00025;
        options.maxhold = (options.maxhold != null) ? options.maxhold : 7 * 24 * 60 * 60 * 1000; // 1 week

        // create the window
        self.window = new Window({
            code: self.code,
            inMemory: true,
            isRolling: false
        });

    }

}