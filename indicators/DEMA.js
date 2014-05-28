var EMA = require('./EMA.js');

module.exports = DEMA;

function DEMA(config) {
    this.result = false;
    this.short = new EMA(config.short);
    this.long = new EMA(config.long);
    this.up = config.up;
    this.down = config.down;
}

DEMA.prototype.update = function(price) {
    this.short.update(price);
    this.long.update(price);
    this.calculateEMAdiff();
}

DEMA.prototype.calculateEMAdiff = function() {
    var shortEMA = this.short.result;
    var longEMA = this.long.result;
    this.result = 100 * (shortEMA - longEMA) / ((shortEMA + longEMA) / 2);
}

DEMA.prototype.check = function(currentTrend) {
    if(this.result > this.up) {
        if(currentTrend !== 'up') {
            return {
                trend: 'up',
                advice: 'long'
            };
        }
    } else if(this.result < this.down) {
        if(currentTrend !== 'down') {
            return {
                trend: 'down',
                advice: 'short'
            };
        }
    } 
    return {
        trend: currentTrend,
        advice: 'nop'
    };
}
