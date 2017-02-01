'use strict';

const redis = require('./cache-invalidation/redis');

module.exports = function (cacheInvalidationName, options, localCache) {

  switch (cacheInvalidationName) {

    case 'redis':
      return redis(options, localCache);

    default:
      return null;
  }
};
