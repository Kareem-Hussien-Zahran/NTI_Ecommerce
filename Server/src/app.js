const express = require('express');
const compression = require('compression');
const { requestLogger } = require('./middleware/requestLogger.middleware');
const mongoose = require('mongoose');
const config = require('./config/env');
const { corsMiddleware, helmetMiddleware, apiLimiter } = require('./middleware/security.middleware');
const { notFound, errorHandler } = require('./middleware/error.middleware');
const routes = require('./routes');

const app = express();
app.set('trust proxy', 1); // behind nginx / load balancer
app.disable('x-powered-by');

app.use(requestLogger);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '100kb' }));

app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', fallthrough: true }));

app.get('/health', (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', uptime: process.uptime() });
});

app.use('/api/v1', apiLimiter, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
