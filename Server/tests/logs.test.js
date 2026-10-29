const { connect, disconnect, apiFor, makeUser } = require('./helpers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ActivityLog = require('../src/models/activitylog.model');

let ctx, api, admin, customer, cat, brand;

before(async () => {
  ctx = await connect('logs'); api = apiFor(ctx.app);
  admin = await makeUser(ctx.app, { email: 'admin@logs.test', role: 'admin' });
  customer = await makeUser(ctx.app, { email: 'cust@logs.test' });
  cat = (await api('post', '/categories', admin.token).send({ name: 'Tops' })).body;
  brand = (await api('post', '/brands', admin.token).send({ name: 'Acme' })).body;
});
after(() => disconnect(ctx));

const find = (q) => ActivityLog.find(q).lean();

test('every response carries an X-Request-Id and a sane incoming one is echoed', async () => {
  const a = await api('get', '/categories');
  assert.ok(a.headers['x-request-id']);
  const b = await api('get', '/categories').set('X-Request-Id', 'trace-abc-123');
  assert.equal(b.headers['x-request-id'], 'trace-abc-123');
});

test('login success and failure are recorded (failure as security, never with the password)', async () => {
  await api('post', '/auth/login').send({ email: 'cust@logs.test', password: 'WrongPass1!' }).expect(401);
  await api('post', '/auth/login').send({ email: 'nobody@logs.test', password: 'WrongPass1!' }).expect(401);
  const failed = await find({ action: 'auth.login_failed' });
  assert.equal(failed.length, 2);
  assert.ok(failed.every((x) => x.type === 'security'));
  assert.deepEqual(failed.map((x) => x.meta.reason).sort(), ['bad_password', 'unknown_user']);
  assert.ok(!JSON.stringify(failed).includes('WrongPass1!'));
  assert.ok((await find({ action: 'auth.login' })).length >= 2);
});

test('access denied is a security event', async () => {
  await api('get', '/admin/logs', customer.token).expect(403);
  const d = await find({ action: 'access.denied' });
  assert.equal(d.length, 1);
  assert.equal(d[0].actor.email, 'cust@logs.test');
});

test('product create/update/delete and role change leave an audit trail with the actor', async () => {
  const p = (await api('post', '/products', admin.token).send({
    name: 'Logged Tee', description: 'd', price: 20, gender: 'unisex', brand: brand._id, category: cat._id, variants: [{ sku: 'L-M', size: 'M', stock: 3 }],
  }).expect(201)).body;
  await api('put', `/products/${p._id}`, admin.token).send({ price: 25 }).expect(200);
  await api('delete', `/products/${p._id}`, admin.token).expect(204);
  const acts = (await find({ action: /^product\./ })).map((x) => x.action).sort();
  assert.deepEqual(acts, ['product.create', 'product.delete', 'product.update']);
  const created = await ActivityLog.findOne({ action: 'product.create' }).lean();
  assert.equal(created.actor.email, 'admin@logs.test'); assert.equal(created.target.label, 'Logged Tee'); assert.ok(created.requestId);

  await api('patch', `/users/${customer.user._id}`, admin.token).send({ role: 'admin' }).expect(200);
  const u = await ActivityLog.findOne({ action: 'user.update' }).lean();
  assert.equal(u.meta.changes.role, 'admin');
});

test('GET /admin/logs filters, paginates and summarises; customers are refused', async () => {
  const all = (await api('get', '/admin/logs?limit=2', admin.token).expect(200)).body;
  assert.equal(all.items.length, 2);
  assert.ok(all.meta.total > 2);
  assert.ok(all.summary.last24h.security >= 3);

  const sec = (await api('get', '/admin/logs?type=security', admin.token).expect(200)).body;
  assert.ok(sec.items.length > 0 && sec.items.every((x) => x.type === 'security'));

  const pref = (await api('get', '/admin/logs?action=product.', admin.token).expect(200)).body;
  assert.equal(pref.meta.total, 3);

  const q = (await api('get', '/admin/logs?q=Logged%20Tee', admin.token).expect(200)).body;
  assert.ok(q.meta.total >= 3);

  const future = (await api('get', '/admin/logs?from=2999-01-01', admin.token).expect(200)).body;
  assert.equal(future.meta.total, 0);
  await api('get', '/admin/logs?type=bogus', admin.token).expect(400);
  await api('get', '/admin/logs').expect(401);
});

test('GET /admin/logs?format=csv exports and audits the export', async () => {
  const r = await api('get', '/admin/logs?format=csv&type=security', admin.token).expect(200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.text, /^time,type,action,actor/);
  assert.match(r.text, /auth\.login_failed/);
  assert.equal((await find({ action: 'logs.export' })).length, 1);
});

test('GET /admin/system reports health, cache, logging and backup state', async () => {
  const s = (await api('get', '/admin/system', admin.token).expect(200)).body;
  assert.equal(s.api.status, 'ok'); assert.equal(s.db.status, 'ok');
  assert.ok(s.memory.rssMb > 0);
  assert.equal(typeof s.cache.hitRate, 'number');
  assert.equal(s.backup.state, 'not_configured');
  assert.ok('User' in s.db.collections);
  const plain = await makeUser(ctx.app, { email: 'plain@logs.test' });
  await api('get', '/admin/system', plain.token).expect(403);
});

test('cache clear is audited', async () => {
  await api('delete', '/admin/cache', admin.token).expect(200);
  assert.equal((await find({ action: 'cache.clear' })).length, 1);
});
