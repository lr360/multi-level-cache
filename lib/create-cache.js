'use strict';

const nodeCache = require('./cache-lib/node-cache');
const redis = require('./cache-lib/redis');

module.exports = function (cacheName, options) {
  switch (cacheName) {

    case 'node-cache':
      return nodeCache(options);

    case 'redis':
      return redis(options);

    default:
      return null;
  }
};
