
const modes = {
    LEARNING: "learning",
    DAYTRADE: "daytrade",
    GAINING: "gaining",
    LOSING: "losing"
}

// WHEN daytrade, look for daily high/lows

// WHEN gaining, buy and hold
//   consider selling as approach expected high

// WHEN losing, sell and wait

module.exports = class Strategy {

    // this is called to see if the mode should be changed
    identifyMode() {


    }

    start() {
        const self = this;
        self._interval = setInterval(() => {
            identifyMode();

        }, 60 * 1000); // every 1 min
    }

    stop() {
        const self = this;
        clearInterval(self._interval);
    }

    constructor() {
        this.mode = modes.LEARNING;
    }

}