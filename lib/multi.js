'use strict';

const createCache = require('./create-cache');
const createLocalCacheInvalidator = require('./create-invalidator');
const async = require('async');
const _ = require('lodash');
const MultiError = require('./cache-lib/multi-error');

/* eslint-disable max-statements */
let MultiCache = (function () {
  /* eslint-disable max-statements */
  function MultiCache(localCache, remoteCache, options) {

    this.options = options != null ? options : {};

    this.useLocalCacheDefault = this.options.hasOwnProperty('useLocalCache') ?
      this.options.useLocalCache
      : true;
    this.useRemoteCacheDefault = this.options.hasOwnProperty('useRemoteCache') ?
      this.options.useRemoteCache
      : true;
    this.useLocalCacheInvalidator = this.options.hasOwnProperty('useLocalCacheInvalidator') ?
      this.options.useLocalCacheInvalidator
      : true;

    this.localCache = typeof localCache === 'string' ?
      createCache(localCache, this.options.localOptions)
      : localCache;
    this.remoteCache = typeof remoteCache === 'string' ?
      createCache(remoteCache, this.options.remoteOptions)
      : remoteCache;

    this.localCacheInvalidator = createLocalCacheInvalidator(this.options, this.localCache);
  }
  /* eslint-disable max-statements */

  MultiCache.prototype.get = function (keys, options, callback) {
    let self = this;
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }

    if (self._useLocalCache(options)) {
      self.localCache.get(keys, function (err, value) {
        if (err && !err.keyNotFound) {
          return callback(err, value);
        }

        if (!_.isEmpty(value) || !self._useRemoteCache(options)) {
          return callback(err, value);
        }

        self.remoteCache.get(keys, function (err, value) {
          if (err) {
            if (err.keyNotFound) {
              return callback(null, undefined);
            }
            else {
              return callback(err, value);
            }
          }

          if (options && options.setLocal && !_.isEmpty(value)) {
            self.localCache.set(keys, value, function () {
              return callback(err, value);
            });
          } else {
            return callback(err, value);
          }
        });

      });
    } else if (self._useRemoteCache(options)) {
      this.remoteCache.get(keys, callback);
    } else {
      return callback(new MultiError('local or remote must be specified when getting from cache'));
    }
  };

  MultiCache.prototype.set = function (key, value, options, callback) {
    options = callback = undefined;
    let args = [].slice.call(arguments);
    for (let i = 2; i < args.length; i++) {
      switch (typeof args[i]) {
        case 'function':
          callback = args[i];
          break;
        case 'object':
          options = args[i];
      }
    }

    return this._set(key, value, options, callback);
  };

  /* eslint-disable max-statements */
  MultiCache.prototype._set = function (key, value, options, callback) {
    let setters = this._useMethods(options, 'set');

    if (setters.length === 0) {
      let err = new MultiError('local or remote must be specified when setting to cache');
      return callback(err);
    }

    async.each(setters, function (setter, cb) {
      setter(key, value, cb);
    }, function (err) {
      callback(err, value);
    });
  };

  MultiCache.prototype.del = function (keys, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }

    let removers = this._useMethods(options, 'del');
    async.each(removers, function (remove, cb) {
      remove(keys, cb);
    }, function (err) {
      callback(err);
    });
  };
  /* eslint-disable max-statements */

  MultiCache.prototype.flushAll = function (options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }

    let flushers = this._useMethods(options, 'flushAll');
    async.each(flushers, function (flushall, cb) {
      flushall(cb);
    }, function (err) {
      callback(err);
    });
  };

  MultiCache.prototype.stats = function (options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }

    let stats = this._useMethods(options, 'stats');
    async.map(stats, function (stat, cb) {
      stat(cb);
    }, callback);
  };

  MultiCache.prototype._useLocalCache = function (options) {
    if (options && options.hasOwnProperty('useLocalCache')) {
      return options.useLocalCache;
    }

    return this.useLocalCacheDefault;
  };

  MultiCache.prototype._useRemoteCache = function (options) {
    if (options && options.hasOwnProperty('useRemoteCache')) {
      return options.useRemoteCache;
    }

    return this.useRemoteCacheDefault;
  };

  MultiCache.prototype._useLocalCacheInvalidator = function (options) {
    if (options && options.hasOwnProperty('useLocalCacheInvalidator')) {
      return options.useLocalCacheInvalidator;
    }

    return this.useRemoteCacheDefault;
  };

  // Get an array of methods to execute against the caches.
  // e.g. if we need to set both local and remote cache then
  // the options will let us know that both local and remote
  // need to be set and the method param will be set to 'set'
  MultiCache.prototype._useMethods = function (options, method) {
    let methods = [];

    if (this._useLocalCache(options)) {
      methods.push(this.localCache[method]);
    }

    if (this._useRemoteCache(options)) {
      methods.push(this.remoteCache[method]);
    }

    if (this._useLocalCacheInvalidator(options) && this.localCacheInvalidator[method]) {
      methods.push(this.localCacheInvalidator[method]);
    }

    return methods;
  };

  return MultiCache;
})();
/* eslint-disable max-statements */

module.exports = MultiCache;
