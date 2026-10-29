const ApiError = require('../utils/ApiError');
const { verifyAccess } = require('../utils/tokens');
const User = require('../models/user.model');

async function load(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  let payload;
  try { payload = verifyAccess(h.slice(7)); }
  catch { throw ApiError.unauthorized('Invalid or expired token'); }
  const user = await User.findById(payload.sub).select('+passwordChangedAt');
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status !== 'active') throw ApiError.forbidden(`Account is ${user.status}`);
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw ApiError.unauthorized('Password changed, please log in again');
  }
  return user;
}

async function authenticate(req, _res, next) {
  const user = await load(req);
  if (!user) throw ApiError.unauthorized('Authentication required');
  req.user = user;
  next();
}

async function optionalAuth(req, _res, next) {
  req.user = await load(req).catch(() => null);
  next();
}

module.exports = { authenticate, optionalAuth };
