
const assert = require('assert');

// values: { price: Number(), ts: Date() }

module.exports = class Window {

    get name() {
        return this._options.name;
    }

    get code() {
        return this._options.code;
    }

    get period() {
        return this._options.period;
    }

    get inMemory() {
        return this._options.inMemory;
    }

    get isRolling() {
        return this._options.isRolling;
    }

    get start() {
        const self = this;
        if (self._start) {
            return self._start;
        } else if (self._options.start) {
            return self._options.start;
        } else if (self.isRolling) {
            return new Date(self.end - self.period);
        } else {
            return new Date();
        }
    }
    set start(value) {
        this._start = value;
    }

    get end() {
        const self = this;
        if (self._end) {
            return self._end;
        } else if (self._options.end) {
            return self._options.end;
        } else {
            return new Date();
        }
    }
    set end(value) {
        this._end = value;
    }

    // this trims any values that aren't between the start and end
    trim() {
        const self = this;
        const keep = [];
        const start = self.start;
        const end = self.end;
        for (let value of self.values) {
            if (value.ts >= start && value.ts <= end) {
                keep.push(value);
            }
        }
        self.values = keep;
    }

    // gets the last value
    last() {
        const self = this;
        console.log("self.values = " + self.values.length);
        self.trim();
        console.log("self.values = " + self.values.length);
        return (self.values.length > 0) ? self.values[self.values.length - 1] : null;
    }

    _calcFromMemory() {
        const self = this;
        return new Promise(resolve => {

            let sum = 0;
            const output = {
                volume: 0,
                min: Number.MAX_SAFE_INTEGER,
                max: Number.MIN_SAFE_INTEGER,
                first: Number.MIN_SAFE_INTEGER,
                last: Number.MIN_SAFE_INTEGER
            };

            self.trim();
            for (let value of self.values) {
                sum += value.price;
                output.volume++;
                if (value.price < output.min) output.min = value.price;
                if (value.price > output.max) output.max = value.price;
                if (output.first == Number.MIN_SAFE_INTEGER) output.first = value.price;
                output.last = value.price;
            }

            output.avg = (sum / output.volume);
            output.flux = (output.max - output.min) / output.avg;
            output.chg = (output.last - output.first) / output.first;

            // normalize
            const hours = (self.end.getTime() - self.start.getTime()) / (60 * 60 * 1000);
            output.fluxph = output.flux / hours;
            output.chgph = output.chg / hours;

            resolve(output);
        });
    }

    _calcFromDatabase() {
        const self = this;
        return new Promise((resolve, reject) => {
            global.pool.query("SELECT COUNT(*) as volume, AVG(price) as avg, MIN(price) as min, MAX(price) as max, (SELECT f.price FROM coinprice f WHERE f.ts BETWEEN ? AND ? AND f.code=? ORDER BY f.ts ASC LIMIT 1) as first, (SELECT l.price FROM coinprice l WHERE l.ts BETWEEN ? AND ? AND l.code=? ORDER BY l.ts DESC LIMIT 1) as last FROM coinprice WHERE ts BETWEEN ? AND ? AND code=?;",
            [ self.start, self.end, self.code, self.start, self.end, self.code, self.start, self.end, self.code ],
            (error, results, fields) => {
                if (!error) {
                    const output = results[0];
                    output.flux = (output.max - output.min) / output.avg;
                    output.chg = (output.last - output.first) / output.first;
                    resolve(output);
                } else {
                    reject(error);
                }
            });
        });
    }

    calc() {
        const self = this;
        if (self.inMemory) {
            return self._calcFromMemory();
        } else {
            return self._calcFromDatabase();
        }
    }

    // copies all values from another window
    //  NOTE: typically you do this because the new window is a subset
    from(window) {
        const self = this;
        self.values = window.values;
        // should mark as in-memory?
        self.trim();
    }

    // loads a window from the database
    load() {
        const self = this;
        return new Promise((resolve, reject) => {
            global.pool.query("SELECT ts, price FROM coinprice WHERE ts BETWEEN ? AND ? AND code=? ORDER BY ts ASC;",
            [ self.start, self.end, self.code ],
            (error, results, fields) => {
                if (!error) {
                    self.values = results;
                    // should mark as in-memory?
                    resolve(results);
                } else {
                    reject(error);
                }
            });
        });
    }

    push(priceInTime) {
        const self = this;
        self.values.push(priceInTime);
    }

    // chg to options
    constructor(options) {
        const self = this;

        // options
        assert.ok(options.code, "You must specify a coin code for a window.");
        options.inMemory = (options.inMemory || false);
        options.isRolling = (options.isRolling || false);
        if (options.isRolling) {
            assert.ok(options.period, "You must specify a period for a rolling window.");
        } else {
            //assert.ok(options.start, "You must specify a start timestamp for a fixed window.");
            //assert.ok(options.end, "You must specify a start timestamp for a fixed window.");
        }
        self._options = options;
        
        // variables
        self.values = [];

    }
}