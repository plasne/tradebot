
const assert = require('assert');
const Window = require("./Window.js");
const Strategy = require("./Strategy.js");

module.exports = class RollingMidpointStrategy extends Strategy {
    // this strategy has the following characteristics:
    // 1. "think" every so often to estimate a midpoint             default  4 hours
    // 2. "consider" past midpoints over a period of time
    //   a. a% weight on average of past "consider" period          default  5/15
    //   b. b% weight on average of 4x past "consider" period       default  4/15
    //   c  c% weight on average of 16x past "consider" period      default  3/15
    //   d. d% weight on average of 64x past "consider" period      default  2/15
    //   e. e% weight on average of 256x past "consider" period     default  1/15
    // 3. try to buy at range/2 dollars below the midpoint
    // 4. try to sell at range/2 dollars above the midpoint
    // 5. it will hold for favorable trades for a "maxhold"

    get range() {
        return this._options.range;
    }
    
    get midpoint() {
        return this._midpoint;
    }
    set midpoint(value) {
        this._midpoint = value;
    }

    get thinktime() {
        return this._options.thinktime;
    }

    get consider() {
        return this._options.consider;
    }

    get adjustment() {
        return this._options.adjustment;
    }

    get maxhold() {
        return this._options.maxhold;
    }

    get last() {
        return this._last;
    }
    set last(value) {
        this._last = value;
    }

    get cache() {
        return this._cache;
    }
    set cache(value) {
        this._cache = value;
    }

    isFavorableToBuyAt(priceInTime) {
        const self = this;

        // make sure the price is right
        const buyAt = self.midpoint - (self.range / 2);
        if (priceInTime.price > buyAt) return false;

        // make sure the transaction isn't worse than what was last done
        const lastTransaction = self.manager.lastTransaction;
        if (lastTransaction && lastTransaction.type === "sell") {
            if (lastTransaction.ts.getTime() + self.maxhold < priceInTime.ts.getTime()) {
                //console.log("will allow unfavorable buy because of maxhold.");
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

        // make sure the price is right
        const sellAt = self.midpoint + (self.range / 2);
        if (priceInTime.price < sellAt) return false;

        // make sure the transaction isn't worse than what was last done
        const lastTransaction = self.manager.lastTransaction;
        if (lastTransaction && lastTransaction.type === "buy") {
            if (lastTransaction.ts.getTime() + self.maxhold < priceInTime.ts.getTime()) {
                //console.log("will allow unfavorable sell because of maxhold.");
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

        // determine if it needs to think or update intent
        if (self.last == null || self.last.ts.getTime() + self.thinktime < priceInTime.ts.getTime()) {

            // think()
            const promise = self.think(priceInTime);
            promises.push(promise);
            self.last = priceInTime;

        } else {

            // establish an intent based on this new data
            if (self.isFavorableToBuyAt(priceInTime)) {
                const adjusted = (priceInTime.price + priceInTime.price * self.adjustment);
                self.intent = {
                    type: "buy",
                    price: adjusted,
                    profit: self.range,
                    ts: priceInTime.ts
                };
            } else if (self.isFavorableToSellAt(priceInTime)) {
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

        }
        return Promise.all(promises);
    }

    // this preloads a data set of all the data it will need for thinking
    //   NOTE: this is primarily intended to speed up simulations
    load(start, end) {
        const self = this;
        const offset = new Date(start.getTime() - self.consider * 4 * 5);
        self.cache = new Window({
            code: self.code,
            start: offset,
            end: end
        });
        return self.cache.load();
    }

    // this is called to tell the strategy that it should figure out what to do
    think(priceInTime) {
        const self = this;
        const promises = [];

        // figure out a target midpoint
        let midpoint = 0;
        let consider = self.consider;
        for (let i = 0; i < 5; i++) {
            const window = new Window({
                code: self.code,
                start: new Date(priceInTime.ts.getTime() - consider),
                end: priceInTime.ts
            });
            if (self._cache) window.from(self._cache);
            const promise = window.calc();
            promises.push(promise);
            promise.then(calc => {
                const bucket = String.fromCharCode(i + 97); // a, b, c, d, e
                if (self._options[bucket] > 0) {
                    midpoint += ( calc.avg * self._options[bucket] );
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
        assert.ok(options.range, "You must specify a range.");
        options.thinktime = (options.thinktime || 4 * 60 * 60 * 1000);
        options.consider = (options.consider || 4 * 60 * 60 * 1000);
        options.a = (options.a != null) ? options.a : 5/15;
        options.b = (options.b != null) ? options.b : 4/15;
        options.c = (options.c != null) ? options.c : 3/15;
        options.d = (options.d != null) ? options.d : 2/15;
        options.e = (options.e != null) ? options.e : 1/15;
        options.adjustment = (options.adjustment != null) ? options.adjustment : 0.00025;
        options.maxhold = (options.maxhold != null) ? options.maxhold : options.consider;

    }

}