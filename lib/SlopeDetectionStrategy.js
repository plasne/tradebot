
const assert = require('assert');
const Window = require("./Window.js");
const Strategy = require("./Strategy.js");

Array.prototype.isSubset = function(sub) {
    const full = this;
    for (let o of sub) {
        if (full.indexOf(o) < 0) return false;
    }
    return true;
}

module.exports = class SlopeDetectionStrategy extends Strategy {
    // this strategy has the following characteristics:
    // 1. track flux and chg using a rolling window
    // 2. the period for that window is defined as "slopePeriod"    default  4 hours
    // 3. if "flux" exceeds a threshold, trigger falling            default  1%
    // 4. if "chg" exceeds a threshold, trigger falling             default  -1%
    // 5. falling triggers a sell order of all assets
    // 6. track flux and chg using a rolling window
    // 7. the period for that window is defined as "stablePeriod"   default  48 hours
    // 8. the window is calculated every "stableChecks" period      default  2 hours

    get period() {
        return this._options.period;
    }

    get periods() {
        return this._options.periods;
    }

    get scale() {
        return this._options.scale;
    }

    get windows() {
        return this._windows;
    }
    set windows(value) {
        this._windows = value;
    }

    get cache() {
        return this._cache;
    }
    set cache(value) {
        this._cache = value;
    }

    // this preloads a data set of all the data it will need for updates
    //   NOTE: this is primarily intended to speed up simulations
    load(start, end) {
        const self = this;

        // max period
        let max = Math.pow(2, self.periods) * self.period;

        // load the cache
        self.cache = new Window({
            code: self.code,
            inMemory: true,
            start: new Date(start.getTime() - max),
            end: end
        });
        return self.cache.load();

    }

    // this is called when there is a new price
    update(priceInTime) {
        const self = this;
        return new Promise((resolve, reject) => {
            const promises = [];

            // process the parent
            promises.push( super.update(priceInTime) );

            // update the windows
            for (let window of self.windows) {
                window.push(priceInTime);
                window.end = priceInTime.ts;
                promises.push( window.calc() );
            }

            // wait until done
            Promise.all(promises).then(responses => {
                const intents = responses[0];

                // count the number of rising, falling, and stable periods
                let rising = 0;
                let falling = 0;
                let stable = 0;
                for (let i = 1; i < responses.length; i++) {
                    const calc = responses[i];
                    if (calc.chgph > 0.01) {
                        rising++;
                    } else if (calc.chgph < -0.01) {
                        falling++;
                    } else {
                        stable++;
                    }
                }

                if (rising > falling && rising > stable && self.intent.type != "buy") {
                    intents.push({
                        type: "buy",
                        reason: "rising",
                        price: priceInTime.price,
                        ts: priceInTime.ts
                    });
                } else if (falling > rising && falling > stable && self.intent.type != "sell") {
                    intents.push({
                        type: "sell",
                        reason: "falling",
                        price: priceInTime.price,
                        ts: priceInTime.ts
                    });
                } else if (self.intent.type != "defer") {
                    intents.push({
                        type: "defer",
                        ts: new Date()
                    });
                }

                //console.log( priceInTime.ts + " " + priceInTime.price + " r:" + rising + " f:" + falling + " s:" + stable );
                resolve(intents);

            }, error => {
                reject(error);
            });
        
        });
    }

    constructor(options) {
        super(options);
        const self = this;
        
        // options
        assert.ok(options.period, "You must specify a period.");
        options.periods = (options.periods != null) ? options.periods : 1;

        // windows
        self.windows = [];
        for (let i = 0; i < options.periods; i++) {
            const window = new Window({
                code: options.code,
                inMemory: true,
                isRolling: true,
                period: Math.pow(2, i) * options.period
            });
            self.windows.push(window);
        }

    }

}