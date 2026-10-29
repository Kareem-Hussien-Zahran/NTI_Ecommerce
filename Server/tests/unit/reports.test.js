const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../src/services/reports');

const d = (s) => new Date(`${s}T12:00:00Z`);
const range = (from, to) => R.parseRange({ from, to });

test('parseRange defaults to the last 30 days ending today (inclusive)', () => {
  const r = R.parseRange({}, new Date('2026-03-31T10:00:00Z'));
  assert.equal(r.from.toISOString(), '2026-03-02T00:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-03-31T23:59:59.999Z');
});
test('parseRange is inclusive of the whole "to" day', () => {
  assert.equal(range('2026-01-01', '2026-01-31').to.toISOString(), '2026-01-31T23:59:59.999Z');
});
test('parseRange rejects reversed, invalid and oversized ranges', () => {
  assert.throws(() => range('2026-02-01', '2026-01-01'), /before/);
  assert.throws(() => range('2026-13-45', '2026-14-01'), /Invalid/);
  assert.throws(() => range('2024-01-01', '2026-01-01'), /too large/);
});
test('bucketKey groups by day, ISO week (Monday) and month', () => {
  assert.equal(R.bucketKey(d('2026-01-07'), 'day'), '2026-01-07');
  assert.equal(R.bucketKey(d('2026-01-07'), 'week'), '2026-01-05'); // Wed -> Mon
  assert.equal(R.bucketKey(d('2026-01-11'), 'week'), '2026-01-05'); // Sun -> same week
  assert.equal(R.bucketKey(d('2026-01-12'), 'week'), '2026-01-12');
  assert.equal(R.bucketKey(d('2026-01-31'), 'month'), '2026-01');
});
test('bucketKeys has no gaps and no duplicates', () => {
  const r = range('2026-01-01', '2026-01-31');
  assert.equal(R.bucketKeys(r.from, r.to, 'day').length, 31);
  assert.deepEqual(R.bucketKeys(r.from, r.to, 'week'), ['2025-12-29', '2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  assert.deepEqual(R.bucketKeys(r.from, r.to, 'month'), ['2026-01']);
});

const orders = [
  { createdAt: d('2026-01-05'), status: 'paid', total: 99, tax: 9, shippingFee: 0, paymentMethod: 'cod', user: 'a', items: [{ product: 'p1', name: 'Tee', price: 20, quantity: 2 }, { product: 'p2', name: 'Jeans', price: 50, quantity: 1 }] },
  { createdAt: d('2026-01-06'), status: 'cancelled', total: 30, tax: 0, shippingFee: 5, paymentMethod: 'card', user: 'a', items: [{ product: 'p1', name: 'Tee', price: 20, quantity: 1 }] },
  { createdAt: d('2026-01-12'), status: 'delivered', total: 27, tax: 2, shippingFee: 5, paymentMethod: 'card', user: 'b', items: [{ product: 'p1', name: 'Tee', price: 20, quantity: 1 }] },
];

test('summariseSales excludes cancelled orders from revenue but reports them', () => {
  const r = range('2026-01-01', '2026-01-31');
  const s = R.summariseSales(orders, { ...r, interval: 'day' });
  assert.equal(s.totals.orders, 2); assert.equal(s.totals.revenue, 126); assert.equal(s.totals.items, 4);
  assert.equal(s.totals.averageOrderValue, 63); assert.equal(s.totals.cancelledOrders, 1); assert.equal(s.totals.cancelledValue, 30);
  assert.deepEqual(s.byStatus, { paid: 1, cancelled: 1, delivered: 1 });
  assert.deepEqual(s.byPayment, { cod: 99, card: 27 });
  assert.equal(s.series.length, 31);
  assert.equal(s.series.find((b) => b.period === '2026-01-05').revenue, 99);
  assert.equal(s.series.find((b) => b.period === '2026-01-06').revenue, 0);
});
test('summariseSales with no orders yields zeros, not NaN', () => {
  const r = range('2026-01-01', '2026-01-03');
  const s = R.summariseSales([], { ...r });
  assert.equal(s.totals.averageOrderValue, 0); assert.equal(s.totals.revenue, 0); assert.equal(s.series.length, 3);
});
test('summariseProducts ranks by revenue and skips cancelled orders', () => {
  const p = R.summariseProducts(orders);
  assert.deepEqual(p.map((x) => [x.name, x.units, x.revenue]), [['Jeans', 1, 50], ['Tee', 3, 60]].sort((a, b) => b[2] - a[2]));
  assert.equal(R.summariseProducts(orders, 1).length, 1);
});
test('summariseCategories computes revenue shares that add up to 1', () => {
  const rows = R.summariseCategories(orders, new Map([['p1', 'Tops'], ['p2', 'Pants']]));
  assert.deepEqual(rows.map((r) => r.category), ['Tops', 'Pants']);
  assert.equal(rows.reduce((s, r) => s + r.share, 0).toFixed(2), '1.00');
  assert.equal(R.summariseCategories(orders, new Map())[0].category, 'Unknown / deleted');
});
test('summariseCustomers ranks by spend', () => {
  const rows = R.summariseCustomers(orders, new Map([['a', { name: 'Ann', email: 'a@x' }], ['b', { name: 'Bob', email: 'b@x' }]]));
  assert.deepEqual(rows.map((r) => [r.name, r.spent, r.orders]), [['Ann', 99, 1], ['Bob', 27, 1]]);
  assert.equal(rows[0].averageOrder, 99);
});
test('summariseInventory classifies out / low / ok and values stock', () => {
  const inv = R.summariseInventory([{ name: 'Tee', price: 10, isActive: true, variants: [{ sku: 'a', stock: 0 }, { sku: 'b', stock: 3, price: 12 }, { sku: 'c', stock: 20 }] }], 5);
  assert.deepEqual(inv.rows.map((r) => r.status), ['out', 'low', 'ok']);
  assert.deepEqual(inv.totals, { variants: 3, units: 23, stockValue: 236, out: 1, low: 1 });
});
