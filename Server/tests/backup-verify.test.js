/* scripts/verify-backup.sh: detects missing, empty, truncated and corrupt backup files (no database needed). */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/verify-backup.sh');
let dir;
const run = (args = []) => spawnSync('bash', [SCRIPT, ...args], { env: { PATH: process.env.PATH, BACKUP_DIR: dir }, encoding: 'utf8' });
const gz = (name, text = 'hello world '.repeat(500)) => fs.writeFileSync(path.join(dir, name), zlib.gzipSync(text));
const tgz = (name) => {
  fs.mkdirSync(path.join(dir, 'u'), { recursive: true }); fs.writeFileSync(path.join(dir, 'u/a.png'), 'img');
  assert.equal(spawnSync('tar', ['-czf', path.join(dir, name), '-C', path.join(dir, 'u'), '.']).status, 0);
};

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkv-')); });

test('passes for a healthy database + uploads backup (newest are picked automatically)', () => {
  gz('db-20260101-000000.archive.gz', 'old'); gz('db-20260301-000000.archive.gz'); tgz('uploads-20260301-000000.tar.gz');
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+.*db-20260301/);
  assert.match(r.stdout, /ok\s+.*uploads-20260301/);
  assert.doesNotMatch(r.stdout, /db-20260101/);
});

test('fails when there is no backup at all', () => {
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no database backup/);
});

test('detects a truncated gzip archive', () => {
  const good = zlib.gzipSync(Buffer.from('x'.repeat(100000) + Math.random()));
  fs.writeFileSync(path.join(dir, 'db-20260101-000000.archive.gz'), good.subarray(0, Math.floor(good.length / 2)));
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /FAIL corrupt gzip/);
});

test('detects an empty file and a corrupt tar', () => {
  fs.writeFileSync(path.join(dir, 'db-20260101-000000.archive.gz'), '');
  assert.match(run().stdout, /FAIL missing or empty/);
  gz('db-20260102-000000.archive.gz');
  fs.writeFileSync(path.join(dir, 'uploads-20260102-000000.tar.gz'), 'not a tarball');
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /FAIL corrupt tar/);
});

test('verifies explicit files by path or bare name and fails if any is bad', () => {
  gz('db-1.archive.gz'); fs.writeFileSync(path.join(dir, 'db-2.archive.gz'), 'garbage');
  assert.equal(run(['db-1.archive.gz']).status, 0);
  assert.equal(run([path.join(dir, 'db-1.archive.gz')]).status, 0);
  assert.notEqual(run(['db-1.archive.gz', 'db-2.archive.gz']).status, 0);
  assert.notEqual(run(['nope.archive.gz']).status, 0);
});
