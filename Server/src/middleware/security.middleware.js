const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// images are served to the SPA that may live on another origin
const helmetMiddleware = helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } });

const limiter = (windowMs, limit) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many requests, slow down.' } });

const apiLimiter = limiter(15 * 60 * 1000, config.env === 'test' ? 100000 : 600);
const authLimiter = limiter(15 * 60 * 1000, config.env === 'test' ? 100000 : 30);

module.exports = { corsMiddleware, helmetMiddleware, apiLimiter, authLimiter };
