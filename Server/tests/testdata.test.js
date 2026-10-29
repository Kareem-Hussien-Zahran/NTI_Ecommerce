const { connect, disconnect, apiFor } = require('./helpers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = mongoose.mongo.BSON;
const config = require('../src/config/env');

const DIR = path.join(__dirname, '../testdata');
const COLS = ['users', 'categories', 'brands', 'products', 'carts', 'orders', 'reviews', 'activitylogs'];
const D = Object.fromEntries(COLS.map((c) => [c, EJSON.deserialize(JSON.parse(fs.readFileSync(path.join(DIR, `${c}.json`), 'utf8')))]));
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const id = (x) => String(x);
const round2 = (n) => Math.round(n * 100) / 100;

let ctx, api;
before(async () => {
  ctx = await connect('testdata'); api = apiFor(ctx.app);
  for (const c of COLS) await mongoose.connection.db.collection(c).insertMany(D[c]);
});
after(() => disconnect(ctx));

test('manifest counts match the files and the dataset is rich enough', () => {
  for (const c of COLS) assert.equal(D[c].length, manifest.counts[c], c);
  assert.ok(D.orders.length >= 100 && D.products.length >= 25 && D.users.length >= 15 && D.reviews.length >= 25 && D.activitylogs.length >= 200);
});

test('pricing constants in the generator match the server configuration', () => {
  assert.equal(config.shipping.flatFee, 5); assert.equal(config.shipping.freeOver, 100); assert.equal(config.taxRate, 0.1);
});

test('every reference resolves and every order total is arithmetically correct', () => {
  const ids = Object.fromEntries(['users', 'categories', 'brands', 'products'].map((c) => [c, new Set(D[c].map((d) => id(d._id)))]));
  for (const p of D.products) { assert.ok(ids.brands.has(id(p.brand))); assert.ok(ids.categories.has(id(p.category))); }
  for (const c of D.categories) if (c.parent) assert.ok(ids.categories.has(id(c.parent)));
  const skus = new Map(D.products.map((p) => [id(p._id), new Map(p.variants.map((v) => [v.sku, v]))]));
  for (const o of D.orders) {
    assert.ok(ids.users.has(id(o.user)));
    const sub = round2(o.items.reduce((s, i) => { assert.ok(skus.get(id(i.product))?.has(i.sku), `sku ${i.sku}`); return s + round2(i.price * i.quantity); }, 0));
    assert.equal(o.subtotal, sub, o.orderNumber);
    assert.equal(o.shippingFee, sub >= config.shipping.freeOver ? 0 : config.shipping.flatFee);
    assert.equal(o.tax, round2(sub * config.taxRate));
    assert.equal(o.total, round2(o.subtotal + o.shippingFee + o.tax));
    assert.equal(o.statusHistory.at(-1).status, o.status);
  }
  for (const c of D.carts) { assert.ok(ids.users.has(id(c.user))); for (const i of c.items) assert.ok(skus.get(id(i.product)).has(i.sku)); }
  assert.equal(new Set(D.orders.map((o) => o.orderNumber)).size, D.orders.length);
});

test('covers every order status, both payment methods, free and paid shipping, sold-out and low stock', () => {
  assert.deepEqual([...new Set(D.orders.map((o) => o.status))].sort(), ['cancelled', 'delivered', 'paid', 'pending', 'processing', 'shipped']);
  assert.deepEqual([...new Set(D.orders.map((o) => o.paymentMethod))].sort(), ['card', 'cod']);
  assert.ok(D.orders.some((o) => o.shippingFee === 0) && D.orders.some((o) => o.shippingFee > 0));
  const variants = D.products.flatMap((p) => p.variants);
  assert.ok(variants.some((v) => v.stock === 0) && variants.some((v) => v.stock > 0 && v.stock < 5));
  assert.ok(D.products.some((p) => !p.isActive));
  assert.deepEqual([...new Set(D.users.map((u) => u.status))].sort(), ['active', 'banned', 'inactive', 'suspended']);
});

test('reviews come only from customers with a delivered order, and product ratings match', () => {
  const delivered = new Set(D.orders.filter((o) => o.status === 'delivered').flatMap((o) => o.items.map((i) => `${id(o.user)}:${id(i.product)}`)));
  const byProduct = {};
  for (const r of D.reviews) { assert.ok(delivered.has(`${id(r.user)}:${id(r.product)}`)); (byProduct[id(r.product)] ||= []).push(r.rating); }
  for (const p of D.products) {
    const rs = byProduct[id(p._id)] || [];
    assert.equal(p.ratingCount, rs.length);
    assert.equal(p.ratingAverage, rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10 : 0);
  }
});

test('documents pass the real Mongoose validation rules', async () => {
  const models = { users: 'User', categories: 'Category', brands: 'Brand', products: 'Product', carts: 'Cart', orders: 'Order', reviews: 'Review', activitylogs: 'ActivityLog' };
  for (const [c, m] of Object.entries(models)) {
    for (const d of D[c]) {
      const err = new mongoose.models[m](d).validateSync();
      assert.ok(!err, `${c} ${id(d._id)}: ${err?.message}`);
    }
  }
});

test('documented logins work against the real API, and blocked accounts are refused', async () => {
  const login = (email, password) => api('post', '/auth/login').send({ email, password });
  const admin = await login('admin@store.test', manifest.passwords.admin).expect(200);
  assert.equal(admin.body.user.role, 'admin');
  await login('customer1@store.test', manifest.passwords.customer).expect(200);
  await login('suspended@store.test', manifest.passwords.customer).expect(403);
  await login('banned@store.test', manifest.passwords.customer).expect(403);
  await login('locked@store.test', manifest.passwords.customer).expect(423);
  await login('customer1@store.test', 'wrong-Pass1').expect(401);
});

test('admin reports, system and logs endpoints work on the dataset', async () => {
  const token = (await api('post', '/auth/login').send({ email: 'admin@store.test', password: manifest.passwords.admin })).body.accessToken;
  const anchor = Date.parse(manifest.anchor);
  const from = new Date(anchor - 100 * 864e5).toISOString().slice(0, 10); const to = new Date(anchor + 864e5).toISOString().slice(0, 10);
  const sales = (await api('get', `/admin/reports/sales?from=${from}&to=${to}&interval=month`, token).expect(200)).body;
  const live = D.orders.filter((o) => o.status !== 'cancelled');
  assert.equal(sales.totals.orders, live.length);
  assert.equal(round2(sales.totals.revenue), round2(live.reduce((s, o) => s + o.total, 0)));
  assert.equal(sales.totals.cancelledOrders, D.orders.length - live.length);
  const inv = (await api('get', '/admin/reports/inventory?threshold=5', token).expect(200)).body;
  assert.ok(inv.rows.some((r) => r.status === 'out_of_stock' || r.stock === 0));
  await api('get', `/admin/reports/products?from=${from}&to=${to}`, token).expect(200);
  await api('get', `/admin/reports/customers?from=${from}&to=${to}`, token).expect(200);
  const logs = (await api('get', '/admin/logs?type=security&limit=100', token).expect(200)).body;
  assert.ok(logs.meta.total >= 25);
  assert.equal((await api('get', '/admin/logs?type=error', token).expect(200)).body.meta.total, 3);
  const sys = (await api('get', '/admin/system', token).expect(200)).body;
  assert.equal(sys.db.collections.Order, D.orders.length);
  // catalog + cache on the dataset
  const a = await api('get', '/products?limit=50').expect(200);
  const b = await api('get', '/products?limit=50').expect(200);
  assert.equal(a.headers['x-cache'], 'MISS'); assert.equal(b.headers['x-cache'], 'HIT');
  assert.equal(a.body.meta.total, D.products.filter((p) => p.isActive).length);
});
