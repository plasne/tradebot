
// references
const config = require("config");
const cmd = require("commander");
const ipc = require("node-ipc");
const mysql = require("mysql");
const request = require("request-promise");
const Promise = require("bluebird");

// libraries
const Window = require("./lib/Window.js");

// create a connection pool to the database
global.pool = mysql.createPool({
    host: config.get("db.host"),
    port: config.get("db.port"),
    user: config.get("db.user"),
    password: config.get("db.password"),
    database: config.get("db.name")
});

// setup command line arguments
cmd
    .version("0.1.0")
    .option("--db <value>", "specifies the name of the database")
    .option("--generate <value>", "populates the database with a variety of strategies")
    .option("--score", "scores all the models on the last 3 months of data");

// default the database
if (!cmd.db) cmd.db = config.get("db.name");

// show initialization commands
cmd
    .command("init")
    .description("Describes any initialization tasks.")
    .action(_ => {
        console.log("To create a user on MySQL:")
        console.log("  CREATE USER 'user'@'host' IDENTIFIED BY 'password';");
        console.log("  GRANT ALL PRIVILEGES ON *.* TO 'user'@'host';");
    });

// function to run a single query command
const run = async (query, values, db) => new Promise((resolve, reject) => {
    const connection = (db || global.pool);
    connection.query(query, values, (error, results, fields) => {
        if (!error) {
            resolve(results);
        } else {
            reject(error);
        }
    });
});

// create the database and schema
cmd
    .command("create")
    .description("Create a database.")
    .action(_ => {

        // create an async function and run it
        const create = async function() {

            // connect to the database server
            const db = mysql.createPool({
                host: config.get("db.host"),
                port: config.get("db.port"),
                user: config.get("db.user"),
                password: config.get("db.password")
            });

            // run all commands in sequence
            try {
                //await run(`CREATE DATABASE ${cmd.db};`, null, db);
                await run(`USE ${cmd.db};`, null, db);
                //await run("CREATE TABLE coinprice (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, ts TIMESTAMP, code VARCHAR(8), price DECIMAL(13,4));", null, db);
                //await run("CREATE TABLE models (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, code VARCHAR(8), name VARCHAR(255), strategies TEXT, score INT, ts TIMESTAMP)", null, db);
                await run("CREATE TABLE orders (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, exchange VARCHAR(50), guid VARCHAR(50), code VARCHAR(8), type VARCHAR(20), volume DECIMAL(13,4), price DECIMAL(13,4), ts TIMESTAMP)", null, db);
                console.log("Database and tables created.");
            } catch (ex) {
                console.error(ex);
            } finally {
                db.end();
            }

        };
        create();

    });

// populate the database with data from a specific data set
cmd
    .command("populate <query>")
    .description("Populate the database with a specified dataset.")
    .action(query => {

        // the function to fetch the data
        const fetch = (url) => new Promise((resolve, reject) => {
            console.log(`fetching ${url}...`);
            request.get({
                url: url,
                json: true
            }, (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    console.log(`${body.prices.length} prices found.`);
                    resolve(body.prices);
                } else if (error) {
                    reject(error);
                } else {
                    reject(new Error(`could not read the dataset: ${response.statusMessage}`));
                }
            });
        });

        // the function to build queries
        const build = (code, prices) => new Promise(resolve => {
            const queries = [];
            prices.forEach(price => {
                queries.push([
                    "INSERT INTO coinprice SET ?;",
                    {
                        ts: new Date(price[0]),
                        code: code,
                        price: price[1]
                    }
                ]);
            });
            resolve(queries);
        });

        // determine the period
        const period = (() => {
            switch (cmd.populate) {
                case "1d": return "24%20Hour";
                case "1y": return "1%20Year";
                case "3m": return "3%20Month";
            }
        })();

        // run the job
        sync(function* () {
            const coins = [
                { code: "ETH", url: `https://ethereumprice.org/wp-content/themes/theme/inc/exchanges/json.php?cur=ethusd&ex=waex&time=${period}` },
                { code: "BTC", url: `https://ethereumprice.org/wp-content/themes/theme/inc/exchanges/json.php?cur=btcusd&ex=waex&time=${period}` }
            ];
            for (let coin of coins) {
                const prices = yield fetch(coin.url);
                const queries = yield build(coin.code, prices);
                for (let query of queries) {
                    yield run(...query);
                }
            }
            pool.end();
            console.log("data imported.");
        });

    });

// send a command to the locally running bot
function sendToBot(command) {
    return new Promise((resolve, reject) => {
        ipc.config.id = config.get("ipc.config");
        ipc.config.retry = 1500;
        ipc.config.stopRetrying = true;
        ipc.config.silent = true;
        const bot = config.get("ipc.bot");
        ipc.connectTo(bot, () => {
            ipc.of[bot].on("connect", () => {
                ipc.of[bot].emit("command", command);
                ipc.of[bot].on("reply", reply => {
                    ipc.disconnect(bot);
                    resolve(reply);
                });
            });
            ipc.of[bot].on("error", error => {
                reject(error);
            });
        });
    });
}

// gets the coin feed status from the locally running bot
cmd
    .command("status")
    .description("Gets the status of all feeds from the running bot.")
    .action(_ => {
        sendToBot("status").then(status => {
            console.log(status);
        }, error => {
            console.error(error);
        });
    });

// toggle debug on the locally running bot
cmd
    .command("debug")
    .description("Toggles the debug flag on the running bot.")
    .action(_ => {
        sendToBot("debug").then(debug => {
            console.log(debug);
        }, error => {
            console.error(error);
        });
    });

/*
// generates a bunch of models
if (cmd.generate) {
    sync(function* () {

        // get all currently generated models
        const rows = yield run("SELECT name FROM models;");
        console.log(`${rows.length} existing models found.`);

        // get the permutations
        switch (cmd.generate) {
            case "RMP": // RollingMidpointStrategy
                const permutations = RollingMidpointStrategy.permutations();
                console.log(`${permutations.length} permutations identified.`);
                let count = 0;
                for (let permutation of permutations) {
                    const row = rows.find(row => row.name === permutation.name);
                    if (row == null) {
                        yield run("INSERT INTO models SET ?", {
                            code: permutation.options.code,
                            name: permutation.options.name,
                            strategies: JSON.stringify([ permutation ]),
                            ts: new Date(new Date().getTime() - (10 * 365 * 24 * 60 * 60 * 1000) + 0) // 10 yrs ago + random
                        });
                        count++;
                    }
                }
                console.log(`${count} permutations stored.`);
                break;
        }

        // close the database connection
        global.pool.end();
    });

}

// trains and scores all the models
if (cmd.hasOwnProperty("score")) {
    sync(function* () {

        const st_ts = new Date();
        let days = 90;
        const start = new Date(new Date() - days * 24 * 60 * 60 * 1000);
        const end = new Date();

        const slope = new SlopeDetectionStrategy({
            name: "willy_coyote",
            code: "ETH",
            period: 2 * 60 * 60 * 1000,  // 2 hours
            periods: 3
        });
        yield slope.load(start, end);

        const trending = new TrendingStrategy({
            name: "bodacious_dinosaur",
            code: "ETH",
            period: 2 * 60 * 60 * 1000, // 2 hours
            rising: 0.01,
            falling: -0.01,
            maxhold: 21 * 24 * 60 * 60 * 1000 // 21 days
        });
        yield trending.load(start, end);

        const rapid = new RapidChangeStrategy({
            name: "cantankerous_hillbilly",
            code: "ETH",
            windows: [
                { to: "fall", period: 1 * 60 * 60 * 1000, chg: -0.02 },
                { to: "fall", period: 2 * 60 * 60 * 1000, chg: -0.04 },
                { to: "fall", period: 3 * 60 * 60 * 1000, chg: -0.05 },
                { to: "rise", period: 2 * 60 * 60 * 1000, chg: 0.02 },
                { to: "rise", period: 4 * 60 * 60 * 1000, chg: 0.04 },
                { to: "rise", period: 6 * 60 * 60 * 1000, chg: 0.05 },
                { to: "stable", period: 36 * 60 * 60 * 1000, chg: 0.01 }
            ]
        });
        yield rapid.load(start, end);
  
        const simulator = new SimulationManager({
            code: "ETH",
            funds: 33000,
            fee: 0.0025,
            strategy: slope
        });

        const window = new Window({
            code: "ETH",
            start: start,
            end: end
        });
        const pricesInTime = yield window.load();
        for (let priceInTime of pricesInTime) {
            yield simulator.update(priceInTime).catch(ex => {
                console.error(ex);
            });
        }
        const calc = simulator.calc;
        console.log("profit: " + calc.profit + ", value: " + calc.value + " (g:" + calc.good + " / b:" + calc.bad + "); per week: " + calc.profit / days * 7);

        global.pool.end();

        //console.log("simulation took: " + new Date().getTime() - st_ts.getTime());
    
    });
}
*/

cmd
    .command("buy")
    .description("Submits a buy.")
    .action(_ => {
        sendToBot("buy").then(buy => {
            console.log(buy);
        }, error => {
            console.error(error);
        });
    });

cmd
    .command("sell")
    .description("Submits a sell.")
    .action(_ => {
        sendToBot("sell").then(sell => {
            console.log(sell);
        }, error => {
            console.error(error);
        });
    });

cmd
    .command("cancel")
    .description("Cancels all orders.")
    .action(_ => {
        sendToBot("cancel").then(cancel => {
            console.log(cancel);
        }, error => {
            console.error(error);
        });
    });

// parse all commands
cmd.parse(process.argv);