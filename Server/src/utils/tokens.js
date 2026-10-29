const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

const signAccess = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiresIn });

const signRefresh = (user) =>
  jwt.sign({ sub: String(user._id), jti: crypto.randomUUID() }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });

const verifyAccess = (t) => jwt.verify(t, config.jwt.accessSecret);
const verifyRefresh = (t) => jwt.verify(t, config.jwt.refreshSecret);
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, hash };
