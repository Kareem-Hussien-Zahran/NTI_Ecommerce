const { cache } = require('../utils/cache');

/**
 * Invalidate cache tags once a mutating request has finished successfully (2xx).
 * Hooking `finish` means we never drop entries for failed writes, and we drop them
 * after the data is committed so a concurrent GET can't re-cache stale data.
 */
const invalidateOnWrite = (...tags) => (_req, res, next) => {
  res.on('finish', () => { if (res.statusCode < 300) cache.invalidate(...tags); });
  next();
};

module.exports = { invalidateOnWrite };
