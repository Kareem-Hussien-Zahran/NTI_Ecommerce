const ActivityLog = require('../models/activitylog.model');
const { logger, redact } = require('../utils/logger');

const actorOf = (u) => (u ? { id: String(u._id || u.id), email: u.email, role: u.role } : undefined);

/**
 * Writes one activity entry (and a matching log line). NEVER throws: failing to write the trail
 * must not break the request that triggered it.
 *   await audit(req, 'product.update', { target: { type: 'product', id, label }, meta: {...}, actor })
 */
async function record(type, action, req, { target, meta, message, status, actor } = {}) {
  const entry = {
    type, action, message,
    actor: actorOf(actor || req?.user),
    target: target ? { type: target.type, id: target.id ? String(target.id) : undefined, label: target.label } : undefined,
    meta: meta === undefined ? undefined : redact(meta),
    status, ip: req?.ip, userAgent: (req?.get?.('user-agent') || '').slice(0, 200) || undefined, requestId: req?.id,
  };
  logger[type === 'error' ? 'error' : type === 'security' ? 'warn' : 'info'](type, { action, ...redact({ actor: entry.actor, target: entry.target, message }), reqId: req?.id });
  try { await ActivityLog.create(entry); } catch (e) { logger.error('activity log write failed', { action, err: e.message }); }
}

module.exports = {
  audit: (req, action, opts) => record('audit', action, req, opts),
  security: (req, action, opts) => record('security', action, req, opts),
  errorEvent: (req, action, opts) => record('error', action, req, opts),
};
