'use strict';

var assert = require('assert');
var redis = require('../../../lib/cache-invalidation/redis')();

describe('Validate API', function () {

  it('should validate end points of APIs', function (done) {
    var apis = [redis];
    var methods = ['del', 'flushAll'];
    apis.forEach(function (api) {
      methods.forEach(function (method) {
        assert(api[method]);
        assert(typeof api[method] === 'function');
      });
    });
    done();
  });

});
