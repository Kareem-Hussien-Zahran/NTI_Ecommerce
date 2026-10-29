const Order = require('../models/order.model');
const Product = require('../models/product.model');
const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const { round2 } = require('../utils/pricing');

const DAY = 864e5;
const MAX_RANGE_DAYS = 366;

// ---------- pure helpers (unit-tested) ----------
/** Parse ?from&to into an inclusive UTC range. Default: last 30 days. */
function parseRange({ from, to } = {}, now = new Date()) {
  const end = to
    ? new Date(`${to}T23:59:59.999Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const start = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 29));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw ApiError.badRequest('Invalid date range');
  if (start > end) throw ApiError.badRequest('"from" must be before "to"');
  if ((end - start) / DAY > MAX_RANGE_DAYS) throw ApiError.badRequest(`Range too large (max ${MAX_RANGE_DAYS} days)`);
  return { from: start, to: end };
}

const iso = (d) => d.toISOString().slice(0, 10);

/** Bucket key for a date: day → YYYY-MM-DD, week → Monday of that week, month → YYYY-MM. */
function bucketKey(date, interval) {
  const d = new Date(date);
  if (interval === 'month') return d.toISOString().slice(0, 7);
  if (interval === 'week') {
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)));
  }
  return iso(d);
}

/** All bucket keys between two dates (so charts have no gaps). */
function bucketKeys(from, to, interval) {
  const keys = []; const seen = new Set();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const k = bucketKey(new Date(t), interval);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  const last = bucketKey(to, interval);
  if (!seen.has(last)) keys.push(last);
  return keys;
}

/** Fold an iterable of order-like rows into the sales report. Cancelled orders are counted separately and excluded from revenue. */
function summariseSales(orders, { from, to, interval = 'day' }) {
  const series = new Map(bucketKeys(from, to, interval).map((k) => [k, { period: k, orders: 0, items: 0, revenue: 0 }]));
  const t = { orders: 0, revenue: 0, items: 0, tax: 0, shipping: 0, cancelledOrders: 0, cancelledValue: 0 };
  const byStatus = {}; const byPayment = {};
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.status === 'cancelled') { t.cancelledOrders++; t.cancelledValue += o.total || 0; continue; }
    const items = (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
    t.orders++; t.revenue += o.total || 0; t.items += items; t.tax += o.tax || 0; t.shipping += o.shippingFee || 0;
    byPayment[o.paymentMethod] = (byPayment[o.paymentMethod] || 0) + (o.total || 0);
    const b = series.get(bucketKey(o.createdAt, interval));
    if (b) { b.orders++; b.items += items; b.revenue += o.total || 0; }
  }
  for (const k of Object.keys(byPayment)) byPayment[k] = round2(byPayment[k]);
  return {
    range: { from: iso(from), to: iso(to), interval },
    totals: { ...t, revenue: round2(t.revenue), tax: round2(t.tax), shipping: round2(t.shipping), cancelledValue: round2(t.cancelledValue), averageOrderValue: t.orders ? round2(t.revenue / t.orders) : 0 },
    series: [...series.values()].map((b) => ({ ...b, revenue: round2(b.revenue) })),
    byStatus, byPayment,
  };
}

/** Units + revenue per product (cancelled orders excluded). */
function summariseProducts(orders, limit = 20) {
  const m = new Map();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    for (const i of o.items || []) {
      const key = String(i.product);
      const r = m.get(key) || { productId: key, name: i.name, units: 0, revenue: 0, orders: 0 };
      r.units += i.quantity; r.revenue += i.price * i.quantity; r.orders++;
      m.set(key, r);
    }
  }
  return [...m.values()].map((r) => ({ ...r, revenue: round2(r.revenue) })).sort((a, b) => b.revenue - a.revenue || b.units - a.units).slice(0, limit);
}

/** Revenue per category, given a Map(productId → categoryName). */
function summariseCategories(orders, categoryOf) {
  const m = new Map();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    for (const i of o.items || []) {
      const c = categoryOf.get(String(i.product)) || 'Unknown / deleted';
      const r = m.get(c) || { category: c, units: 0, revenue: 0 };
      r.units += i.quantity; r.revenue += i.price * i.quantity; m.set(c, r);
    }
  }
  const rows = [...m.values()].map((r) => ({ ...r, revenue: round2(r.revenue) })).sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  return rows.map((r) => ({ ...r, share: total ? +(r.revenue / total).toFixed(4) : 0 }));
}

/** Top customers by spend (cancelled excluded). `users` is a Map(userId → {name,email}). */
function summariseCustomers(orders, users, limit = 20) {
  const m = new Map();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const id = String(o.user);
    const r = m.get(id) || { userId: id, orders: 0, spent: 0, lastOrder: null };
    r.orders++; r.spent += o.total || 0;
    if (!r.lastOrder || o.createdAt > r.lastOrder) r.lastOrder = o.createdAt;
    m.set(id, r);
  }
  return [...m.values()].map((r) => {
    const u = users.get(r.userId);
    return { ...r, name: u?.name || 'Deleted user', email: u?.email || '', spent: round2(r.spent), averageOrder: round2(r.spent / r.orders), lastOrder: r.lastOrder };
  }).sort((a, b) => b.spent - a.spent).slice(0, limit);
}

/** One row per variant, with stock status and stock value. */
function summariseInventory(products, lowThreshold = 5) {
  const rows = [];
  for (const p of products) {
    for (const v of p.variants) {
      const unit = v.price ?? p.price;
      rows.push({
        product: p.name, sku: v.sku, color: v.color?.name || '', size: v.size || '', stock: v.stock, price: unit,
        stockValue: round2(unit * v.stock), status: v.stock === 0 ? 'out' : v.stock <= lowThreshold ? 'low' : 'ok', active: p.isActive && v.isAvailable,
      });
    }
  }
  rows.sort((a, b) => a.stock - b.stock || a.product.localeCompare(b.product));
  return {
    threshold: lowThreshold,
    totals: {
      variants: rows.length, units: rows.reduce((s, r) => s + r.stock, 0), stockValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)),
      out: rows.filter((r) => r.status === 'out').length, low: rows.filter((r) => r.status === 'low').length,
    },
    rows,
  };
}

// ---------- data access ----------
async function loadOrders({ from, to }) {
  // lean + projection + cursor keeps memory flat even for large ranges
  const cursor = Order.find({ createdAt: { $gte: from, $lte: to } })
    .select('createdAt status total tax shippingFee paymentMethod user items.product items.name items.price items.quantity').lean().cursor();
  const rows = [];
  for await (const o of cursor) rows.push(o);
  return rows;
}

async function sales(query) {
  const range = parseRange(query);
  return summariseSales(await loadOrders(range), { ...range, interval: query.interval || 'day' });
}
async function products(query) { return summariseProducts(await loadOrders(parseRange(query)), query.limit || 20); }
async function categories(query) {
  const orders = await loadOrders(parseRange(query));
  const ids = [...new Set(orders.flatMap((o) => o.items.map((i) => String(i.product))))];
  const prods = await Product.find({ _id: { $in: ids } }).select('category').populate('category', 'name').lean();
  return summariseCategories(orders, new Map(prods.map((p) => [String(p._id), p.category?.name])));
}
async function customers(query) {
  const range = parseRange(query);
  const orders = await loadOrders(range);
  const ids = [...new Set(orders.map((o) => String(o.user)))];
  const us = await User.find({ _id: { $in: ids } }).select('firstName lastName email').lean();
  const [newCustomers, totalCustomers] = await Promise.all([
    User.countDocuments({ role: 'customer', createdAt: { $gte: range.from, $lte: range.to } }), User.countDocuments({ role: 'customer' }),
  ]);
  const top = summariseCustomers(orders, new Map(us.map((u) => [String(u._id), { name: `${u.firstName} ${u.lastName}`, email: u.email }])), query.limit || 20);
  const buyers = new Set(orders.filter((o) => o.status !== 'cancelled').map((o) => String(o.user)));
  return { newCustomers, totalCustomers, activeBuyers: buyers.size, top };
}
async function inventory(query) { return summariseInventory(await Product.find().select('name price isActive variants').lean(), query.threshold ?? 5); }

module.exports = {
  parseRange, bucketKey, bucketKeys, summariseSales, summariseProducts, summariseCategories, summariseCustomers, summariseInventory,
  loadOrders, sales, products, categories, customers, inventory,
};
