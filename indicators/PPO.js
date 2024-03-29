module.exports = PPO;

function PPO(config) {
    this.macd = false;
    this.ppo = false;
    this.short = new EMA(config.short);
    this.long = new EMA(config.long);
    this.MACDsignal = new EMA(config.signal);
    this.PPOsignal = new EMA(config.signal);
}

PPO.prototype.update = function(price) {
    this.short.update(price);
    this.long.update(price);
    this.calculatePPO();
    this.MACDsignal.update(this.macd);
    this.MACDhist = this.macd - this.MACDsignal.result;
    this.PPOsignal.update(this.ppo);
    this.PPOhist = this.ppo - this.PPOsignal.result;
}

PPO.prototype.calculatePPO = function() {
    var shortEMA = this.short.result;
    var longEMA = this.long.result;
    this.macd = shortEMA - longEMA;
    this.ppo = 100 * (this.macd / longEMA);
}