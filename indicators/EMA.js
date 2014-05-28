module.exports = EMA;

function EMA(weight) {
    this.weight = weight;
    this.result = false;
    this.age = 0;
}

EMA.prototype.update = function(price) {
    if(this.result === false) {
        this.result = price;
    }
    this.age++;
    this.calculate(price);
    return this.result;
}

EMA.prototype.calculate = function(price) {
    var k = 2 / (this.weight + 1);
    var y = this.result;
    this.result = price * k + y * (1 - k);
}