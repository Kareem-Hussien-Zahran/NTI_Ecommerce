const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const { audit } = require('../services/audit');
const { pageParams, paginated, escapeRegex } = require('../utils/pagination');

// ---- current user
exports.updateMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  user.set(req.valid.body);
  await user.save();
  res.json(user);
};

exports.deleteMe = async (req, res) => {
  await User.findByIdAndDelete(req.user._id);
  await audit(req, 'user.delete_self', { target: { type: 'user', id: req.user._id, label: req.user.email } });
  res.status(204).end();
};

// ---- admin
exports.list = async (req, res) => {
  const { q, role } = req.valid.query;
  const filter = {};
  if (role) filter.role = role;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }
  const p = pageParams(req.valid.query, 20);
  const [items, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(p.skip).limit(p.limit),
    User.countDocuments(filter),
  ]);
  res.json(paginated(items, total, p));
};

exports.get = async (req, res) => {
  const user = await User.findById(req.valid.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json(user);
};

exports.adminUpdate = async (req, res) => {
  const { id } = req.valid.params;
  if (String(id) === String(req.user._id)) throw ApiError.badRequest('You cannot change your own role or status');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  user.set(req.valid.body);
  await user.save();
  await audit(req, 'user.update', { target: { type: 'user', id: user._id, label: user.email }, meta: { changes: req.valid.body } });
  res.json(user);
};

exports.adminDelete = async (req, res) => {
  const { id } = req.valid.params;
  if (String(id) === String(req.user._id)) throw ApiError.badRequest('You cannot delete yourself');
  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound('User not found');
  await audit(req, 'user.delete', { target: { type: 'user', id: user._id, label: user.email } });
  res.status(204).end();
};
