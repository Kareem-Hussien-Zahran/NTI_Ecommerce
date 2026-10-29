const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED[ext] !== file.mimetype) return cb(ApiError.badRequest('Only .jpg, .jpeg, .png or .webp images are allowed'));
  cb(null, true);
};

const uploads = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024, files: 8 } });

module.exports = { uploads };
