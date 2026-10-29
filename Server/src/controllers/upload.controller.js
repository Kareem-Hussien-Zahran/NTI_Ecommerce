const ApiError = require('../utils/ApiError');
const { audit } = require('../services/audit');

exports.images = async (req, res) => {
  if (!req.files?.length) throw ApiError.badRequest('No images uploaded (field name: images)');
  await audit(req, 'upload.images', { meta: { count: req.files.length, bytes: req.files.reduce((s, f) => s + f.size, 0) } });
  res.status(201).json({ urls: req.files.map((f) => `/uploads/${f.filename}`) });
};
