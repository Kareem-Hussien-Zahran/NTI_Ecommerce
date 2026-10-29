const ApiError = require('../utils/ApiError');
const { security } = require('../services/audit');

/** Role based access control: authorize('admin'). Refusals are written to the security log. */
const authorize = (...roles) => async (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    await security(req, 'access.denied', { message: `${req.method} ${req.originalUrl.split('?')[0]}`, meta: { required: roles } });
    throw ApiError.forbidden('Access denied');
  }
  next();
};

module.exports = { authorize };
