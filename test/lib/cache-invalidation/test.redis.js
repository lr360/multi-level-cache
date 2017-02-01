'use strict';

var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var assert = require('assert');
var sinon = require('sinon');

// setup redis for testing w/o our framework
var redis = require('redis');
var redisAdapter = require('../../../lib/cache-invalidation/redis');

/* eslint-disable max-statements */
describe('invalidation redis adapter', function () {

  it('should call callback if redis returns an error in get', function (done) {

    var localCacheStub = {};
    var redisStub = sinon.stub(redis, 'createClient', function () {
      return {
        subscribe: _.noop,
        publish: function (channel, message, callback) {
          return callback('fake error');
        },
        on: _.noop
      };
    });

    // This instance of the redis plugin will use our stubbed out redis.clientCreate
    // above to return an object with a get() that returns an error.
    var redisPlugin = redisAdapter({}, localCacheStub);
    redisPlugin.del('testkey', function (err, value) {
      assert(err);
      assert.equal('fake error', err);
      assert.equal(undefined, value);
      redisStub.restore();
      done();
    });
  });

  it('should call delete a key', function (done) {
    var clientStub = {
      subscribe: _.noop,
      'publish': sinon.stub().callsArgWith(2, null, null),
      on: _.noop
    };
    var localCacheStub = {};
    var redisStub = sinon.stub(redis, 'createClient', function () {
      return clientStub;
    });

    var redisPlugin = redisAdapter({}, localCacheStub);
    redisPlugin.del('testkey', function () {
      assert.equal(clientStub.publish.callCount, 1);
      redisStub.restore();
      done();
    });
  });

  it('should call flushAll', function (done) {
    var clientStub = {
      subscribe: _.noop,
      'publish': sinon.stub().callsArgWith(2, null, null),
      on: _.noop
    };
    var localCacheStub = {};
    var redisStub = sinon.stub(redis, 'createClient', function () {
      return clientStub;
    });

    var redisPlugin = redisAdapter({}, localCacheStub);
    redisPlugin.flushAll(function (err) {
      assert(!err);
      redisStub.restore();
      done();
    });
  });

  describe('Redis adapter options passing', function () {
    it('should use default options if no options set', function () {
      var redisStub = sinon.stub(redis, 'createClient').returns({});

      redisAdapter();
      assert(redisStub.calledTwice);
      assert(redisStub.calledWithExactly());

      redisStub.restore();
    });

    it('should use an options object if passed in', function () {
      var redisStub = sinon.stub(redis, 'createClient').returns({});
      var options = {};

      redisAdapter(options);
      assert(redisStub.calledTwice);
      assert(redisStub.calledWithExactly(options));

      redisStub.restore();
    });

    it('should use host and port if passed in', function () {
      var redisStub = sinon.stub(redis, 'createClient').returns({});
      var options = {
        host: 'localhost',
        port: 123123,
        x: 'y'
      };

      redisAdapter(options);
      assert(redisStub.calledTwice);
      assert(redisStub.calledWithExactly(options.port, options.host, options));

      redisStub.restore();
    });
  });

  describe('Redis error recovery', function () {
    it('should recover when redis recovers', function (done) {
      var errMsg = 'fake error from event';
      var redisPlugin, redisStub;
      var clientEventEmitter = new EventEmitter();
      clientEventEmitter.subscribe = _.noop;
      clientEventEmitter.publish = function (channel, message, callback) {
        return callback(null, null);
      };
      redisStub = sinon.stub(redis, 'createClient', function () {
        return clientEventEmitter;
      });
      redisPlugin = redisAdapter({});
      clientEventEmitter.emit('error', errMsg);

      redisPlugin.del('testkey', function (err) {
        assert(err);
        assert.equal(err.message, errMsg);
        // Now have redis recover and try the operation again
        clientEventEmitter.emit('ready');
        redisPlugin.del('testkey', function (err) {
          assert(!err);

          redisStub.restore();
          done();
        });
      });
    });
  });

  describe('Redis error state', function () {
    var errMsg = 'fake error from event';
    var redisPlugin, redisStub;
    beforeEach(function (done) {
      var clientEventEmitter = new EventEmitter();
      clientEventEmitter.subscribe = _.noop;
      redisStub = sinon.stub(redis, 'createClient', function () {
        return clientEventEmitter;
      });
      redisPlugin = redisAdapter({});
      clientEventEmitter.emit('error', errMsg);
      done();
    });
    afterEach(function (done) {
      redisStub.restore();
      done();
    });

    it('should callback in error state when calling del', function (done) {
      redisPlugin.del('testkey', function (err) {
        assert(err);
        assert.equal(err.message, errMsg);
        done();
      });
    });

    it('should callback in error state when calling flushall', function (done) {
      redisPlugin.flushAll(function (err) {
        assert(err);
        assert.equal(err.message, errMsg);
        done();
      });
    });
  });

});
/* eslint-enable max-statements */
