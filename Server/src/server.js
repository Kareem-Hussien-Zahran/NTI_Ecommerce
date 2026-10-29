const config = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');
const mongoose = require('mongoose');
const { logger } = require('./utils/logger');

(async () => {
  await connectDB();
  const server = app.listen(config.port, () => logger.info('API listening', { port: config.port, env: config.env, logLevel: config.log.level, logDir: config.log.dir || undefined }));

  const shutdown = (sig) => {
    logger.info('shutting down', { signal: sig });
    server.close(async () => { await mongoose.disconnect(); await logger.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch((e) => { logger.error('failed to start', { err: e }); setTimeout(() => process.exit(1), 100); });

process.on('unhandledRejection', (e) => { logger.error('unhandled rejection', { err: e }); });
process.on('uncaughtException', (e) => { logger.error('uncaught exception', { err: e }); setTimeout(() => process.exit(1), 100); });
