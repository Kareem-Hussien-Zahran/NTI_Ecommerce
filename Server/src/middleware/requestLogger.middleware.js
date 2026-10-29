const crypto = require('crypto');
const { logger } = require('../utils/logger');

/**
 * Gives every request an id (honours a sane incoming X-Request-Id), echoes it in the response
 * and writes one structured line when the response finishes. 5xx -> error, 4xx -> warn, else info.
 */
function requestLogger(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w.-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : req.path === '/health' ? 'debug' : 'info';
    logger[level]('request', {
      reqId: req.id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode,
      ms: Math.round(ms * 10) / 10, bytes: Number(res.get('content-length')) || undefined,
      ip: req.ip, userId: req.user ? String(req.user._id) : undefined, ua: (req.get('user-agent') || '').slice(0, 80) || undefined,
    });
  });
  next();
}

module.exports = { requestLogger };
