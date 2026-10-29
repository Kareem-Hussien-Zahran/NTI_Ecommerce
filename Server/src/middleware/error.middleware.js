const multer = require('multer');
const config = require('../config/env');
const { logger } = require('../utils/logger');
const { errorEvent } = require('../services/audit');

const notFound = (req, res) => res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });

// eslint-disable-next-line no-unused-vars
const errorHandler = async (err, req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.name === 'ValidationError' && err.errors) {
    status = 400; message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400; message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409; const f = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${f} already exists`;
  } else if (err instanceof multer.MulterError) {
    status = 400; message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 2MB)' : err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Malformed JSON body';
  }

  if (status >= 500) {
    logger.error('unhandled error', { reqId: req.id, method: req.method, path: req.originalUrl?.split('?')[0], err });
    await errorEvent(req, 'server.error', { message: String(err.message).slice(0, 500), status, meta: { method: req.method, path: req.originalUrl?.split('?')[0], stack: String(err.stack || '').split('\n').slice(0, 6).join('\n') } });
  }
  res.status(status).json({
    message: status >= 500 && config.isProd ? 'Internal server error' : message,
    ...(details ? { details } : {}),
    ...(!config.isProd && status >= 500 ? { stack: err.stack } : {}),
  });
};

module.exports = { notFound, errorHandler };
