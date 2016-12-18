'use strict';

var assert = require('assert');
var random = require('../../../lib/cache-lib/random');

describe('Validate random', function () {

  it('should generate a random value between 1 and 5', function (done) {
    let randomValue = random.randomMinMax(1, 5);

    assert(randomValue >= 1 && randomValue <= 5);
    assert(typeof randomValue === 'number');

    done();
  });

});
