
const assert = require('assert');

module.exports = class Strategy {

    get name() {
        return this._options.name;
    }

    get code() {
        return this._options.code;
    }

    get score() {
        // this needs to return from the database for the last scoring session
        return 100;
    }

    get intent() {
        return this._intent;
    }
    set intent(value) {
        this._intent = value;
    } 

    get manager() {
        return this._manager;
    }

    introduce(manager) {
        this._manager = manager;
    }

    constructor(options) {
        const self = this;

        // options
        assert.ok(options.name, "You must specify a name.");
        assert.ok(options.code, "You must specify a coin code.");
        self._options = options;

        // variables
        self.intent = {
            type: "defer",
            ts: new Date()
        };

    }

}