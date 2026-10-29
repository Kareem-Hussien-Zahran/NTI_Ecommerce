const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { TTLCache } = require('../../src/utils/cache');

test('stores and returns values, counting hits and misses', () => {
  const c = new TTLCache();
  assert.equal(c.get('a'), undefined);
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
  assert.deepEqual([c.hits, c.misses], [1, 1]);
  assert.equal(c.stats().hitRate, 0.5);
});

test('entries expire after their TTL', () => {
  mock.timers.enable({ apis: ['Date'], now: 1000 });
  const c = new TTLCache({ ttlMs: 100 });
  c.set('a', 1);
  mock.timers.tick(99); assert.equal(c.get('a'), 1);
  mock.timers.tick(2); assert.equal(c.get('a'), undefined);
  mock.timers.reset();
});

test('per-entry TTL overrides the default', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const c = new TTLCache({ ttlMs: 1000 });
  c.set('short', 1, { ttlMs: 10 }); c.set('long', 2);
  mock.timers.tick(50);
  assert.equal(c.get('short'), undefined); assert.equal(c.get('long'), 2);
  mock.timers.reset();
});

test('invalidate removes only entries with a matching tag', () => {
  const c = new TTLCache();
  c.set('p1', 1, { tags: ['products'] }); c.set('p2', 2, { tags: ['products', 'reports'] }); c.set('cat', 3, { tags: ['catalog'] });
  assert.equal(c.invalidate('products'), 2);
  assert.equal(c.get('cat'), 3); assert.equal(c.get('p1'), undefined);
});

test('evicts the oldest entry when full', () => {
  const c = new TTLCache({ maxEntries: 2 });
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  assert.equal(c.get('a'), undefined); assert.equal(c.get('b'), 2); assert.equal(c.get('c'), 3);
});

test('a disabled cache never stores anything', () => {
  const c = new TTLCache({ enabled: false });
  c.set('a', 1);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.stats().entries, 0);
});

test('clear empties the cache and reports how many entries were dropped', () => {
  const c = new TTLCache(); c.set('a', 1); c.set('b', 2);
  assert.equal(c.clear(), 2); assert.equal(c.stats().entries, 0);
});
