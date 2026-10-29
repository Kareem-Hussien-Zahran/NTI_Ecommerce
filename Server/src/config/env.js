require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required env var ${name}`);
  return v;
}

const mongoUri = required('MONGODB_URI', isProd ? undefined : 'mongodb://localhost:27017/myStore');
if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
if (!/^mongodb(\+srv)?:\/\/[^/]+\/[^/?\s]+/.test(mongoUri)) {
  // without a database name the driver silently uses "test"
  throw new Error('MONGODB_URI must include a database name, e.g. ...mongodb.net/myStore?retryWrites=true&w=majority');
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 3000,
  mongoUri,
  mongoMaxPool: Number(process.env.MONGODB_MAX_POOL) || 20,
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', isProd ? undefined : 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', isProd ? undefined : 'dev-refresh-secret'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:4200')
    .split(',').map((s) => s.trim()).filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || require('path').join(__dirname, '../../uploads'),
  cache: {
    enabled: (process.env.CACHE_ENABLED ?? 'true') !== 'false',
    ttlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 60,
    maxEntries: Number(process.env.CACHE_MAX_ENTRIES) || 500,
  },
  log: {
    // silent | debug | info | warn | error   (tests are silent unless LOG_LEVEL is set)
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || (isProd ? 'json' : 'pretty'),
    dir: process.env.LOG_DIR || '',                                   // set to also write daily files app-YYYY-MM-DD.log
    fileRetentionDays: Number(process.env.LOG_RETENTION_DAYS) || 14,  // daily log files kept on disk
    dbRetentionDays: Number(process.env.LOG_DB_RETENTION_DAYS) || 90, // audit/error entries kept in MongoDB (TTL index)
  },
  backup: {
    dir: process.env.BACKUP_DIR || '',                                // read-only view of the backup folder (admin System page)
    intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS) || 24,
  },
  shipping: { flatFee: 5, freeOver: 100 },
  taxRate: 0.1,
};

module.exports = config;
