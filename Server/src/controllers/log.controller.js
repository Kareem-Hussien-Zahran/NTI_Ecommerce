const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config/env');
const ActivityLog = require('../models/activitylog.model');
const { cache } = require('../utils/cache');
const { toCsv } = require('../utils/csv');
const { pageParams, paginated, escapeRegex } = require('../utils/pagination');
const { audit } = require('../services/audit');

/** GET /admin/logs — filterable, paginated activity trail (audit / security / error), optional CSV. */
exports.list = async (req, res) => {
  const f = req.valid.query;
  const filter = {};
  if (f.type) filter.type = f.type;
  if (f.action) filter.action = new RegExp(`^${escapeRegex(f.action)}`);
  if (f.status) filter.status = f.status;
  if (f.from || f.to) {
    filter.createdAt = {};
    if (f.from) filter.createdAt.$gte = new Date(`${f.from}T00:00:00.000Z`);
    if (f.to) filter.createdAt.$lte = new Date(`${f.to}T23:59:59.999Z`);
  }
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), 'i');
    filter.$or = [{ action: rx }, { message: rx }, { 'actor.email': rx }, { 'target.label': rx }, { ip: rx }, { requestId: rx }];
  }

  if (f.format === 'csv') {
    const rows = await ActivityLog.find(filter).sort('-createdAt').limit(5000).lean();
    await audit(req, 'logs.export', { meta: { rows: rows.length } });
    const flat = rows.map((r) => ({
      time: r.createdAt, type: r.type, action: r.action, actor: r.actor?.email, role: r.actor?.role,
      target: r.target ? `${r.target.type}:${r.target.label || r.target.id}` : '', message: r.message, ip: r.ip, requestId: r.requestId,
      meta: r.meta ? JSON.stringify(r.meta) : '',
    }));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="activity-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(toCsv(flat, ['time', 'type', 'action', 'actor', 'role', 'target', 'message', 'ip', 'requestId', 'meta']));
  }

  const p = pageParams(f, 25, 100);
  const since = new Date(Date.now() - 864e5);
  const [items, total, byType] = await Promise.all([
    ActivityLog.find(filter).sort('-createdAt').skip(p.skip).limit(p.limit).lean(),
    ActivityLog.countDocuments(filter),
    Promise.all(['audit', 'security', 'error'].map(async (t) => [t, await ActivityLog.countDocuments({ type: t, createdAt: { $gte: since } })])),
  ]);
  res.json({ ...paginated(items, total, p), summary: { last24h: Object.fromEntries(byType) } });
};

function backupStatus() {
  const dir = config.backup.dir;
  if (!dir) return { configured: false, state: 'not_configured' };
  let names;
  try { names = fs.readdirSync(dir); } catch { return { configured: true, dir, state: 'unreachable' }; }
  const files = names
    .filter((n) => /^(db-.*\.archive\.gz|uploads-.*\.tar\.gz)$/.test(n))
    .map((n) => { const st = fs.statSync(path.join(dir, n)); return { name: n, kind: n.startsWith('db-') ? 'db' : 'uploads', bytes: st.size, modifiedAt: st.mtime }; })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
  const latestDb = files.find((x) => x.kind === 'db') || null;
  const latestUploads = files.find((x) => x.kind === 'uploads') || null;
  const maxAgeMs = config.backup.intervalHours * 2 * 36e5;
  let state = 'none';
  if (latestDb) state = Date.now() - latestDb.modifiedAt.getTime() > maxAgeMs ? 'stale' : 'ok';
  return { configured: true, dir, state, intervalHours: config.backup.intervalHours, latestDb, latestUploads, files: files.slice(0, 10), totalFiles: files.length };
}

function logFiles() {
  const dir = config.log.dir;
  if (!dir) return { enabled: false };
  try {
    const files = fs.readdirSync(dir).filter((n) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(n)).sort().reverse()
      .map((n) => ({ name: n, bytes: fs.statSync(path.join(dir, n)).size }));
    return { enabled: true, dir, retentionDays: config.log.fileRetentionDays, files: files.slice(0, 7) };
  } catch { return { enabled: true, dir, files: [] }; }
}

/** GET /admin/system — operational snapshot: health, memory, cache, logs, backups, collection sizes. */
exports.system = async (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  const counts = {};
  if (dbUp) {
    await Promise.all(Object.keys(mongoose.models).map(async (name) => { counts[name] = await mongoose.models[name].estimatedDocumentCount().catch(() => null); }));
  }
  const mem = process.memoryUsage();
  res.json({
    api: { status: 'ok', uptimeSeconds: Math.round(process.uptime()), node: process.version, env: config.env, pid: process.pid },
    db: { status: dbUp ? 'ok' : 'down', name: mongoose.connection.name, collections: counts },
    memory: { rssMb: +(mem.rss / 1048576).toFixed(1), heapUsedMb: +(mem.heapUsed / 1048576).toFixed(1), heapTotalMb: +(mem.heapTotal / 1048576).toFixed(1) },
    cache: cache.stats(),
    logging: { level: config.log.level, format: config.log.format, dbRetentionDays: config.log.dbRetentionDays, files: logFiles() },
    backup: backupStatus(),
    time: new Date().toISOString(),
  });
};
