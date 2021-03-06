'use strict';

const nodeCache = require('../../lib/cache-lib/node-cache');
const createLocalCacheInvalidation = require('../../lib/create-invalidation');
const EventEmitter = require('events').EventEmitter;
const MultiCache = require('../..');
const assert = require('assert');
const _ = require('lodash');
const sinon = require('sinon');
const redis = require('redis');
const async = require('async');

const integration = [
  ['node-cache', 'node-cache', 'redis'],
  ['node-cache', 'redis', 'redis'],
  ['redis', 'node-cache', 'redis'],
  // ['redis', 'redis'] - this test wouldn't make sense because
  // we're reading/writing from/to the same "namespace"
];

const unit = [['node-cache', 'node-cache']];

const isIntegrationTest = process.env.NODE_MULTICACHE_TESTTYPE === 'integration';

const tests = isIntegrationTest ? integration : unit;

// Some notes about why mockRedis() is needed
// The Redis client library will raise error events if it detects that redis is not
// available on the default (or specified) ports. These events will bubble up into
// the tests. It only happens in this test because we use setTimeout which allows
// node.js to call processNextTick() which bubbles the error events.
// We only want to do a full integration test when isIntegrationTest is true
function mockRedis() {
  if (!isIntegrationTest) {
    let connectionGoneStub, onErrorStub;
    before(function() {
      connectionGoneStub = sinon.stub(redis.RedisClient.prototype, 'connection_gone').callsFake(function() {
        // do nothing
      });
      onErrorStub = sinon.stub(redis.RedisClient.prototype, 'on_error').callsFake(function() {
        // do nothing
      });
    });
    after(function() {
      connectionGoneStub.restore();
      onErrorStub.restore();
    });
  }
}

tests.forEach(function(test) {
  let key = 'myKey';
  let localCacheName = test[0],
    remoteCacheName = test[1],
    localCacheInvalidationName = test[2];
  describe('Multi Cache', function() {
    // eslint-disable-line max-statements
    mockRedis();
    let testRemoteOnly, testLocalOnly, testBothActive, testBothInactive, testAllActive;
    before(function() {
      testRemoteOnly = {
        useLocalCache: false,
        useRemoteCache: true,
      };
      testLocalOnly = {
        useLocalCache: true,
        useRemoteCache: false,
      };
      testBothActive = {
        useLocalCache: true,
        useRemoteCache: true,
      };
      testBothInactive = {
        useLocalCache: false,
        useRemoteCache: false,
      };
      testAllActive = {
        useLocalCache: true,
        useRemoteCache: true,
        useLocalCacheInvalidation: true,
      };
    });

    describe('Class creation', function() {
      it('should create a Multi-Cache without options', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, localCacheInvalidationName);
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        assert(multiCache.useLocalCacheDefault);
        assert(multiCache.useRemoteCacheDefault);
        assert(multiCache.useLocalCacheDefault);
        // TODO: Add sinon to confirm that the createCache function is called.
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(result);
          multiCache.get(key, function(err, value) {
            assert(!err);
            assert.equal(value, 'myValue');
            // Test that key/value is in remoteCache as well because if
            // we create the Multi Cache without options then both remote
            // and local are switched on by default.
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(!err);
              assert.equal(value, 'myValue');
              done();
            });
          });
        });
      });

      it('should create a Multi-Cache with empty options', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, localCacheInvalidationName, {
          localOptions: {},
          remoteOptions: {},
          localCacheInvalidationOptions: {},
        });
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        assert(multiCache.useLocalCacheDefault);
        assert(multiCache.useRemoteCacheDefault);
        assert(multiCache.useLocalCacheDefault);
        // TODO: Add sinon to confirm that the createCache function is called.
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(result);
          multiCache.get(key, function(err, value) {
            assert(!err);
            assert.equal(value, 'myValue');
            // Test that key/value is in remoteCache as well because if
            // we create the Multi Cache without options then both remote
            // and local are switched on by default.
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(!err);
              assert.equal(value, 'myValue');
              done();
            });
          });
        });
      });

      it('should create a Multi-Cache with pre-created caches', function(done) {
        // Pass in pre-created cache objects to create a Multi-Cache instead of
        // names for the cache objects.
        let localCache = nodeCache();
        let remoteCache = nodeCache();
        let localCacheInvalidation = nodeCache();

        let multiCache = new MultiCache(localCache, remoteCache, localCacheInvalidation, testLocalOnly);
        // TODO: Add sinon to confirm that the createCache function is NOT called.
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert.equal(value, 'myValue');
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(err);
              assert(err.keyNotFound);
              assert.equal(undefined, value);
              done();
            });
          });
        });
      });
    });

    describe('Setting', function() {
      beforeEach(function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        multiCache.del(key, function(err) {
          assert(!err);
          done();
        });
      });

      it('should set an object in the local cache only', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, testLocalOnly);
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, function(err, value) {
            assert(!err);
            assert.equal(value, 'myValue');
            // Test that key/value is not in remoteCache
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(err);
              assert(err.keyNotFound);
              assert.equal(undefined, value);
              done();
            });
          });
        });
      });

      it('should set an object in the remote cache only', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, testRemoteOnly);
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(err);
            assert(err.keyNotFound);
            assert.equal(undefined, value);
            // Test that key/value is in remoteCache
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(!err);
              assert(!_.isEmpty(value));
              done();
            });
          });
        });
      });

      it('should set an object in both remote and local caches', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, testBothActive);
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert(!_.isEmpty(value));
            // Test that key/value is in remoteCache
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(!err);
              assert(!_.isEmpty(value));
              done();
            });
          });
        });
      });

      it('should set an object in both remote and local caches also local cache invalidation', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, localCacheInvalidationName, testAllActive);
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert(!_.isEmpty(value));
            // Test that key/value is in remoteCache
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(!err);
              assert(!_.isEmpty(value));
              done();
            });
          });
        });
      });

      it('should return an error for neither caches during set', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, testBothInactive);
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        multiCache.set(key, 'myValue', function(err, result) {
          assert(err);
          assert(result === undefined);
          assert.equal('local or remote must be specified when setting to cache', err.message);
          done();
        });
      });

      it('should return an error for neither caches during get', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, testBothActive);
        assert.notEqual(multiCache.localCache, multiCache.remoteCache);
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, testBothInactive, function(err, value) {
            assert(typeof err === 'object');
            assert.equal(undefined, value);
            assert.equal('local or remote must be specified when getting from cache', err.message);
            done();
          });
        });
      });
    });

    describe('Getting', function() {
      beforeEach(function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        multiCache.del(key, function(err) {
          assert(!err);
          done();
        });
      });

      it('should get an object from the remote cache if local is empty', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        multiCache.set(key, 'myValue', testRemoteOnly, function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, function(err, value) {
            assert(!err);
            assert.equal(value, 'myValue');
            // Confirm that key is not in local cache
            multiCache.get(key, testLocalOnly, function(err, value) {
              assert(err);
              assert(err.keyNotFound);
              assert.equal(undefined, value);
              done();
            });
          });
        });
      });

      it('should set an object in local cache if setLocal is true', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        multiCache.set(key, 'myValue', testRemoteOnly, function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, { setLocal: true }, function(err, value) {
            assert(!err);
            assert.equal(value, 'myValue');
            // Confirm that key is now also in local cache
            multiCache.get(key, testLocalOnly, function(err, value) {
              assert(!err);
              assert(!_.isEmpty(value));
              done();
            });
          });
        });
      });

      it('should handle the local cache returning an error on get', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, testBothActive);
        let localStub = sinon.stub(multiCache.localCache, 'get').callsFake(function(keys, callback) {
          return callback('fake error', 'fake value');
        });
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, function(err, value) {
            assert.equal('fake error', err);
            assert.equal('fake value', value);
            localStub.restore();
            done();
          });
        });
      });

      it('should handle the remote cache returning an error on get', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, testBothActive);
        let remoteStub = sinon.stub(multiCache.remoteCache, 'get').callsFake(function(keys, callback) {
          return callback('fake error', 'fake value');
        });
        multiCache.set(key, 'myValue', testRemoteOnly, function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          multiCache.get(key, function(err, value) {
            assert.equal('fake error', err);
            assert.equal('fake value', value);
            remoteStub.restore();
            done();
          });
        });
      });
    });

    describe('Deleting', function() {
      it('should delete an object in the local cache only', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        // Set a key/value in both local and remote caches
        // Set remoteCache to true to override the default from above
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(result);
          multiCache.del(key, testLocalOnly, function(err) {
            assert(!err);
            // Check that key has been deleted from local cache but not
            // from remote cache
            multiCache.get(key, testLocalOnly, function(err, value) {
              assert(err);
              assert(err.keyNotFound);
              assert.equal(undefined, value);
              multiCache.get(key, testRemoteOnly, function(err, value) {
                assert(!err);
                assert.equal('myValue', value);
                done();
              });
            });
          });
        });
      });

      it('should delete an object in the remote cache only', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        // Set a key/value in both local and remote caches
        // Set remoteCache to true to override the default from above
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(result);
          multiCache.del(key, testRemoteOnly, function(err) {
            assert(!err);
            // Check that key has been deleted from local cache but not
            // from remote cache
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(err);
              assert(err.keyNotFound);
              assert.equal(undefined, value);
              multiCache.get(key, testLocalOnly, function(err, value) {
                assert(!err);
                assert(!_.isEmpty(value));
                done();
              });
            });
          });
        });
      });

      it('should delete an object in both remote and local caches', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        // Set a key/value in both local and remote caches
        // Set remoteCache to true to override the default from above
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(result);
          multiCache.del(key, function(err) {
            assert(!err);
            // Check that key has been deleted from both caches
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(err);
              assert(err.keyNotFound);
              assert.equal(undefined, value);
              multiCache.get(key, testLocalOnly, function(err, value) {
                assert(err);
                assert(err.keyNotFound);
                assert.equal(undefined, value);
                done();
              });
            });
          });
        });
      });

      it('should delete an object in both remote and local caches and also publish the invalidation', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName, localCacheInvalidationName);
        // Set a key/value in both local and remote caches
        // Set remoteCache to true to override the default from above
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(result);
          multiCache.del(key, testAllActive, function(err) {
            assert(!err);
            // Check that key has been deleted from both caches
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(err);
              assert(err.keyNotFound);
              assert.equal(undefined, value);
              multiCache.get(key, testLocalOnly, function(err, value) {
                assert(err);
                assert(err.keyNotFound);
                assert.equal(undefined, value);
                done();
              });
            });
          });
        });
      });

      it('should not delete an object in either remote and local caches', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        // Set a key/value in both local and remote caches
        // Set remoteCache to true to override the default from above
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(result);
          multiCache.del(key, testBothInactive, function(err) {
            assert(!err);
            // Check that key has been deleted from local cache but not
            // from remote cache
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(!err);
              assert(!_.isEmpty(value));
              multiCache.get(key, testLocalOnly, function(err, value) {
                assert(!err);
                assert(!_.isEmpty(value));
                done();
              });
            });
          });
        });
      });
    });

    describe('Complex objects', function() {
      it('should set and get complex objects', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        let value = {
          nested: {
            obj: {
              which: {
                keeps: {
                  getting: {
                    deeper: {
                      and: {
                        deeper: {
                          and: {
                            has: {
                              an: {
                                array: {
                                  inside: {
                                    it: [1, 1, 2, 6, 24, { an: 'object' }, 'a string', new Date(), true, false],
                                    and: {
                                      a: {
                                        date: new Date(),
                                      },
                                    },
                                    a: {
                                      number: 1234,
                                    },
                                    bool: true,
                                    string: 'another string',
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };
        // Test that the cache returns the same complex object as what was set
        multiCache.set(key, value, testBothActive, function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          // Confirm value from local cache
          multiCache.get(key, testLocalOnly, function(err, result) {
            assert(!err);
            assert.deepEqual(result, value);
            // Confirm value from remote cache
            multiCache.get(key, testRemoteOnly, function(err, result) {
              assert(!err);
              assert.deepEqual(result, value);
              done();
            });
          });
        });
      });
    });

    describe('Flush All', function() {
      function setBothAndConfirm(multiCache, key, value, callback) {
        multiCache.set(key, value, testBothActive, function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          // Confirm value from local cache
          multiCache.get(key, testLocalOnly, function(err, result) {
            assert(!err);
            assert(!_.isEmpty(result));
            assert.equal(result, value);
            // Confirm value from remote cache
            multiCache.get(key, testRemoteOnly, function(err, result) {
              assert(!err);
              assert(!_.isEmpty(result));
              assert.equal(result, value);
              callback();
            });
          });
        });
      }

      function confirmBothNoKey(multiCache, key, callback) {
        multiCache.get(key, testLocalOnly, function(err, value) {
          assert(err);
          assert(err.keyNotFound);
          assert(!value);
          // Confirm value from remote cache
          multiCache.get(key, testRemoteOnly, function(err, value) {
            assert(err);
            assert(err.keyNotFound);
            assert(!value);
            callback();
          });
        });
      }

      it('should flush all key/values from the cache', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        setBothAndConfirm(multiCache, key, 'myValue', function() {
          setBothAndConfirm(multiCache, 'myKey2', 'myValue2', function() {
            multiCache.flushAll(function(err) {
              assert(!err);
              confirmBothNoKey(multiCache, key, function() {
                confirmBothNoKey(multiCache, 'myKey2', function() {
                  done();
                });
              });
            });
          });
        });
      });

      function confirmNoKeys(multiCache, keys, existLocation, notExistLocation, callback) {
        async.each(
          keys,
          function(key, cb) {
            multiCache.get(key, existLocation, function(err, value) {
              assert(!err);
              assert(value);
              multiCache.get(key, notExistLocation, function(err, value) {
                assert(err);
                assert(err.keyNotFound);
                assert(!value);
                cb();
              });
            });
          },
          function(err) {
            return callback(err);
          },
        );
      }

      it('should flush all key/values from the local cache only', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        setBothAndConfirm(multiCache, key, 'myValue', function() {
          setBothAndConfirm(multiCache, 'myKey2', 'myValue2', function() {
            multiCache.flushAll(testLocalOnly, function(err) {
              assert(!err);
              confirmNoKeys(multiCache, [key, 'myKey2'], testRemoteOnly, testLocalOnly, function(err) {
                assert(!err);
                done();
              });
            });
          });
        });
      });

      it('should flush all key/values from the remote cache only', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        setBothAndConfirm(multiCache, key, 'myValue', function() {
          setBothAndConfirm(multiCache, 'myKey2', 'myValue2', function() {
            multiCache.flushAll(testRemoteOnly, function(err) {
              assert(!err);
              confirmNoKeys(multiCache, [key, 'myKey2'], testLocalOnly, testRemoteOnly, function(err) {
                assert(!err);
                done();
              });
            });
          });
        });
      });
    });

    describe('Cache Expiration', function() {
      it('should evict from cache based on the default local and remote TTL', function(done) {
        this.timeout(4000);
        let multiCache = new MultiCache(localCacheName, remoteCacheName, null, {
          localOptions: { ttl_min: 1, ttl_max: 2 },
          remoteOptions: { ttl_min: 1, ttl_max: 2 },
        });
        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));
          // Check that key is in both local and remote cache
          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert(!_.isEmpty(value));
            assert.equal(value, 'myValue');
            multiCache.get(key, testRemoteOnly, function(err, value) {
              assert(!err);
              assert(!_.isEmpty(value));
              assert.equal(value, 'myValue');
              // Test that key/value is evicted after 3 seconds
              setTimeout(function() {
                multiCache.get(key, testLocalOnly, function(err, value) {
                  assert(err);
                  assert(err.keyNotFound);
                  assert.equal(undefined, value);
                  multiCache.get(key, testRemoteOnly, function(err, value) {
                    assert(err);
                    assert(err.keyNotFound);
                    assert.equal(undefined, value);
                    done();
                  });
                });
              }, 3000);
            });
          });
        });
      });
    });

    describe('Local Cache Invalidation', function() {
      it('should delete local cache entry if received invalidation thru channel', function(done) {
        let localCacheStub = {
          set: sinon.stub().callsArg(2),
          get: sinon.stub().callsArgWith(1, null, 'myValue'),
          del: sinon.stub().callsArg(1),
          on: _.noop,
        };

        let redisSubscriber = null;
        let redisPublisher = null;

        let redisStub = sinon.stub(redis, 'createClient').callsFake(function() {
          if (!redisSubscriber) {
            redisSubscriber = new EventEmitter();
            redisSubscriber.subscribe = _.noop;

            return redisSubscriber;
          }

          redisPublisher = {};
          redisPublisher.on = _.noop;
          redisPublisher.publish = function(channel, message, cb) {
            redisSubscriber.emit('message', channel, message);
            cb(null, null);
          };

          return redisPublisher;
        });

        let localCacheInvalidation = createLocalCacheInvalidation('redis', { channel: 'test' }, localCacheStub);

        redisStub.restore();

        let multiCache = new MultiCache(localCacheStub, remoteCacheName, localCacheInvalidation, {});

        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));

          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert(!_.isEmpty(value));
            assert.equal(value, 'myValue');

            redisPublisher.publish('test', key, function() {
              assert.equal(localCacheStub.del.callCount, 1);
              done();
            });
          });
        });
      });

      it('should delete local cache entry if received invalidation thru channel but localCache throw an error', function(done) {
        let localCacheStub = {
          set: sinon.stub().callsArg(2),
          get: sinon.stub().callsArgWith(1, null, 'myValue'),
          del: sinon.stub().callsArgWith(1, new Error('Test'), null),
          on: _.noop,
        };

        let redisSubscriber = null;
        let redisPublisher = null;

        let redisStub = sinon.stub(redis, 'createClient').callsFake(function() {
          if (!redisSubscriber) {
            redisSubscriber = new EventEmitter();
            redisSubscriber.subscribe = _.noop;

            return redisSubscriber;
          }

          redisPublisher = {};
          redisPublisher.on = _.noop;
          redisPublisher.publish = function(channel, message, cb) {
            redisSubscriber.emit('message', channel, message);
            cb(null, null);
          };

          return redisPublisher;
        });

        let localCacheInvalidation = createLocalCacheInvalidation('redis', { channel: 'test' }, localCacheStub);

        redisStub.restore();

        let multiCache = new MultiCache(localCacheStub, remoteCacheName, localCacheInvalidation, {});

        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));

          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert(!_.isEmpty(value));
            assert.equal(value, 'myValue');

            redisPublisher.publish('test', key, function() {
              assert.equal(localCacheStub.del.callCount, 1);
              done();
            });
          });
        });
      });

      it('should flushAll local cache entry if received invalidation thru channel', function(done) {
        let localCacheStub = {
          set: sinon.stub().callsArg(2),
          get: sinon.stub().callsArgWith(1, null, 'myValue'),
          flushAll: sinon.stub().callsArg(0),
          on: _.noop,
        };

        let redisSubscriber = null;
        let redisPublisher = null;

        let redisStub = sinon.stub(redis, 'createClient').callsFake(function() {
          if (!redisSubscriber) {
            redisSubscriber = new EventEmitter();
            redisSubscriber.subscribe = _.noop;

            return redisSubscriber;
          }

          redisPublisher = {};
          redisPublisher.on = _.noop;
          redisPublisher.publish = function(channel, message, cb) {
            redisSubscriber.emit('message', channel, message);
            cb(null, null);
          };

          return redisPublisher;
        });

        let localCacheInvalidation = createLocalCacheInvalidation('redis', { channel: 'test' }, localCacheStub);

        redisStub.restore();

        let multiCache = new MultiCache(localCacheStub, remoteCacheName, localCacheInvalidation, {});

        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));

          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert(!_.isEmpty(value));
            assert.equal(value, 'myValue');

            redisPublisher.publish('test', '[FlushAll]', function() {
              assert.equal(localCacheStub.flushAll.callCount, 1);
              done();
            });
          });
        });
      });

      it('should flushAll local cache entry if received invalidation thru channel but localCache throw an error', function(done) {
        let localCacheStub = {
          set: sinon.stub().callsArg(2),
          get: sinon.stub().callsArgWith(1, null, 'myValue'),
          flushAll: sinon.stub().callsArgWith(0, new Error('TEST'), null),
          on: _.noop,
        };

        let redisSubscriber = null;
        let redisPublisher = null;

        let redisStub = sinon.stub(redis, 'createClient').callsFake(function() {
          if (!redisSubscriber) {
            redisSubscriber = new EventEmitter();
            redisSubscriber.subscribe = _.noop;

            return redisSubscriber;
          }

          redisPublisher = {};
          redisPublisher.on = _.noop;
          redisPublisher.publish = function(channel, message, cb) {
            redisSubscriber.emit('message', channel, message);
            cb(null, null);
          };

          return redisPublisher;
        });

        let localCacheInvalidation = createLocalCacheInvalidation('redis', { channel: 'test' }, localCacheStub);

        redisStub.restore();

        let multiCache = new MultiCache(localCacheStub, remoteCacheName, localCacheInvalidation, {});

        multiCache.set(key, 'myValue', function(err, result) {
          assert(!err);
          assert(!_.isEmpty(result));

          multiCache.get(key, testLocalOnly, function(err, value) {
            assert(!err);
            assert(!_.isEmpty(value));
            assert.equal(value, 'myValue');

            redisPublisher.publish('test', '[FlushAll]', function() {
              assert.equal(localCacheStub.flushAll.callCount, 1);
              done();
            });
          });
        });
      });
    });

    describe('Stats', function() {
      beforeEach(function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        multiCache.flushAll(done);
      });

      it('should set keys in caches and get stats', function(done) {
        let multiCache = new MultiCache(localCacheName, remoteCacheName);
        let keyValues = [{ key: 'key1', value: 'value1' }, { key: 'key2', value: 'value2' }, { key: 'key3', value: 'value3' }];
        async.each(
          keyValues,
          function(keyValue, callback) {
            multiCache.set(keyValue.key, keyValue.value, function(err, result) {
              assert(!err);
              assert(result);
              callback(err);
            });
          },
          function(err) {
            assert(!err);
            multiCache.stats(testLocalOnly, function(err, stats) {
              assert(!err);
              assert(_.isArray(stats));
              assert.equal(1, stats.length);
              assert.equal(stats[0].name, localCacheName);
              assert.equal(stats[0].keys, 3);
              multiCache.stats(testRemoteOnly, function(err, stats) {
                assert(!err);
                assert(_.isArray(stats));
                assert.equal(1, stats.length);
                assert.equal(stats[0].name, remoteCacheName);
                assert.equal(stats[0].keys, 3);
                multiCache.stats(function(err, stats) {
                  assert(!err);
                  assert(_.isArray(stats));
                  assert.equal(2, stats.length);
                  assert.equal(stats[0].name, localCacheName);
                  assert.equal(stats[1].name, remoteCacheName);
                  assert.equal(stats[0].keys, 3);
                  assert.equal(stats[1].keys, 3);
                  done();
                });
              });
            });
          },
        );
      });
    });
  });
});
