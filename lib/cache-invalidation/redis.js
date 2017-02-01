'use strict';

const redis = require('redis');
const MultiError = require('../cache-lib/multi-error');

const MESSAGE_FLUSH_ALL = '[FlushAll]';

function getCacheInterface(clientPublisher, errorStatePublisher, channel) {
  function getError() {
    return new MultiError(errorStatePublisher.message);
  }

  return {
    del: function (key, callback) {
      if (errorStatePublisher.isError) {
        return callback(getError());
      }

      return clientPublisher.publish(channel, key, callback);
    },
    flushAll: function (callback) {
      if (errorStatePublisher.isError) {
        return callback(getError());
      }

      return clientPublisher.publish(channel, MESSAGE_FLUSH_ALL, callback);
    }
  };
}

/* eslint-disable max-statements */
module.exports = function (options, localCache) {

  let errorStatePublisher = {
    isError: false,
    messsage: ''
  };
  let errorStateSubscriber = {
    isError: false,
    messsage: ''
  };

  let invalidationChannel = (options) ? options.channel || 'cache-invalidation' : 'cache-invalidation';
  let clientSubscriber;
  let clientPublisher;

  if (options) {
    if (options.host && options.port) {
      clientSubscriber = redis.createClient(options.port, options.host, options);
      clientPublisher = redis.createClient(options.port, options.host, options);
    }
    else {
      clientSubscriber = redis.createClient(options);
      clientPublisher = redis.createClient(options);
    }
  }
  else {
    clientSubscriber = redis.createClient();
    clientPublisher = redis.createClient();
  }

  if (clientSubscriber.on && clientPublisher.on) {
    ['error', 'end'].forEach(function (event) {
      clientSubscriber.on(event, function (err) {
        errorStateSubscriber.isError = true;
        errorStateSubscriber.message = err ? err.toString() : 'Unknown error';
      });
      clientPublisher.on(event, function (err) {
        errorStatePublisher.isError = true;
        errorStatePublisher.message = err ? err.toString() : 'Unknown error';
      });
    });

    clientSubscriber.on('ready', function () {
      errorStateSubscriber.isError = false;
      errorStateSubscriber.message = '';
    });

    clientPublisher.on('ready', function () {
      errorStatePublisher.isError = false;
      errorStatePublisher.message = '';
    });

    if (invalidationChannel) {
      // console.log('Subscribe to channel "' + invalidationChannel + '"');
      clientSubscriber.subscribe(invalidationChannel);

      clientSubscriber.on('message', function (channel, key) {
        // console.log('key "' + key + '" on channel "' + channel + '" arrived!');

        if (channel === invalidationChannel) {
          if (key === MESSAGE_FLUSH_ALL) {
            //console.log('FlushAll');
            localCache.flushAll(function (err) {
              if (err) {
                console.log('Error in invalidator - flushAll');
                console.log(err);
              }
            });
          }
          else {
            //console.log('Delete "' + key + '"');
            localCache.del(key, function (err) {
              if (err) {
                console.log('Error in invalidator - del');
                console.log(err);
              }
            });
          }
        }
      });
    }
  }

  /* eslint-disable max-len */
  return getCacheInterface(clientPublisher, errorStatePublisher, invalidationChannel);
  /* eslint-disable max-len */
};
/* eslint-enable max-statements */
