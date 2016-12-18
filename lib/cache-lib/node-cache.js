'use strict';

const NodeCache = require('node-cache');

const MultiError = require('./multi-error');
const random = require('./random');

module.exports = function (options) {

  let nodeCache = new NodeCache(options);

  let defaultMinTtl = (options === undefined) ? 15 : options.ttl_min || 15;
  let defaultMaxTtl = (options === undefined) ? 30 : options.ttl_max || 30;

  return {
    get: function get(key, callback) {
      return nodeCache.get(key, function (err, value) {
        if (err) {
          return callback(err);
        }

        // NOTE: node-cache indicates a "key not found" by returning a value set to undefined
        if (value === undefined) {
          return callback(new MultiError.KeyNotFoundError());
        }

        return callback(err, value);
      });
    },
    set: function set(key, val, callback) {
      let randomTtl = random.randomMinMax(defaultMinTtl, defaultMaxTtl);
      return nodeCache.set(key, val, randomTtl, callback);
    },
    del: function del(key, callback) {
      return nodeCache.del(key, callback);
    },
    flushAll: function flushall(callback) {
      nodeCache.flushAll();
      callback();
    },
    stats: function stats(callback) {
      nodeCache.keys(function (err, keys) {
        if (err) {
          return callback(new MultiError('Unable to retrieve keys from node-cache adapter'));
        }

        return callback(null, {
          "name": 'node-cache',
          "keys": keys.length,
          "custom": nodeCache.getStats()
        });
      });
    }
  };
};
