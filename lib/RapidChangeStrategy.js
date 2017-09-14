
// this doesn't seem to ever trigger
// change options to _options; add properties

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

module.exports = class RapidChangeStrategy extends Strategy {
    // this strategy has the following characteristics:
    // 1. track flux and chg using a rolling window
    // 2. the period for that window is defined as "slopePeriod"    default  4 hours
    // 3. if "flux" exceeds a threshold, trigger falling            default  1%
    // 4. if "chg" exceeds a threshold, trigger falling             default  -1%
    // 5. falling triggers a sell order of all assets
    // 6. track flux and chg using a rolling window
    // 7. the period for that window is defined as "stablePeriod"   default  48 hours
    // 8. the window is calculated every "stableChecks" period      default  2 hours

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

        // expand to include windows
        for (let window of self.windows) {
            if (window.start < start) start = window.start;
            if (window.end > end) end = window.end;
        }

        // load the cache
        self.cache = new Window({
            code: self.code,
            start: start,
            end: end
        });
        return self.cache.load();
    }

    // this is called when there is a new price
    update(priceInTime) {
        const self = this;

        // update the windows
        const promises = [];
        for (let window of self.windows) {
            window.push(priceInTime);
            window.setStartEnd(priceInTime.ts);
            const promise = window.calc().then(calc => {
                window.triggered = window.isTriggered(calc.chg);
                //if (window.triggered && window._options.to === "stable") console.log("TRIGGERED: " + window.name + " " + calc.chg);
            }, error => {
                window.triggered = null;
                console.log("there was an error in calculating the windows in RapidChangeStrategy.");
            });
            promises.push(promise);
        }

        // wait until done
        return Promise.all(promises).then(() => {

            // group
            const falling = self.windows.filter(window => window._options.to === "fall");
            const rising = self.windows.filter(window => window._options.to === "rise");
            const stable = self.windows.filter(window => window._options.to === "stable");
            const triggered = self.windows.filter(window => window.triggered);

            // falling, rising, or stable
            if (triggered.isSubset(falling)) {
                if (self.intent.type !== "falling") console.log("all windows are falling.");
                self.intent = {
                    type: "falling",
                    ts: priceInTime.ts
                };
            } else if (triggered.isSubset(rising)) {
                if (self.intent.type !== "rising") console.log("all windows are rising.");
                self.intent = {
                    type: "rising",
                    ts: priceInTime.ts
                };
            } else if (triggered.isSubset(stable)) {
                if (self.intent.type !== "defer") console.log("all windows are stable.");
                self.intent = {
                    type: "defer",
                    ts: priceInTime.ts
                };
            }

        });
        
    }

    constructor(options) {
        super(options);
        const self = this;
        
        // create the windows
        assert.ok(options.windows, "You must specify some windows.");        
        self.windows = [];
        for (let parameters of options.windows) {
            const window = new Window({
                name: parameters.to + ":" + parameters.period,
                to: parameters.to,
                code: options.code,
                inMemory: true,
                isRolling: false
            });
            window.setStartEnd = (ts) => {
                window.end = ts;
                window.start = new Date(ts - parameters.period);
            };
            window.isTriggered = (chg) => {                
                switch (parameters.to) {
                    case "fall":
                        return (chg <= parameters.chg);
                    case "rise":
                        return (chg >= parameters.chg);
                    case "stable":
                        return (-parameters.chg < chg && chg < parameters.chg);
                }
            };
            self.windows.push(window);
        }

    }

}