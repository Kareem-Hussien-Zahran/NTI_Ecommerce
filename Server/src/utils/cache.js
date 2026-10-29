const config = require('../config/env');

/**
 * Small in-memory TTL cache with tag-based invalidation and a size cap (oldest-first eviction).
 * Per-process: with several API replicas each keeps its own copy (entries expire via TTL);
 * swap this module for Redis if you need a shared cache.
 */
class TTLCache {
  constructor({ ttlMs = 60000, maxEntries = 500, enabled = true } = {}) {
    this.ttlMs = ttlMs; this.maxEntries = maxEntries; this.enabled = enabled;
    this.map = new Map(); // key -> { value, expires, tags }
    this.hits = 0; this.misses = 0;
  }

  get(key) {
    if (!this.enabled) return undefined;
    const e = this.map.get(key);
    if (!e) { this.misses++; return undefined; }
    if (e.expires <= Date.now()) { this.map.delete(key); this.misses++; return undefined; }
    this.hits++;
    return e.value;
  }

  set(key, value, { ttlMs = this.ttlMs, tags = [] } = {}) {
    if (!this.enabled) return;
    if (this.map.has(key)) this.map.delete(key);
    while (this.map.size >= this.maxEntries) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, expires: Date.now() + ttlMs, tags });
  }

  /** Drop every entry that carries at least one of the given tags. */
  invalidate(...tags) {
    let n = 0;
    for (const [k, e] of this.map) if (e.tags.some((t) => tags.includes(t))) { this.map.delete(k); n++; }
    return n;
  }

  clear() { const n = this.map.size; this.map.clear(); return n; }

  stats() {
    const total = this.hits + this.misses;
    return { enabled: this.enabled, entries: this.map.size, maxEntries: this.maxEntries, ttlSeconds: this.ttlMs / 1000, hits: this.hits, misses: this.misses, hitRate: total ? +(this.hits / total).toFixed(3) : 0 };
  }
}

const cache = new TTLCache({ ttlMs: config.cache.ttlSeconds * 1000, maxEntries: config.cache.maxEntries, enabled: config.cache.enabled });

/**
 * Express middleware caching successful GET JSON responses.
 *   cacheResponse({ tags: ['products'], ttl: 30, browserMaxAge: 0 })
 * Requests from admins bypass the cache so they always see fresh data; a `X-Cache: HIT|MISS|BYPASS` header is set.
 */
function cacheResponse({ tags = [], ttl, browserMaxAge = 0, bypassAdmin = true, cacheInstance = cache } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET' || !cacheInstance.enabled || (bypassAdmin && req.user?.role === 'admin')) {
      res.set('X-Cache', 'BYPASS'); return next();
    }
    const key = req.originalUrl;
    const hit = cacheInstance.get(key);
    res.set('Cache-Control', `public, max-age=${browserMaxAge}, must-revalidate`);
    if (hit) { res.set('X-Cache', 'HIT'); return res.status(200).json(hit); }
    res.set('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) cacheInstance.set(key, body, { ttlMs: ttl ? ttl * 1000 : undefined, tags });
      return json(body);
    };
    next();
  };
}

module.exports = { TTLCache, cache, cacheResponse };
