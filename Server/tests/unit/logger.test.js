const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger, redact } = require('../../src/utils/logger');

test('redact hides secrets at any depth and serialises errors', () => {
  const out = redact({ email: 'a@b.c', password: 'x', nested: { accessToken: 't', ok: 1 }, headers: { authorization: 'Bearer z' }, err: new Error('boom') });
  assert.equal(out.email, 'a@b.c');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.nested.accessToken, '[REDACTED]');
  assert.equal(out.nested.ok, 1);
  assert.equal(out.headers.authorization, '[REDACTED]');
  assert.equal(out.err.message, 'boom');
});

test('logger honours level and emits JSON lines', () => {
  const lines = [];
  const log = createLogger({ level: 'warn', format: 'json', out: (l) => lines.push(l) });
  log.info('hidden'); log.warn('shown', { password: 'p', a: 1 });
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.msg, 'shown'); assert.equal(rec.level, 'warn'); assert.equal(rec.password, '[REDACTED]'); assert.equal(rec.a, 1);
});

test('file sink writes a daily file and prunes expired ones', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-'));
  fs.writeFileSync(path.join(dir, 'app-2000-01-01.log'), 'old\n');
  const log = createLogger({ level: 'info', format: 'json', dir, fileRetentionDays: 7, out: () => {} });
  log.info('hello', { x: 1 });
  await log.close();
  const files = fs.readdirSync(dir);
  const today = `app-${new Date().toISOString().slice(0, 10)}.log`;
  assert.ok(files.includes(today), 'today file exists');
  assert.ok(!files.includes('app-2000-01-01.log'), 'old file pruned');
  assert.match(fs.readFileSync(path.join(dir, today), 'utf8'), /"msg":"hello"/);
});
