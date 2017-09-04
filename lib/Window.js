
const assert = require('assert');

module.exports = class Window {

    get start() {
        const self = this;
        if (self.options.isRolling) {
            return new Date(new Date().getTime() - self.options.period);
        } else {
            return self.options.start;
        }
    }

    get end() {
        const self = this;
        if (self.options.isRolling) {
            return new Date();
        } else {
            return self.options.end;
        }
    }

    get inMemory() {
        return this._inMemory;
    }

    set inMemory(value) {
        this._inMemory = value;
    }

    // this trims any values that aren't between the start and end
    trim() {
        const self = this;
        const keep = [];
        for (let value of self.values) {
            if (value.ts >= self.start && value.ts <= self.end) {
                keep.push(value);
            }
        }
        self.values = keep;
    }

    _calcFromMemory() {
        const self = this;
        return new Promise(resolve => {
            const now = new Date().getTime();

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
            output.flux = ((output.max - output.min) / output.avg * 100).toFixed(2) + "%";
            output.chg = ((output.last - output.first) / output.first * 100).toFixed(2) + "%";

            resolve(output);
        });
    }

    _calcFromDatabase() {
        const self = this;
        return new Promise((resolve, reject) => {
            global.pool.query("SELECT COUNT(*) as volume, AVG(price) as avg, MIN(price) as min, MAX(price) as max, (SELECT f.price FROM coinprice f WHERE f.ts BETWEEN ? AND ? AND f.code=? ORDER BY f.ts ASC LIMIT 1) as first, (SELECT l.price FROM coinprice l WHERE l.ts BETWEEN ? AND ? AND l.code=? ORDER BY l.ts DESC LIMIT 1) as last FROM coinprice WHERE ts BETWEEN ? AND ? AND code=?;",
            [ self.start, self.end, self.options.code, self.start, self.end, self.options.code, self.start, self.end, self.options.code ],
            (error, results, fields) => {
                if (!error) {
                    const output = results[0];
                    output.flux = ((output.max - output.min) / output.avg * 100).toFixed(2) + "%";
                    output.chg = ((output.last - output.first) / output.first * 100).toFixed(2) + "%";
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
        self.inMemory = self.inFull = true;
        self.trim();
    }

    // loads a window from the database
    load() {
        const self = this;
        return new Promise((resolve, reject) => {
            global.pool.query("SELECT ts, price FROM coinprice WHERE ts BETWEEN ? AND ? AND code=? ORDER BY ts ASC;",
            [ self.start, self.end, self.options.code ],
            (error, results, fields) => {
                if (!error) {
                    self.values = results;
                    self.inMemory = self.inFull = true;
                    resolve(results);
                } else {
                    reject(error);
                }
            });
        });
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
            assert.ok(options.start, "You must specify a start timestamp for a fixed window.");
            assert.ok(options.end, "You must specify a start timestamp for a fixed window.");
        }
        self.options = options;
        
        // variables
        self.inMemory = options.inMemory;
        self.isFull = !options.inMemory; // assume the database is full
        self.values = [];

    }
}