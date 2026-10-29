const fs = require('fs');
const path = require('path');
const config = require('../config/env');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SECRET_KEY = /pass(word)?|token|authorization|cookie|secret|api[-_]?key|jwt/i;

/** Deep-copies a value for logging: secrets become [REDACTED], errors become plain objects, depth/size are capped. */
function redact(value, depth = 0) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (value === null || typeof value !== 'object') return typeof value === 'string' && value.length > 2000 ? value.slice(0, 2000) + '…' : value;
  if (value instanceof Date) return value;
  if (depth >= 5) return '[Object]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  return out;
}

const COLORS = { debug: '\x1b[90m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };

/** Daily-rotating file sink: <dir>/app-YYYY-MM-DD.log, files older than retentionDays are deleted. */
function fileSink(dir, retentionDays) {
  let stream = null; let day = '';
  const prune = () => {
    if (!retentionDays) return;
    const cutoff = Date.now() - retentionDays * 864e5;
    for (const f of fs.readdirSync(dir)) {
      const m = /^app-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
      if (m && Date.parse(m[1] + 'T23:59:59Z') < cutoff) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ } }
    }
  };
  fs.mkdirSync(dir, { recursive: true });
  return {
    write(line) {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== day) {
        if (stream) stream.end();
        day = today;
        stream = fs.createWriteStream(path.join(dir, `app-${day}.log`), { flags: 'a' });
        prune();
      }
      stream.write(line + '\n');
    },
    close: () => new Promise((res) => (stream ? stream.end(res) : res())),
  };
}

function createLogger({ level = 'info', format = 'json', dir = '', fileRetentionDays = 14, out = (l) => process.stdout.write(l + '\n'), base = {} } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const file = dir ? fileSink(dir, fileRetentionDays) : null;

  const emit = (lvl, msg, fields) => {
    if (LEVELS[lvl] < min) return;
    const rec = { time: new Date().toISOString(), level: lvl, msg, ...base, ...redact(fields || {}) };
    const json = JSON.stringify(rec);
    if (format === 'pretty') {
      const { time, level: _l, msg: _m, ...rest } = rec;
      const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
      out(`${COLORS[lvl]}${time.slice(11, 19)} ${lvl.toUpperCase().padEnd(5)}\x1b[0m ${msg}${extra}`);
    } else out(json);
    if (file) file.write(json);
  };

  const logger = {
    level,
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ level, format, dir: '', out: (l) => { out(l); }, base: { ...base, ...fields } }),
    close: () => (file ? file.close() : Promise.resolve()),
  };
  return logger;
}

const logger = createLogger({ level: config.log.level, format: config.log.format, dir: config.log.dir, fileRetentionDays: config.log.fileRetentionDays });

module.exports = { logger, createLogger, redact, LEVELS };
