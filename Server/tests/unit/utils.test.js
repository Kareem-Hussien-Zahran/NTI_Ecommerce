const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const slugify = require('../../src/utils/slugify');
const { pageParams, paginated, escapeRegex } = require('../../src/utils/pagination');
const { resolveLine, totals } = require('../../src/utils/pricing');
const tokens = require('../../src/utils/tokens');

test('slugify', () => {
  assert.equal(slugify('  Aster & Co. — Tee #1 '), 'aster-co-tee-1');
  assert.equal(slugify('Crème Brûlée'), 'creme-brulee');
});
test('pageParams clamps page and limit', () => {
  assert.deepEqual(pageParams({ page: '3', limit: '10' }), { page: 3, limit: 10, skip: 20 });
  assert.deepEqual(pageParams({ page: '-4', limit: '9999' }, 12, 100), { page: 1, limit: 100, skip: 0 });
  assert.deepEqual(pageParams({}), { page: 1, limit: 12, skip: 0 });
});
test('paginated builds meta', () => {
  assert.deepEqual(paginated([1], 25, { page: 2, limit: 10 }).meta, { total: 25, page: 2, limit: 10, pages: 3 });
  assert.equal(paginated([], 0, { page: 1, limit: 10 }).meta.pages, 1);
});
test('escapeRegex neutralises regex metacharacters (ReDoS / injection guard)', () => {
  assert.ok(new RegExp(escapeRegex('a.*(b)+')).test('a.*(b)+'));
  assert.ok(!new RegExp(escapeRegex('a.*')).test('abc'));
});
const product = { _id: 'p', slug: 's', name: 'Tee', price: 20, isActive: true, images: ['i.png'], variants: [{ sku: 'M', size: 'M', stock: 3, isAvailable: true }, { sku: 'L', size: 'L', stock: 1, price: 25, isAvailable: true }, { sku: 'X', stock: 0, isAvailable: false }] };
test('resolveLine uses variant price override and base price', () => {
  assert.equal(resolveLine(product, 'M', 2).lineTotal, 40);
  assert.equal(resolveLine(product, 'L', 2).lineTotal, 50);
});
test('resolveLine returns null for unavailable variants / inactive or missing products', () => {
  assert.equal(resolveLine(product, 'X', 1), null);
  assert.equal(resolveLine(product, 'nope', 1), null);
  assert.equal(resolveLine({ ...product, isActive: false }, 'M', 1), null);
  assert.equal(resolveLine(null, 'M', 1), null);
});
test('totals: free shipping over the threshold, flat fee below, tax on subtotal', () => {
  assert.deepEqual(totals([{ lineTotal: 40 }]), { subtotal: 40, shippingFee: 5, tax: 4, total: 49 });
  assert.deepEqual(totals([{ lineTotal: 100 }]), { subtotal: 100, shippingFee: 0, tax: 10, total: 110 });
  assert.deepEqual(totals([]), { subtotal: 0, shippingFee: 0, tax: 0, total: 0 });
});
test('JWT access/refresh tokens verify with their own secrets only', () => {
  const user = { _id: 'abc', role: 'admin' };
  const a = tokens.signAccess(user), r = tokens.signRefresh(user);
  assert.equal(tokens.verifyAccess(a).role, 'admin');
  assert.throws(() => tokens.verifyAccess(r));
  assert.throws(() => tokens.verifyRefresh(a));
  assert.notEqual(tokens.signRefresh(user), r); // unique jti per token
  assert.equal(tokens.hash('x'), tokens.hash('x'));
});
