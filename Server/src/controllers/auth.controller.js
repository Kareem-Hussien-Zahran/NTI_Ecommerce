const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const t = require('../utils/tokens');
const { audit, security } = require('../services/audit');

const MAX_SESSIONS = 5;

async function issue(user) {
  const accessToken = t.signAccess(user);
  const refreshToken = t.signRefresh(user);
  const fresh = await User.findById(user._id).select('+refreshTokens');
  fresh.refreshTokens = [...fresh.refreshTokens, t.hash(refreshToken)].slice(-MAX_SESSIONS);
  await fresh.save({ validateModifiedOnly: true });
  return { accessToken, refreshToken, user: fresh };
}

exports.register = async (req, res) => {
  const user = await User.create({ ...req.valid.body, role: 'customer' }); // role can never be set by the client
  await audit(req, 'auth.register', { actor: user, target: { type: 'user', id: user._id, label: user.email } });
  res.status(201).json(await issue(user));
};

exports.login = async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil');
  const invalid = ApiError.unauthorized('Invalid email or password');
  if (!user) { await security(req, 'auth.login_failed', { meta: { email, reason: 'unknown_user' } }); throw invalid; }
  if (user.isLocked()) { await security(req, 'auth.login_blocked', { actor: user, meta: { email, reason: 'locked' } }); throw new ApiError(423, 'Account temporarily locked. Try again later.'); }
  if (!(await user.isCorrectPassword(password))) {
    await user.registerFailedLogin();
    await security(req, 'auth.login_failed', { actor: user, meta: { email, reason: 'bad_password' } });
    if (user.isLocked()) await security(req, 'auth.account_locked', { actor: user, meta: { email, until: user.lockUntil } });
    throw invalid;
  }
  if (user.status !== 'active') { await security(req, 'auth.login_blocked', { actor: user, meta: { email, reason: user.status } }); throw ApiError.forbidden(`Account is ${user.status}`); }
  user.failedLoginAttempts = 0; user.lockUntil = null;
  await user.save({ validateModifiedOnly: true });
  await audit(req, 'auth.login', { actor: user });
  res.json(await issue(user));
};

exports.refresh = async (req, res) => {
  const { refreshToken } = req.valid.body;
  let payload;
  try { payload = t.verifyRefresh(refreshToken); } catch { throw ApiError.unauthorized('Invalid refresh token'); }
  const user = await User.findById(payload.sub).select('+refreshTokens');
  const h = t.hash(refreshToken);
  if (!user || !user.refreshTokens.includes(h)) {
    // token reuse / revoked: drop all sessions
    if (user) { user.refreshTokens = []; await user.save({ validateModifiedOnly: true }); await security(req, 'auth.refresh_reuse', { actor: user, message: 'revoked or reused refresh token; all sessions dropped' }); }
    throw ApiError.unauthorized('Refresh token revoked');
  }
  if (user.status !== 'active') throw ApiError.forbidden(`Account is ${user.status}`);
  user.refreshTokens = user.refreshTokens.filter((x) => x !== h); // rotation
  await user.save({ validateModifiedOnly: true });
  res.json(await issue(user));
};

exports.logout = async (req, res) => {
  const token = req.body?.refreshToken;
  if (token) {
    await User.updateOne({ _id: req.user._id }, { $pull: { refreshTokens: t.hash(token) } });
  }
  await audit(req, 'auth.logout');
  res.status(204).end();
};

exports.me = (req, res) => res.json(req.user);

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await User.findById(req.user._id).select('+password +refreshTokens');
  if (!(await user.isCorrectPassword(currentPassword))) throw ApiError.badRequest('Current password is incorrect');
  user.password = newPassword;
  user.refreshTokens = [];
  await user.save();
  await audit(req, 'auth.password_changed', { actor: user });
  res.json(await issue(user));
};
