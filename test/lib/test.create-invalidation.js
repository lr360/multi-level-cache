'use strict';

var assert = require('assert');

var createInvalidation = require('../../lib/create-invalidation');

describe('Create Invalidation', function() {
  it('should be null if the cache type is not supported', function(done) {
    var cache = createInvalidation('this cache does not exist');
    assert.equal(null, cache);
    done();
  });

  it('should be a local cache invalidation with redis', function(done) {
    var cache = createInvalidation('redis', {}, {});
    assert(cache);
    assert(cache.flushAll);
    assert(cache.del);
    done();
  });
});
