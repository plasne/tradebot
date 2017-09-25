
https://hub.docker.com/r/mysql/mysql-server/

docker run --name mysql -v c:/volumes/mysql:/var/lib/mysql -v c:/volumes/mysql.cnf:/etc/my.cnf -e MYSQL_ROOT_PASSWORD=<pw> --publish 3306:3306 -d mysql/mysql-server:latest

docker exec -it mysql mysql -uroot -p --socket /tmp/mysql.sock

## Revised

### TODO

* stop-loss
* trailing stop-loss
* unrealized report for taxes



## Strategies

* manual trades - to see how I scored
* stop-loss
* best - to evaluate efficacy
* Azure ML
* trending

## TODO

* clean up unhandled errors
* support manual trades
* support GDAX
* record trade data
* calculate taxes
* build dashboard
