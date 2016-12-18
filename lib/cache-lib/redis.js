'use strict';

const redis = require('redis');

const MultiError = require('./multi-error');

function deSerializeDate(key, value) {
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)$/)) {
      return new Date(value);
    }
  }

  return value;
}

function getCacheInterface(client, errorState, defaultTtl) {
  function getError() {
    return new MultiError(errorState.message);
  }

  return {
    set: function (key, value, callback) {
      if (errorState.isError) {
        return callback(getError());
      }

      client.multi()
        .set(key, JSON.stringify(value))
        .expire(key, defaultTtl)
        .exec(function (err, reply) {
          if (err) {
            return callback(err);
          }

          callback(err, reply[0]);
        });
    },
    get: function (keys, callback) {
      if (errorState.isError) {
        return callback(getError());
      }

      client.get(keys, function (err, reply) {
        if (err) {
          return callback(err);
        }

        // NOTE: REDIS will return null for a missing key, we want the API to return KeyNotFoundError
        if (reply === null) {
          return callback(new MultiError.KeyNotFoundError());
        }

        return callback(err, JSON.parse(reply, deSerializeDate));
      });
    },
    del: function (keys, callback) {
      if (errorState.isError) {
        return callback(getError());
      }

      client.del(keys, callback);
    },
    flushAll: function (callback) {
      if (errorState.isError) {
        return callback(getError());
      }

      client.flushall(callback);
    },
    stats: function (callback) {
      if (errorState.isError) {
        return callback(getError());
      }

      client.keys('*', function (err, keys) {
        if (err) {
          return callback(new MultiError('Unable to retrieve keys from redis adapter'));
        }

        return callback(null, {
          "name": 'redis',
          "keys": keys.length,
          "custom": client.server_info
        });
      });
    }
  };
}

/* eslint-disable max-statements */
module.exports = function (options) {

  let errorState = {
    isError: false,
    messsage: ''
  };

  let client;

  if (options) {
    if (options.host && options.port) {
      client = redis.createClient(options.port, options.host, options);
    }
    else {
      client = redis.createClient(options);
    }
  }
  else {
    client = redis.createClient();
  }

  if (client.on) {
    ['error', 'end'].forEach(function (event) {
      client.on(event, function (err) {
        errorState.isError = true;
        errorState.message = err ? err.toString() : 'Unknown error';
      });
    });

    client.on('ready', function () {
      errorState.isError = false;
      errorState.message = '';
    });
  }

  return getCacheInterface(client, errorState, (options == undefined) ? undefined : options.ttl || 3600);
};
/* eslint-enable max-statements */
