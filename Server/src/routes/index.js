const { Router } = require('express');
const { z } = require('zod');
const S = require('../validators/schemas');
const { validate: v } = require('../middleware/validate.middleware');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { uploads } = require('../middleware/upload.middleware');
const { authLimiter } = require('../middleware/security.middleware');

const auth = require('../controllers/auth.controller');
const users = require('../controllers/user.controller');
const catalog = require('../controllers/catalog.controller');
const products = require('../controllers/product.controller');
const cart = require('../controllers/cart.controller');
const orders = require('../controllers/order.controller');
const reviews = require('../controllers/review.controller');
const wishlist = require('../controllers/wishlist.controller');
const admin = require('../controllers/admin.controller');
const upload = require('../controllers/upload.controller');
const reports = require('../controllers/report.controller');
const logs = require('../controllers/log.controller');
const { cacheResponse } = require('../utils/cache');
const { invalidateOnWrite } = require('../middleware/invalidate.middleware');

const r = Router();
const adminOnly = [authenticate, authorize('admin')];
const idOrSlug = z.object({ id: z.string().min(1).max(160) });

// ---- auth
r.post('/auth/register', authLimiter, invalidateOnWrite('reports'), v({ body: S.auth.register }), auth.register);
r.post('/auth/login', authLimiter, v({ body: S.auth.login }), auth.login);
r.post('/auth/refresh', authLimiter, v({ body: S.auth.refresh }), auth.refresh);
r.post('/auth/logout', authenticate, auth.logout);
r.get('/auth/me', authenticate, auth.me);
r.post('/auth/change-password', authenticate, v({ body: S.auth.changePassword }), auth.changePassword);

// ---- users
r.put('/users/me', authenticate, v({ body: S.user.updateMe }), users.updateMe);
r.delete('/users/me', authenticate, users.deleteMe);
r.get('/users', ...adminOnly, v({ query: S.user.list }), users.list);
r.get('/users/:id', ...adminOnly, v({ params: S.idParam }), users.get);
r.patch('/users/:id', ...adminOnly, invalidateOnWrite('reports'), v({ params: S.idParam, body: S.user.adminUpdate }), users.adminUpdate);
r.delete('/users/:id', ...adminOnly, invalidateOnWrite('reports'), v({ params: S.idParam }), users.adminDelete);

// ---- categories & brands
for (const [path, c, schema] of [['categories', catalog.categories, S.category], ['brands', catalog.brands, S.brand]]) {
  r.get(`/${path}`, cacheResponse({ tags: ['catalog'], browserMaxAge: 60 }), c.list);
  r.post(`/${path}`, ...adminOnly, invalidateOnWrite('catalog', 'products'), v({ body: schema.create }), c.create);
  r.put(`/${path}/:id`, ...adminOnly, invalidateOnWrite('catalog', 'products'), v({ params: S.idParam, body: schema.update }), c.update);
  r.delete(`/${path}/:id`, ...adminOnly, invalidateOnWrite('catalog', 'products'), v({ params: S.idParam }), c.remove);
}

// ---- products
const productCache = cacheResponse({ tags: ['products'], ttl: 60 });
r.get('/products', optionalAuth, v({ query: S.product.list }), productCache, products.list);
r.get('/products/:id', optionalAuth, v({ params: idOrSlug }), productCache, products.get);
r.get('/products/:id/related', v({ params: S.idParam }), productCache, products.related);
r.post('/products', ...adminOnly, invalidateOnWrite('products', 'reports'), v({ body: S.product.create }), products.create);
r.put('/products/:id', ...adminOnly, invalidateOnWrite('products', 'reports'), v({ params: S.idParam, body: S.product.update }), products.update);
r.delete('/products/:id', ...adminOnly, invalidateOnWrite('products', 'reports'), v({ params: S.idParam }), products.remove);
r.post('/uploads/images', ...adminOnly, uploads.array('images', 8), upload.images);

// ---- reviews
r.get('/products/:id/reviews', v({ params: S.idParam, query: S.review.list }), cacheResponse({ tags: ['products'], ttl: 60 }), reviews.list);
r.post('/products/:id/reviews', authenticate, invalidateOnWrite('products'), v({ params: S.idParam, body: S.review.create }), reviews.create);
r.delete('/reviews/:id', authenticate, invalidateOnWrite('products'), v({ params: S.idParam }), reviews.remove);

// ---- wishlist
r.get('/wishlist', authenticate, wishlist.list);
r.get('/wishlist/ids', authenticate, wishlist.ids);
r.post('/wishlist/:id', authenticate, v({ params: S.idParam }), wishlist.toggle);

// ---- cart
r.get('/cart', authenticate, cart.get);
r.post('/cart/items', authenticate, v({ body: S.cart.add }), cart.add);
r.patch('/cart/items/:productId/:sku', authenticate, v({ params: S.cart.itemParams, body: S.cart.update }), cart.update);
r.delete('/cart/items/:productId/:sku', authenticate, v({ params: S.cart.itemParams }), cart.removeItem);
r.delete('/cart', authenticate, cart.clear);

// ---- orders
r.post('/orders', authenticate, invalidateOnWrite('products', 'reports'), v({ body: S.order.create }), orders.create);
r.get('/orders/mine', authenticate, v({ query: S.order.list }), orders.mine);
r.get('/orders', ...adminOnly, v({ query: S.order.list }), orders.all);
r.get('/orders/:id', authenticate, v({ params: S.idParam }), orders.get);
r.post('/orders/:id/cancel', authenticate, invalidateOnWrite('products', 'reports'), v({ params: S.idParam }), orders.cancel);
r.patch('/orders/:id/status', ...adminOnly, invalidateOnWrite('products', 'reports'), v({ params: S.idParam, body: S.order.updateStatus }), orders.updateStatus);

// ---- admin
r.get('/admin/stats', ...adminOnly, cacheResponse({ tags: ['reports'], ttl: 60, bypassAdmin: false }), admin.stats);
r.get('/admin/reports/:type', ...adminOnly, v({ params: S.report.type, query: S.report.query }), cacheResponse({ tags: ['reports'], ttl: 60, bypassAdmin: false }), reports.report);
r.get('/admin/cache', ...adminOnly, reports.cacheStats);
r.delete('/admin/cache', ...adminOnly, reports.cacheClear);
r.get('/admin/logs', ...adminOnly, v({ query: S.logs.query }), logs.list);
r.get('/admin/system', ...adminOnly, logs.system);

module.exports = r;
