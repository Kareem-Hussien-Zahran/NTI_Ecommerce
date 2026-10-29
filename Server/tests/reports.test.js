const { connect, disconnect, apiFor, makeUser } = require('./helpers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let ctx, api, adminToken, customerToken;
const at = (s) => new Date(`${s}T10:00:00Z`);

before(async () => {
  ctx = await connect('reports'); api = apiFor(ctx.app);
  const { Category, Brand, Product, Order, User } = mongoose.models;
  adminToken = (await makeUser(ctx.app, { email: 'admin@test.com', role: 'admin' })).token;
  customerToken = (await makeUser(ctx.app, { email: 'cust@test.com' })).token;

  const [tops, pants] = await Category.create([{ name: 'Tops' }, { name: 'Pants' }]);
  const brand = await Brand.create({ name: 'Acme' });
  const base = { description: 'd', gender: 'unisex', brand: brand._id };
  const [p1, p2] = await Product.create([
    { ...base, name: 'Tee', price: 20, category: tops._id, variants: [{ sku: 'T-S', size: 'S', stock: 0 }, { sku: 'T-M', size: 'M', stock: 3 }, { sku: 'T-L', size: 'L', stock: 10 }] },
    { ...base, name: 'Jeans', price: 50, category: pants._id, variants: [{ sku: 'J-M', size: 'M', stock: 8 }] },
  ]);
  const [a, b] = await User.create([
    { firstName: 'Ann', lastName: 'Alpha', email: 'ann@t.com', password: 'Passw0rd!', createdAt: at('2026-01-02') },
    { firstName: 'Bob', lastName: 'Beta', email: 'bob@t.com', password: 'Passw0rd!', createdAt: at('2026-01-03') },
  ]);
  const item = (p, price, quantity) => ({ product: p._id, sku: 'x', name: p.name, price, quantity });
  const addr = { fullName: 'x' };
  await Order.create([
    { orderNumber: 'O1', user: a._id, createdAt: at('2026-01-05'), status: 'paid', paymentMethod: 'cod', items: [item(p1, 20, 2), item(p2, 50, 1)], subtotal: 90, shippingFee: 0, tax: 9, total: 99, shippingAddress: addr },
    { orderNumber: 'O2', user: a._id, createdAt: at('2026-01-06'), status: 'cancelled', paymentMethod: 'cod', items: [item(p1, 20, 1)], subtotal: 20, shippingFee: 5, tax: 2, total: 30, shippingAddress: addr },
    { orderNumber: 'O3', user: b._id, createdAt: at('2026-01-12'), status: 'delivered', paymentMethod: 'card', items: [item(p1, 20, 1)], subtotal: 20, shippingFee: 5, tax: 2, total: 27, shippingAddress: addr },
    { orderNumber: 'O4', user: b._id, createdAt: at('2026-01-20'), status: 'pending', paymentMethod: 'card', items: [item(p2, 50, 2)], subtotal: 100, shippingFee: 0, tax: 10, total: 110, shippingAddress: addr },
    { orderNumber: 'O5', user: b._id, createdAt: at('2026-02-02'), status: 'paid', paymentMethod: 'card', items: [item(p2, 50, 1)], subtotal: 50, shippingFee: 5, tax: 5, total: 60, shippingAddress: addr },
  ]);
});
after(() => disconnect(ctx));

const Q = 'from=2026-01-01&to=2026-01-31';

test('reports require an admin', async () => {
  await api('get', `/admin/reports/sales?${Q}`).expect(401);
  await api('get', `/admin/reports/sales?${Q}`, customerToken).expect(403);
});

test('sales report: totals exclude cancelled and out-of-range orders', async () => {
  const r = (await api('get', `/admin/reports/sales?${Q}`, adminToken).expect(200)).body;
  assert.deepEqual(r.totals, { orders: 3, revenue: 236, items: 6, tax: 21, shipping: 5, cancelledOrders: 1, cancelledValue: 30, averageOrderValue: 78.67 });
  assert.deepEqual(r.byStatus, { paid: 1, cancelled: 1, delivered: 1, pending: 1 });
  assert.deepEqual(r.byPayment, { cod: 99, card: 137 });
  assert.equal(r.series.length, 31);
  assert.equal(r.series.find((x) => x.period === '2026-01-05').revenue, 99);
  assert.equal(r.series.reduce((s, x) => s + x.revenue, 0), 236);
});

test('sales report supports weekly and monthly buckets', async () => {
  const w = (await api('get', `/admin/reports/sales?${Q}&interval=week`, adminToken)).body.series;
  assert.deepEqual(w.map((x) => [x.period, x.revenue]), [['2025-12-29', 0], ['2026-01-05', 99], ['2026-01-12', 27], ['2026-01-19', 110], ['2026-01-26', 0]]);
  const m = (await api('get', `/admin/reports/sales?from=2026-01-01&to=2026-02-28&interval=month`, adminToken)).body.series;
  assert.deepEqual(m.map((x) => [x.period, x.revenue]), [['2026-01', 236], ['2026-02', 60]]);
});

test('date range is inclusive of the last day', async () => {
  const r = (await api('get', '/admin/reports/sales?from=2026-01-20&to=2026-01-20', adminToken)).body;
  assert.equal(r.totals.revenue, 110);
});

test('invalid ranges and parameters are rejected', async () => {
  await api('get', '/admin/reports/sales?from=2026-02-01&to=2026-01-01', adminToken).expect(400);
  await api('get', '/admin/reports/sales?from=yesterday', adminToken).expect(400);
  await api('get', '/admin/reports/sales?from=2020-01-01&to=2026-01-01', adminToken).expect(400);
  await api('get', '/admin/reports/sales?interval=hour', adminToken).expect(400);
  await api('get', '/admin/reports/bogus', adminToken).expect(400);
});

test('product report ranks by revenue', async () => {
  const r = (await api('get', `/admin/reports/products?${Q}`, adminToken)).body;
  assert.deepEqual(r.map((x) => [x.name, x.units, x.revenue, x.orders]), [['Jeans', 3, 150, 2], ['Tee', 3, 60, 2]]);
  assert.equal((await api('get', `/admin/reports/products?${Q}&limit=1`, adminToken)).body.length, 1);
});

test('category report shows revenue share', async () => {
  const r = (await api('get', `/admin/reports/categories?${Q}`, adminToken)).body;
  assert.deepEqual(r.map((x) => [x.category, x.revenue, x.share]), [['Pants', 150, 0.7143], ['Tops', 60, 0.2857]]);
});

test('customer report: top spenders and acquisition', async () => {
  const r = (await api('get', `/admin/reports/customers?${Q}`, adminToken)).body;
  assert.equal(r.newCustomers, 2); assert.equal(r.activeBuyers, 2); assert.equal(r.totalCustomers, 3);
  assert.deepEqual(r.top.map((x) => [x.name, x.orders, x.spent, x.averageOrder]), [['Bob Beta', 2, 137, 68.5], ['Ann Alpha', 1, 99, 99]]);
});

test('inventory report flags out-of-stock and low stock', async () => {
  const r = (await api('get', '/admin/reports/inventory', adminToken)).body;
  assert.deepEqual(r.totals, { variants: 4, units: 21, stockValue: 3 * 20 + 10 * 20 + 8 * 50, out: 1, low: 1 });
  assert.deepEqual(r.rows.map((x) => [x.sku, x.status]), [['T-S', 'out'], ['T-M', 'low'], ['J-M', 'ok'], ['T-L', 'ok']]);
  assert.equal((await api('get', '/admin/reports/inventory?threshold=10', adminToken)).body.totals.low, 3);
});

test('CSV export: headers, content type, filename and rows', async () => {
  const r = await api('get', `/admin/reports/products?${Q}&format=csv`, adminToken).expect(200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.headers['content-disposition'], /attachment; filename="products-report-\d{4}-\d{2}-\d{2}\.csv"/);
  const lines = r.text.trim().split('\r\n');
  assert.equal(lines[0], 'name,units,revenue,orders,productId');
  assert.match(lines[1], /^Jeans,3,150,2,/);
  const sales = await api('get', `/admin/reports/sales?${Q}&format=csv`, adminToken);
  assert.equal(sales.text.trim().split('\r\n').length, 32); // header + 31 days
});

test('CSV export neutralises formula injection in product names', async () => {
  const { Product } = mongoose.models;
  await Product.updateOne({ name: 'Jeans' }, { $set: { name: '=1+1' } });
  const inv = await api('get', '/admin/reports/inventory?format=csv', adminToken);
  assert.ok(inv.text.includes("'=1+1"), 'formula prefix must be escaped');
  assert.ok(!/^=1\+1/m.test(inv.text));
});

test('dashboard stats agree with the reports', async () => {
  const s = (await api('get', '/admin/stats', adminToken).expect(200)).body;
  assert.equal(s.revenue, 296); // all-time, cancelled excluded: 99 + 27 + 110 + 60
  assert.equal(s.orders, 4); assert.equal(s.customers, 3); assert.equal(s.products, 2);
  assert.deepEqual(s.ordersByStatus, { paid: 2, cancelled: 1, delivered: 1, pending: 1 });
  assert.equal(s.daily.length, 30);
  assert.equal(s.topProducts[0].sold, 4);
  assert.deepEqual(s.lowStock.map((x) => x.sku), ['T-S', 'T-M']);
});
