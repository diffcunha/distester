'use strict';

var credentials = require('./credentials');

var Genetic = require('crp-genetic');

module.exports = Backtester;

/* Indicators */

function EMA(weight) {
    this.weight = weight;
    this.result = false;
    this.age = 0;

    this.update = function(price) {
        if(this.result === false) {
            this.result = price;
        }
        this.age++;
        this.calculate(price);
        return this.result;
    };

    this.calculate = function(price) {
        var k = 2 / (this.weight + 1);
        var y = this.result;
        this.result = price * k + y * (1 - k);
    };
}

function DEMA(config) {
    this.result = false;
    this.short = new EMA(config.short);
    this.long = new EMA(config.long);
    this.up = config.up;
    this.down = config.down;

    this.update = function(price) {
        this.short.update(price);
        this.long.update(price);
        this.calculateEMAdiff();
    };

    this.calculateEMAdiff = function() {
        var shortEMA = this.short.result;
        var longEMA = this.long.result;
        this.result = 100 * (shortEMA - longEMA) / ((shortEMA + longEMA) / 2);
    };

    this.check = function(currentTrend) {
        if(this.result > this.up) {
            return "up";
        } else if(this.result < this.down) {
            return "down";
        } 
        return currentTrend;
    };
}

function MACD(config) {
    this.diff = false;
    this.short = new EMA(config.short);
    this.long = new EMA(config.long);
    this.signal = new EMA(config.signal);
    this.up = config.up;
    this.down = config.down;

    this.update = function(price) {
        this.short.update(price);
        this.long.update(price);
        this.calculateEMAdiff();
        this.signal.update(this.diff);
        this.result = this.diff - this.signal.result;
    };

    this.calculateEMAdiff = function() {
        var shortEMA = this.short.result;
        var longEMA = this.long.result;
        this.diff = shortEMA - longEMA;
    };

    this.check = function(currentTrend) {
        if(this.result > this.up) {
            return "up";
        } else if(this.result < this.down) {
            return "down";
        } 
        return currentTrend;
    };
}

/* Utils */

function extractFee(amount) {
    amount *= 100000000;
//  amount *= 0.002; //this.fee;
    amount = Math.floor(amount);
    amount /= 100000000;
    return amount;
}

/* Main */

function Backtester(data) {
    this.indicators = [];

    this.data = data.candles;

    this.genetic = new Genetic(credentials, fitness, mutate, crossover, 2000, 50);
    this.genetic.functions([extractFee, EMA, DEMA, MACD]);
    this.genetic.scope({
        data: data.candles,
    });
    this.genetic.genome({
        dema: {
            weight: { min: 0, max: 100, step: 1, precision: 0 },
            short: { min: 1, max: 20, step: 0.01, precision: 2 },
            long: { min: 10, max: 30, step: 0.01, precision: 2 },
            up: { min: -1, max: 0, step: 0.001, precision: 3 },
            down: { min: 0, max: 1, step: 0.001, precision: 3 }
        },
        macd: {
            weight: { min: 0, max: 100, step: 1, precision: 0 },
            short: { min: 1, max: 20, step: 0.01, precision: 2 },
            long: { min: 10, max: 30, step: 0.01, precision: 2 },
            signal: { min: 1, max: 20, step: 0.1, precision: 1 },
            up: { min: -1, max: 0, step: 0.001, precision: 3 },
            down: { min: 0, max: 1, step: 0.001, precision: 3 }
        }
    });
}

// Backtester.prototype.run = function run(iterations, callback) {
//     var i = 0;
//     var self = this;
//     function cb() {
//         console.log("Iteration:" + i);
//         for(var j = 0; j < 10; j++) {
//             console.log(JSON.stringify(self.genetic.getSolution()[j], null, 2));
//         }
//         i++;
//         if(i < iterations) {
//             self.genetic.iteration(cb);
//         } else {
//             callback(self.genetic.getSolution()[0]);
//         }
//     }
//     this.genetic.iteration(cb);
// };

Backtester.prototype.iteration = function iteration(callback) {
    var self = this;
    this.genetic.iteration(function() {
        var bestGenome = self.genetic.getSolution()[0].data;

        // console.log(JSON.stringify(self.genetic.getSolution()[0], null, 2));

        var scope = {
            data: self.data,
            local: {
                trades: []
            }
        }
        var score = fitness(scope, bestGenome);
        callback({
            profit: score,
            trades: scope.local.trades
        });
    });
};

/* Genetic Functions */

function fitness($scope, genome) {
    var indicators = [];

    for(var gene in genome) {
        if(gene == "dema") {
            indicators.push({
                indicator: new DEMA({ short: genome.dema.short, long: genome.dema.long, down: genome.dema.down, up: genome.dema.up }),
                weight: genome.dema.weight
            });
        }
        if(gene == "macd") {
            indicators.push({
                indicator: new MACD({ short: genome.macd.short, long: genome.macd.long, signal: genome.macd.signal, down: genome.dema.down, up: genome.dema.up }),
                weight: genome.dema.weight
            });
        }
    }

    var asset = 0.0;
    var currency = 500.0;
    var trades = 0;

    var startBalance = currency + $scope.data[0].price * asset;

    var trend = 'none';
    var advice = 'none';
    for(var i = 0; i < $scope.data.length; i++) {
        var price = $scope.data[i].price;

        /* Update all indicators */
        for(var j = 0; j < indicators.length; j++) {
            indicators[j].indicator.update(price);
        }
        
        /* Compute the average trend */
        var sum = 0;
        var weightSum = 0;
        for(var j = 0; j < indicators.length; j++) {
            var check = indicators[j].indicator.check(trend);
            sum += indicators[j].weight * (check === 'up' ? 1 : -1);
            weightSum += indicators[j].weight;
        }
        var average = sum / weightSum;
        var indicatorTrend = average > 0 ? 'up' : average < 0 ? 'down' : 'none';
        
        /* Compute advice */
        if(indicatorTrend === 'up' && trend !== 'up') {
            advice = 'long';
        } else if(indicatorTrend === 'down' && trend !== 'down') {
            advice = 'short';
        } else {
            advice = 'none';
        }
        trend = indicatorTrend;

        /* Trade */
        if(advice == 'long') {
            if(currency > 0) {
                asset += extractFee(currency / price);
                currency = 0;

                if($scope.local) {
                    $scope.local.trades.push({
                        op: "buy",
                        date: $scope.data[i].date,
                    });
                }
            }
        }
        if(advice == 'short') {
            if(asset > 0) {
                currency += extractFee(asset * price);
                asset = 0;

                if($scope.local) {
                    $scope.local.trades.push({
                        op: "sell",
                        date: $scope.data[i].date,
                    });
                }
            }
        }
    }

    var endBalance = currency + $scope.data[$scope.data.length-1].price * asset;
    return (endBalance - startBalance);
};

var mutate = function mutate(genome) {
    var gene = Object.keys(genome)[Math.round(Math.random() * (Object.keys(genome).length-1))];
    var property = Object.keys(genome[gene])[Math.round(Math.random() * (Object.keys(genome[gene]).length-1))];
    var upOrDown = Math.random() <= 0.5 ? -1 : 1;
    genome[gene][property] += +(upOrDown * $genome[gene][property]["step"]).toFixed($genome[gene][property]["precision"]);
};

var crossover = function crossover(mother, father, child1, child2) {
    var pivot = randomBetween(1, 10);
    var count = 0;
    for(var gene in mother) {
        for(var property in mother[gene]) {
            if(count < pivot) {
                child1[gene][property] = mother[gene][property];
                child2[gene][property] = father[gene][property];
            } else {
                child1[gene][property] = father[gene][property];
                child2[gene][property] = mother[gene][property];
            }
            count++;
        }
    }
};

// function test() {
//     // var client = request.newClient('http://www.quandl.com/');
//     // client.get('api/v1/datasets/BITCOIN/BITSTAMPUSD', function(err, res, body) {
//     //     var data = [];
//     //     for(var i = 0; i < 256; i++) {
//     //         var tick = body.data[i];
//     //         data.push({
//     //             // date: tick[0],
//     //             // open: tick[1],
//     //             // high: tick[2],
//     //             // low: tick[3],
//     //             // close: tick[4],
//     //             price: tick[7]
//     //         });
//     //     }
//     //     data.reverse();
//     //     //console.log(data);
//     //     var b = new Backtester(data);
//     //     b.run(5);
//     // });

//     // var request = require("request-json")

//     var client = request.newClient('http://api-sandbox.oanda.com/');
//     client.get('v1/candles?instrument=EUR_USD&granularity=M5&count=200&candleFormat=midpoint', function(err, res, body) {
//         var data = [];
//         for(var i = 0; i < body.candles.length; i++) {
//             var tick = body.candles[i];
//             data.push({
//                 date: new Date(Date.parse(tick.time)),
//                 // open: tick[1],
//                 // high: tick[2],
//                 // low: tick[3],
//                 // close: tick[4],
//                 price: (tick.openMid + tick.highMid + tick.lowMid + tick.closeMid) / 4
//             });
//         }
//         data.reverse();
//         //console.log(data);
//         var b = new Backtester(data);
//         b.iteration(function(trades) {
//             console.log(trades);
//         });
//     });

// }
// test();