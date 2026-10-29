const { connect, disconnect, apiFor, makeUser } = require('./helpers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let ctx, api, adminToken, cat, brand, product;
const variants = [{ sku: 'C-M', size: 'M', stock: 5 }];

before(async () => {
  ctx = await connect('cache'); api = apiFor(ctx.app);
  adminToken = (await makeUser(ctx.app, { email: 'admin@test.com', role: 'admin' })).token;
  cat = (await api('post', '/categories', adminToken).send({ name: 'Tops' })).body;
  brand = (await api('post', '/brands', adminToken).send({ name: 'Acme' })).body;
  product = (await api('post', '/products', adminToken).send({ name: 'Cached Tee', description: 'd', price: 20, gender: 'unisex', brand: brand._id, category: cat._id, variants })).body;
});
after(() => disconnect(ctx));

const xcache = (r) => r.headers['x-cache'];

test('public catalog responses are cached: MISS then HIT with identical bodies', async () => {
  const a = await api('get', '/categories').expect(200);
  const b = await api('get', '/categories').expect(200);
  assert.equal(xcache(a), 'MISS'); assert.equal(xcache(b), 'HIT');
  assert.deepEqual(a.body, b.body);
  assert.match(b.headers['cache-control'], /max-age=60/);
});

test('product list and detail are cached separately per URL', async () => {
  assert.equal(xcache(await api('get', '/products')), 'MISS');
  assert.equal(xcache(await api('get', '/products')), 'HIT');
  assert.equal(xcache(await api('get', '/products?sort=price_asc')), 'MISS');
  assert.equal(xcache(await api('get', `/products/${product.slug}`)), 'MISS');
  assert.equal(xcache(await api('get', `/products/${product.slug}`)), 'HIT');
});

test('updating a product invalidates cached product responses', async () => {
  await api('get', `/products/${product.slug}`); // warm
  await api('put', `/products/${product._id}`, adminToken).send({ price: 35 }).expect(200);
  const r = await api('get', `/products/${product.slug}`).expect(200);
  assert.equal(xcache(r), 'MISS');
  assert.equal(r.body.price, 35, 'must not serve the stale price');
  assert.equal((await api('get', '/products')).body.items[0].price, 35);
});

test('category writes invalidate the catalog and populated product names', async () => {
  await api('get', '/categories'); await api('get', '/products');
  await api('put', `/categories/${cat._id}`, adminToken).send({ name: 'T-Shirts' }).expect(200);
  assert.equal(xcache(await api('get', '/categories')), 'MISS');
  const list = await api('get', '/products').expect(200);
  assert.equal(xcache(list), 'MISS');
  assert.equal(list.body.items[0].category.name, 'T-Shirts');
});

test('failed writes do not invalidate the cache', async () => {
  await api('get', '/categories');
  await api('post', '/categories', adminToken).send({ name: 'x' }).expect(400); // too short -> validation error
  assert.equal(xcache(await api('get', '/categories')), 'HIT');
});

test('admins bypass the cache so they always see fresh data', async () => {
  const r = await api('get', '/products?includeInactive=true', adminToken).expect(200);
  assert.equal(xcache(r), 'BYPASS');
});

test('errors are never cached', async () => {
  assert.equal((await api('get', '/products/does-not-exist')).status, 404);
  assert.equal((await api('get', '/products/does-not-exist')).status, 404);
  const r = await api('get', '/products/does-not-exist');
  assert.equal(xcache(r), 'MISS');
});

test('conditional requests return 304 via ETag', async () => {
  const first = await api('get', '/categories').expect(200);
  const second = await api('get', '/categories').set('If-None-Match', first.headers.etag);
  assert.equal(second.status, 304);
});

test('admin can read cache stats and flush it', async () => {
  await api('get', '/categories');
  const s = (await api('get', '/admin/cache', adminToken).expect(200)).body;
  assert.ok(s.entries >= 1 && s.hits >= 1 && s.enabled);
  const cleared = (await api('delete', '/admin/cache', adminToken).expect(200)).body.cleared;
  assert.ok(cleared >= 1);
  assert.equal(xcache(await api('get', '/categories')), 'MISS');
  await api('get', '/admin/cache').expect(401);
});

test('report responses are cached and refreshed after user changes', async () => {
  const a = await api('get', '/admin/reports/inventory', adminToken).expect(200);
  const b = await api('get', '/admin/reports/inventory', adminToken).expect(200);
  assert.deepEqual([xcache(a), xcache(b)], ['MISS', 'HIT']);
  await api('put', `/products/${product._id}`, adminToken).send({ variants: [{ sku: 'C-M', size: 'M', stock: 0 }] }).expect(200);
  const c = await api('get', '/admin/reports/inventory', adminToken).expect(200);
  assert.equal(xcache(c), 'MISS');
  assert.equal(c.body.totals.out, 1);
});
