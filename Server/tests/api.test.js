const { connect, disconnect, apiFor, makeUser } = require('./helpers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

let ctx, api, app;
before(async () => { ctx = await connect('api'); app = ctx.app; api = apiFor(app); });
after(() => disconnect(ctx));

const needsRealMongo = (t) => { if (ctx.isFerret) { t.skip('needs real MongoDB ($elemMatch on sub-documents)'); return true; } return false; };

const creds = { firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com', password: 'Passw0rd!' };
const address = { fullName: 'Jane Doe', phone: '123456', street: '1 Main St', city: 'Cairo', postalCode: '11511', country: 'Egypt' };
let adminToken, userToken, refreshToken, product, order;

test('health', async () => { await request(app).get('/health').expect(200); });

test('unknown route returns a JSON 404', async () => {
  const r = await request(app).get('/api/v1/nope').expect(404);
  assert.match(r.body.message, /not found/i);
});

test('register validates input and never lets the client choose a role', async () => {
  await api('post', '/auth/register').send({ ...creds, password: 'weak' }).expect(400);
  const res = await api('post', '/auth/register').send({ ...creds, role: 'admin' }).expect(201);
  assert.equal(res.body.user.role, 'customer');
  assert.equal(res.body.user.password, undefined);
  userToken = res.body.accessToken; refreshToken = res.body.refreshToken;
  await api('post', '/auth/register').send(creds).expect(409);
});

test('login rejects bad credentials, refresh tokens rotate and cannot be reused', async () => {
  await api('post', '/auth/login').send({ email: creds.email, password: 'wrong-pass' }).expect(401);
  await api('post', '/auth/login').send({ email: 'nobody@test.com', password: 'Passw0rd!' }).expect(401);
  const ok = await api('post', '/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
  assert.ok(ok.body.accessToken);
  const r1 = await api('post', '/auth/refresh').send({ refreshToken }).expect(200);
  await api('post', '/auth/refresh').send({ refreshToken }).expect(401); // reuse detected
  userToken = r1.body.accessToken;
  await api('get', '/auth/me').expect(401);
  await api('get', '/auth/me', userToken).expect(200);
});

test('account locks after repeated failed logins', async () => {
  await makeUser(app, { email: 'lock@test.com' });
  for (let i = 0; i < 5; i++) await api('post', '/auth/login').send({ email: 'lock@test.com', password: 'Wrong-pass1' }).expect(401);
  await api('post', '/auth/login').send({ email: 'lock@test.com', password: 'Passw0rd!' }).expect(423);
});

test('suspended users cannot log in', async () => {
  await makeUser(app, { email: 'sus@test.com', status: 'suspended' });
  await api('post', '/auth/login').send({ email: 'sus@test.com', password: 'Passw0rd!' }).expect(403);
});

test('changing the password revokes old tokens', async () => {
  const { token } = await makeUser(app, { email: 'pw@test.com' });
  await api('post', '/auth/change-password', token).send({ currentPassword: 'bad', newPassword: 'NewPassw0rd!' }).expect(400);
  await new Promise((r) => setTimeout(r, 1100)); // JWT iat has 1s resolution
  const res = await api('post', '/auth/change-password', token).send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd!' }).expect(200);
  await api('get', '/auth/me', token).expect(401);
  await api('get', '/auth/me', res.body.accessToken).expect(200);
});

test('RBAC: customers cannot reach admin routes', async () => {
  await api('post', '/categories', userToken).send({ name: 'X' }).expect(403);
  await api('get', '/users', userToken).expect(403);
  await api('get', '/admin/stats', userToken).expect(403);
  await api('get', '/admin/reports/sales', userToken).expect(403);
  adminToken = (await makeUser(app, { email: 'admin@test.com', role: 'admin' })).token;
  await api('get', '/users', adminToken).expect(200);
});

test('admin manages users but not themselves', async () => {
  const me = (await api('get', '/auth/me', adminToken)).body;
  await api('patch', `/users/${me._id}`, adminToken).send({ role: 'customer' }).expect(400);
  await api('delete', `/users/${me._id}`, adminToken).expect(400);
  const jane = (await api('get', '/users?q=jane', adminToken).expect(200)).body.items[0];
  assert.equal((await api('patch', `/users/${jane._id}`, adminToken).send({ status: 'active' }).expect(200)).body.status, 'active');
});

test('admin creates catalog + product; public can list, filter and search', async () => {
  const cat = (await api('post', '/categories', adminToken).send({ name: 'Tops' }).expect(201)).body;
  const brand = (await api('post', '/brands', adminToken).send({ name: 'Acme' }).expect(201)).body;
  assert.equal(cat.slug, 'tops');
  await api('post', '/categories', adminToken).send({ name: 'Tops' }).expect(409);
  product = (await api('post', '/products', adminToken).send({
    name: 'Test Tee', description: 'Nice', price: 20, gender: 'unisex', productType: 't-shirt', brand: brand._id, category: cat._id,
    variants: [{ sku: 'TT-M', size: 'M', stock: 2, color: { name: 'Black' } }, { sku: 'TT-L', size: 'L', stock: 5 }],
  }).expect(201)).body;
  assert.equal(product.slug, 'test-tee');
  await api('post', '/products', adminToken).send({ name: 'Bad' }).expect(400);
  await api('post', '/products', adminToken).send({ ...product, _id: undefined, variants: [{ sku: 'A', stock: 1 }, { sku: 'A', stock: 1 }], brand: brand._id, category: cat._id, description: 'd', gender: 'men', price: 1, name: 'Dup' }).expect(400);
  await api('delete', `/categories/${cat._id}`, adminToken).expect(409); // used by a product

  assert.equal((await api('get', '/products?category=tops&sort=price_asc&minPrice=10').expect(200)).body.meta.total, 1);
  assert.equal((await api('get', '/products?category=nonexistent').expect(200)).body.meta.total, 0);
  assert.equal((await api('get', '/products?q=Tee').expect(200)).body.items.length, 1);
  assert.equal((await api('get', '/products?q=zzz').expect(200)).body.items.length, 0);
  assert.equal((await api('get', '/products?maxPrice=5').expect(200)).body.meta.total, 0);
  await api('get', '/products/test-tee').expect(200);
  await api('get', '/products?gender=alien').expect(400);
  // operator-style query params are ignored, never executed
  assert.equal((await api('get', '/products?minPrice[$gt]=1').expect(200)).body.meta.total, 1);
});

test('variant size filter (needs real MongoDB)', async (t) => {
  if (needsRealMongo(t)) return;
  assert.equal((await api('get', '/products?size=M&inStock=true').expect(200)).body.meta.total, 1);
  assert.equal((await api('get', '/products?size=XL').expect(200)).body.meta.total, 0);
});

test('hidden products are invisible to the public but visible to admins', async () => {
  await api('put', `/products/${product._id}`, adminToken).send({ isActive: false }).expect(200);
  await api('get', '/products/test-tee').expect(404);
  assert.equal((await api('get', '/products').expect(200)).body.meta.total, 0);
  assert.equal((await api('get', '/products?includeInactive=true', adminToken).expect(200)).body.meta.total, 1);
  await api('put', `/products/${product._id}`, adminToken).send({ isActive: true }).expect(200);
});

test('cart enforces stock and computes totals server-side', async () => {
  await api('post', '/cart/items', userToken).send({ productId: product._id, sku: 'TT-M', quantity: 3 }).expect(400);
  await api('post', '/cart/items', userToken).send({ productId: product._id, sku: 'NOPE', quantity: 1 }).expect(404);
  const res = await api('post', '/cart/items', userToken).send({ productId: product._id, sku: 'TT-M', quantity: 2 }).expect(200);
  assert.deepEqual([res.body.subtotal, res.body.shippingFee, res.body.total], [40, 5, 49]);
  const upd = await api('patch', `/cart/items/${product._id}/TT-M`, userToken).send({ quantity: 1 }).expect(200);
  assert.equal(upd.body.count, 1);
  await api('post', '/cart/items', userToken).send({ productId: product._id, sku: 'TT-M', quantity: 1 }).expect(200); // back to 2
  await api('get', '/cart').expect(401);
});

test('checkout validates the address and needs a non-empty cart', async () => {
  await api('post', '/orders', userToken).send({ shippingAddress: { fullName: 'x' } }).expect(400);
  const { token } = await makeUser(app, { email: 'empty@test.com' });
  await api('post', '/orders', token).send({ shippingAddress: address }).expect(400);
});

test('checkout reserves stock atomically and clears the cart (needs real MongoDB)', async (t) => {
  if (needsRealMongo(t)) return;
  order = (await api('post', '/orders', userToken).send({ shippingAddress: address, paymentMethod: 'card' }).expect(201)).body;
  assert.equal(order.status, 'paid');
  assert.equal((await api('get', `/products/${product._id}`).expect(200)).body.variants.find((v) => v.sku === 'TT-M').stock, 0);
  assert.equal((await api('get', '/cart', userToken)).body.count, 0);
  await api('post', '/cart/items', userToken).send({ productId: product._id, sku: 'TT-M', quantity: 1 }).expect(400);
});

test('concurrent checkouts cannot oversell (needs real MongoDB)', async (t) => {
  if (needsRealMongo(t)) return;
  const Product = require('mongoose').models.Product;
  await Product.updateOne({ _id: product._id, 'variants.sku': 'TT-L' }, { $set: { 'variants.$.stock': 1 } });
  const buyers = await Promise.all([1, 2, 3].map((i) => makeUser(app, { email: `race${i}@test.com` })));
  for (const b of buyers) await api('post', '/cart/items', b.token).send({ productId: product._id, sku: 'TT-L', quantity: 1 }).expect(200);
  const results = await Promise.all(buyers.map((b) => api('post', '/orders', b.token).send({ shippingAddress: address })));
  assert.equal(results.filter((r) => r.status === 201).length, 1, 'exactly one order wins the last unit');
  assert.equal(results.filter((r) => r.status === 409).length, 2);
  assert.equal((await Product.findById(product._id)).variants.find((v) => v.sku === 'TT-L').stock, 0);
});

test('cancel restocks, admin status flow, reviews require delivery (needs real MongoDB)', async (t) => {
  if (needsRealMongo(t)) return;
  await api('post', `/orders/${order._id}/cancel`, userToken).expect(200);
  assert.equal((await api('get', `/products/${product._id}`)).body.variants.find((v) => v.sku === 'TT-M').stock, 2);
  await api('post', `/orders/${order._id}/cancel`, userToken).expect(400);

  await api('post', '/cart/items', userToken).send({ productId: product._id, sku: 'TT-M', quantity: 1 });
  const o2 = (await api('post', '/orders', userToken).send({ shippingAddress: address })).body;
  assert.equal(o2.status, 'pending');
  await api('post', `/products/${product._id}/reviews`, userToken).send({ rating: 5 }).expect(403);
  await api('patch', `/orders/${o2._id}/status`, userToken).send({ status: 'delivered' }).expect(403);
  await api('patch', `/orders/${o2._id}/status`, adminToken).send({ status: 'delivered' }).expect(200);
  await api('patch', `/orders/${o2._id}/status`, adminToken).send({ status: 'paid' }).expect(400); // terminal state
  await api('post', `/products/${product._id}/reviews`, userToken).send({ rating: 4, comment: 'Good' }).expect(201);
  await api('post', `/products/${product._id}/reviews`, userToken).send({ rating: 2 }).expect(201); // updates, not duplicates
  const p = (await api('get', `/products/${product._id}`)).body;
  assert.deepEqual([p.ratingAverage, p.ratingCount], [2, 1]);
  assert.equal((await api('get', '/orders/mine', userToken).expect(200)).body.meta.total, 2);
  const stranger = await makeUser(app, { email: 'stranger@test.com' });
  await api('get', `/orders/${o2._id}`, stranger.token).expect(404); // other customers' orders are invisible
});

test('wishlist toggle and admin stats', async () => {
  assert.equal((await api('post', `/wishlist/${product._id}`, userToken)).body.wishlisted, true);
  assert.equal((await api('get', '/wishlist', userToken)).body.length, 1);
  assert.equal((await api('post', `/wishlist/${product._id}`, userToken)).body.wishlisted, false);
  const s = (await api('get', '/admin/stats', adminToken).expect(200)).body;
  assert.ok(s.customers >= 1);
  assert.equal(s.daily.length, 30);
  assert.ok(s.lowStock.length >= 1);
});

test('image uploads accept images only', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const up = await api('post', '/uploads/images', adminToken).attach('images', png, { filename: 'a.png', contentType: 'image/png' }).expect(201);
  assert.match(up.body.urls[0], /^\/uploads\/.+\.png$/);
  await api('post', '/uploads/images', adminToken).attach('images', Buffer.from('x'), { filename: 'a.exe', contentType: 'application/x-msdownload' }).expect(400);
  await api('post', '/uploads/images', adminToken).expect(400);
  await api('post', '/uploads/images', userToken).attach('images', png, { filename: 'a.png', contentType: 'image/png' }).expect(403);
});

test('security headers and malformed JSON handling', async () => {
  const r = await request(app).get('/health');
  assert.equal(r.headers['x-powered-by'], undefined);
  assert.ok(r.headers['x-content-type-options']);
  const bad = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{oops');
  assert.equal(bad.status, 400);
});
