'use strict';

var createInvalidator = require('../../lib/create-invalidator');
var assert = require('assert');

describe('Create Invalidator', function(){

  it('should be a local cache invalidator with redis', function(done){
    var cache = createInvalidator({}, {});
    assert(cache);
    assert(cache.flushAll);
    assert(cache.del);
    done();
  });

});
