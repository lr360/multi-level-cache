'use strict';

const redis = require('redis');
const MultiError = require('../cache-lib/multi-error');

function getCacheInterface(client, errorState, channel) {
  function getError() {
    return new MultiError(errorState.message);
  }

  return {
    del: function (keys, callback) {
      if (errorState.isError) {
        return callback(getError());
      }

      if (channel) {
        client.publish(channel, keys);
      }

      callback(null, null);
    },
    flushAll: function (callback) {
      if (errorState.isError) {
        return callback(getError());
      }

      if (channel) {
        client.publish(channel, '[FlushAll]');
      }

      callback(null, null);
    }
  };
}

/* eslint-disable max-statements */
module.exports = function (options, localCache) {

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

  if (!options.invalidationChannel) {
    client.on('message', function (channel, message) {
      console.log('Message ' + message + ' on channel ' + channel + ' arrived!');

      if (channel === options.invalidationChannel) {
        if (message === '[FlushAll]') {
          localCache.flushAll(function (err) {
            if (err) {
              console.log('Error in flushAll - del');
              console.log(err);
            }
          });
        }
        else {
          localCache.del(message, function (err) {
            if (err) {
              console.log('Error in invalidator - del');
              console.log(err);
            }
          });
        }
      }
    });
  }

  /* eslint-disable max-len */
  return getCacheInterface(client, errorState, (options == undefined) ? undefined : options.invalidationChannel);
  /* eslint-disable max-len */
};
/* eslint-enable max-statements */
