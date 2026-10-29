const mongoose = require('mongoose');
const config = require('../config/env');

/**
 * Persistent audit / security / error trail shown in Admin -> System & logs.
 * Entries expire automatically after LOG_DB_RETENTION_DAYS (TTL index on createdAt).
 */
const activityLogSchema = new mongoose.Schema({
  type: { type: String, enum: ['audit', 'security', 'error'], required: true },
  action: { type: String, required: true },          // e.g. auth.login, product.update, server.error
  message: { type: String, maxlength: 1000 },
  actor: { id: String, email: String, role: String },
  target: { type: { type: String }, id: String, label: String },
  meta: mongoose.Schema.Types.Mixed,
  status: Number,                                     // HTTP status (errors)
  ip: String,
  userAgent: String,
  requestId: String,
  createdAt: { type: Date, default: Date.now, expires: config.log.dbRetentionDays * 86400 },
}, { versionKey: false });

activityLogSchema.index({ type: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ 'actor.email': 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
