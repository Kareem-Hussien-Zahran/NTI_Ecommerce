/* Exercises scripts/backup.sh and restore.sh with stub mongodump/mongorestore binaries (no database needed). */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = path.resolve(__dirname, '../../scripts');
let dir, env;

const run = (script, args = [], extra = {}, input) => spawnSync('bash', [path.join(SCRIPTS, script), ...args], { env: { ...env, ...extra }, encoding: 'utf8', input });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  fs.mkdirSync(path.join(dir, 'bin')); fs.mkdirSync(path.join(dir, 'uploads')); fs.mkdirSync(path.join(dir, 'backups'));
  // stubs record their arguments; mongodump writes a fake archive to the --archive path
  fs.writeFileSync(path.join(dir, 'bin/mongodump'), `#!/usr/bin/env bash
echo "$@" >> "${dir}/calls.log"
for a in "$@"; do case "$a" in --archive=*) echo "FAKE-DUMP" > "\${a#--archive=}";; esac; done
[ -z "$FAIL_DUMP" ] || exit 1
`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'bin/mongorestore'), `#!/usr/bin/env bash\necho "restore $@" >> "${dir}/calls.log"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'uploads/a.png'), 'img');
  env = { PATH: `${dir}/bin:${process.env.PATH}`, MONGODB_URI: 'mongodb://db/test', BACKUP_DIR: path.join(dir, 'backups'), UPLOADS_DIR: path.join(dir, 'uploads'), HOME: dir };
});

const backups = () => fs.readdirSync(path.join(dir, 'backups'));

test('backup creates a database archive and an uploads archive', () => {
  const r = run('backup.sh');
  assert.equal(r.status, 0, r.stderr);
  const files = backups();
  assert.equal(files.filter((f) => /^db-\d{8}-\d{6}\.archive\.gz$/.test(f)).length, 1);
  assert.equal(files.filter((f) => /^uploads-\d{8}-\d{6}\.tar\.gz$/.test(f)).length, 1);
  assert.ok(!files.some((f) => f.endsWith('.part')), 'no temp files left behind');
  assert.match(fs.readFileSync(path.join(dir, 'calls.log'), 'utf8'), /--uri=mongodb:\/\/db\/test .*--gzip/);
  const tar = spawnSync('tar', ['-tzf', path.join(dir, 'backups', files.find((f) => f.startsWith('uploads-')))], { encoding: 'utf8' });
  assert.match(tar.stdout, /a\.png/);
});

test('backup skips the uploads archive when there are no uploads', () => {
  fs.rmSync(path.join(dir, 'uploads/a.png'));
  assert.equal(run('backup.sh').status, 0);
  assert.equal(backups().filter((f) => f.startsWith('uploads-')).length, 0);
});

test('a failed dump leaves no partial backup and exits non-zero', () => {
  const r = run('backup.sh', [], { FAIL_DUMP: '1' });
  assert.notEqual(r.status, 0);
  assert.ok(!backups().some((f) => f.startsWith('db-') && !f.endsWith('.part')), 'must not publish a bad backup');
});

test('retention prunes only old backups', () => {
  const old = path.join(dir, 'backups/db-20200101-000000.archive.gz');
  const oldUp = path.join(dir, 'backups/uploads-20200101-000000.tar.gz');
  const keep = path.join(dir, 'backups/notes.txt');
  for (const f of [old, oldUp, keep]) fs.writeFileSync(f, 'x');
  const past = new Date(Date.now() - 30 * 864e5);
  for (const f of [old, oldUp, keep]) fs.utimesSync(f, past, past);
  assert.equal(run('backup.sh', [], { RETENTION_DAYS: '14' }).status, 0);
  assert.ok(!fs.existsSync(old) && !fs.existsSync(oldUp), 'old backups pruned');
  assert.ok(fs.existsSync(keep), 'unrelated files untouched');
  assert.equal(backups().filter((f) => f.startsWith('db-2026') || /^db-\d{8}/.test(f)).length >= 1, true, 'new backup kept');
});

test('RETENTION_DAYS=0 keeps everything', () => {
  const old = path.join(dir, 'backups/db-20200101-000000.archive.gz');
  fs.writeFileSync(old, 'x'); const past = new Date(Date.now() - 400 * 864e5); fs.utimesSync(old, past, past);
  run('backup.sh', [], { RETENTION_DAYS: '0' });
  assert.ok(fs.existsSync(old));
});

test('restore requires confirmation and a file', () => {
  assert.equal(run('restore.sh').status, 2);
  assert.notEqual(run('restore.sh', ['missing.archive.gz'], { CONFIRM: 'yes' }).status, 0);
  const f = path.join(dir, 'backups/db-1.archive.gz'); fs.writeFileSync(f, 'x');
  const r = spawnSync('bash', [path.join(SCRIPTS, 'restore.sh'), f], { env, input: 'no\n', encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'calls.log')) || !/restore/.test(fs.readFileSync(path.join(dir, 'calls.log'), 'utf8')), 'must not restore without confirmation');
});

test('restore drops existing data, restores uploads and accepts bare file names', () => {
  run('backup.sh');
  const [db, up] = [backups().find((f) => f.startsWith('db-')), backups().find((f) => f.startsWith('uploads-'))];
  fs.rmSync(path.join(dir, 'uploads/a.png'));
  const r = run('restore.sh', [db, up], { CONFIRM: 'yes' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'calls.log'), 'utf8'), /restore --uri=mongodb:\/\/db\/test --archive=.*--gzip --drop/);
  assert.ok(fs.existsSync(path.join(dir, 'uploads/a.png')), 'uploads restored');
});

test('restore prompt never prints the password from the connection string', () => {
  assert.equal(run('backup.sh').status, 0);
  const db = backups().find((f) => f.startsWith('db-'));
  const uri = 'mongodb+srv://shop:S3cretPw@cluster0.ab1cd.mongodb.net/myStore';
  const r = run('restore.sh', [db], { MONGODB_URI: uri }, 'no\n');
  assert.notEqual(r.status, 0, 'declining must abort');
  const out = r.stdout + r.stderr;
  assert.ok(!out.includes('S3cretPw'), 'password leaked: ' + out);
  assert.match(out, /\*\*\*@cluster0\.ab1cd\.mongodb\.net\/myStore/);
  assert.ok(!fs.existsSync(path.join(dir, 'calls.log')) || !/restore /.test(fs.readFileSync(path.join(dir, 'calls.log'), 'utf8')), 'mongorestore must not run');
});
