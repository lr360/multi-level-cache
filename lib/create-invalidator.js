'use strict';

const invalidator = require('./cache-invalidator/redis');

module.exports = function (options, localCache) {
  return invalidator(options, localCache);
};
