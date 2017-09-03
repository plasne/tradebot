
// references
const config = require("config");
const cmd = require("commander");
const ipc = require("node-ipc");
const mysql = require("mysql");
const request = require("request");

// create a connection pool to the database
const pool = mysql.createPool({
    host: config.get("db.host"),
    port: config.get("db.port"),
    user: config.get("db.user"),
    password: config.get("db.password")
});

// create a function that can process synchronously
//   see: http://www.tivix.com/blog/making-promises-in-a-synchronous-manner/
const sync = fn => {
    let iterator = fn();
    let loop = result => {
        !result.done && result.value.then(
            res => loop(iterator.next(res)),
            err => loop(iterator.throw(err))
        );
    };
    loop(iterator.next());
};

// setup command line arguments
cmd
    .version("0.1.0")
    .option("--init", "describes any initialization tasks")
    .option("--create", "create a database")
    .option("--db <value>", "specifies the name of the database")
    .option("--populate <value>", "populate the database with a specified dataset")
    .option("--status", "gets the feed status for all coins from a running bot")
    .option("--debug", "toggles the debug status of the running bot")
    .parse(process.argv);

// default the database
if (!cmd.db) cmd.db = config.get("db.name");

// show initialization commands
if (cmd.hasOwnProperty("init")) {
    console.log("To create a user on MySQL:")
    console.log("  CREATE USER 'user'@'host' IDENTIFIED BY 'password';");
    console.log("  GRANT ALL PRIVILEGES ON *.* TO 'user'@'host';");
}

// function to run a single query command
const run = (query, values) => new Promise((resolve, reject) => {
    pool.query(query, values, (error, results, fields) => {
        if (!error) {
            resolve();
        } else {
            reject(error);
        }
    });
});

// create the database and schema
if (cmd.hasOwnProperty("create") && cmd.db) {

    // run all commands
    sync(function* () {
        yield run(`CREATE DATABASE ${cmd.db};`);
        yield run(`USE ${cmd.db};`);
        yield run("CREATE TABLE coinprice (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, ts TIMESTAMP, code VARCHAR(8), price DECIMAL(13,4));");
        pool.end();
        console.log("database and tables created.");
    });

}

// populate the database with data from a specific data set
if (cmd.populate && cmd.db) {

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
        yield run(`USE ${cmd.db};`);
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

}

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
if (cmd.hasOwnProperty("status")) {
    sendToBot("status").then(status => {
        console.log(status);
    }, error => {
        console.error(error);
    });
}

// toggle debug on the locally running bot
if (cmd.hasOwnProperty("debug")) {
    sendToBot("debug").then(debug => {
        console.log(debug);
    }, error => {
        console.error(error);
    });
}