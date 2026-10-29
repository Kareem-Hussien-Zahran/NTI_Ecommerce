#!/usr/bin/env node
/**
 * Deterministic test-data generator.  node testdata/generate.js [--anchor=YYYY-MM-DD]
 * Writes MongoDB Extended JSON arrays (one file per collection) + placeholder images into testdata/.
 * Same anchor => byte-identical output. Dates are generated relative to the anchor (default: today) so the
 * dashboard / reports "last 30 days" always have data.  Import with `npm run testdata:import`.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const slugify = require('../src/utils/slugify');

const OUT = __dirname;
const anchorArg = process.argv.find((a) => a.startsWith('--anchor='));
const ANCHOR = anchorArg ? new Date(`${anchorArg.slice(9)}T12:00:00Z`) : new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00Z');
const DAY = 864e5;

// mirrors Server/src/config/env.js (asserted by tests/testdata.test.js)
const SHIPPING = { flatFee: 5, freeOver: 100 };
const TAX = 0.1;
const round2 = (n) => Math.round(n * 100) / 100;

const PASSWORDS = { admin: 'Admin@12345', customer: 'Test@12345' };

let seed = 20260101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];

let counters = {};
const oid = (kind) => {
  counters[kind] = (counters[kind] || 0) + 1;
  const k = { user: 'a1', category: 'c2', brand: 'b3', product: 'd4', order: 'e5', review: 'f6', cart: '17', log: '28' }[kind];
  return k + String(counters[kind]).padStart(22, '0');
};
const O = (id) => ({ $oid: id });
const D = (d) => ({ $date: new Date(d).toISOString() });
const ago = (days) => new Date(ANCHOR.getTime() - days * DAY);

// ---------------------------------------------------------------- images
fs.mkdirSync(path.join(OUT, 'uploads'), { recursive: true });
const LOOKS = [['#000000', '#830000'], ['#830000', '#bc0202'], ['#bc0202', '#ff0000']];
function image(slug, label, n) {
  const [a, b] = LOOKS[n % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="750" fill="url(#g)"/><text x="300" y="390" font-family="Helvetica,Arial,sans-serif" font-size="40" font-weight="700" fill="#fff" text-anchor="middle">${label.replace(/&/g, '&amp;')}</text></svg>`;
  fs.writeFileSync(path.join(OUT, 'uploads', `test-${slug}.svg`), svg);
  return `/uploads/test-${slug}.svg`;
}

// ---------------------------------------------------------------- users
const hash = (p) => bcrypt.hashSync(p, 10);
const adminHash = hash(PASSWORDS.admin);
const custHash = hash(PASSWORDS.customer);
const CITIES = [['Cairo', 'Cairo Governorate'], ['Alexandria', 'Alexandria Governorate'], ['Giza', 'Giza Governorate'], ['Mansoura', 'Dakahlia'], ['Tanta', 'Gharbia'], ['Aswan', 'Aswan']];
const FIRST = ['Amira', 'Omar', 'Layla', 'Youssef', 'Nour', 'Karim', 'Salma', 'Hassan', 'Mariam', 'Ali', 'Dina', 'Tarek', 'Hana', 'Mostafa', 'Rana'];
const LAST = ['Hassan', 'Ibrahim', 'Mahmoud', 'Farouk', 'Saleh', 'Nasser', 'Khalil', 'Fathy', 'Zaki', 'Samir'];

const users = [];
function addUser(o) {
  const id = oid('user');
  const created = o.createdAt || ago(int(40, 120));
  const city = pick(CITIES);
  const u = {
    _id: O(id), firstName: o.firstName, lastName: o.lastName, dateOfBirth: D(ago(365 * int(20, 45))), gender: o.gender ?? null,
    email: o.email, password: o.password || custHash, phone: `+2010${String(int(10000000, 99999999))}`,
    address: { fullName: `${o.firstName} ${o.lastName}`, phone: `+2010${String(int(10000000, 99999999))}`, street: `${int(1, 120)} ${pick(['Nile St', 'Tahrir St', 'Corniche Rd', 'Pyramids Rd', 'Salah Salem St'])}`, city: city[0], state: city[1], postalCode: String(int(10000, 99999)), country: 'Egypt' },
    isEmailVerified: o.isEmailVerified ?? true, role: o.role || 'customer', status: o.status || 'active', wishlist: [],
    failedLoginAttempts: o.failedLoginAttempts || 0, lockUntil: o.lockUntil ? D(o.lockUntil) : null, refreshTokens: [],
    createdAt: D(created), updatedAt: D(created), __v: 0,
  };
  users.push(u); return u;
}
addUser({ firstName: 'Store', lastName: 'Admin', email: 'admin@store.test', password: adminHash, role: 'admin', gender: 'male', createdAt: ago(150) });
addUser({ firstName: 'Ops', lastName: 'Admin', email: 'ops@store.test', password: adminHash, role: 'admin', gender: 'female', createdAt: ago(140) });
for (let i = 1; i <= 12; i++) addUser({ firstName: FIRST[i - 1], lastName: LAST[i % LAST.length], email: `customer${i}@store.test`, gender: i % 2 ? 'female' : 'male', createdAt: ago(130 - i * 8) });
addUser({ firstName: 'Suspended', lastName: 'User', email: 'suspended@store.test', status: 'suspended', createdAt: ago(60) });
addUser({ firstName: 'Banned', lastName: 'User', email: 'banned@store.test', status: 'banned', createdAt: ago(55) });
addUser({ firstName: 'Inactive', lastName: 'User', email: 'inactive@store.test', status: 'inactive', createdAt: ago(50) });
addUser({ firstName: 'Locked', lastName: 'Out', email: 'locked@store.test', lockUntil: new Date(ANCHOR.getTime() + 30 * 864e5), createdAt: ago(45) });
addUser({ firstName: 'Unverified', lastName: 'New', email: 'unverified@store.test', isEmailVerified: false, createdAt: ago(2) });
const customers = users.filter((u) => u.role === 'customer' && u.email.startsWith('customer'));

// ---------------------------------------------------------------- categories & brands
const cats = []; const catBy = {};
function addCat(name, parent, description) {
  const id = oid('category');
  const c = { _id: O(id), name, slug: slugify(name), description, parent: parent ? O(parent) : null, createdAt: D(ago(150)), updatedAt: D(ago(150)), __v: 0 };
  cats.push(c); catBy[name] = id; return id;
}
const tops = { Men: addCat('Men', null, 'Menswear'), Women: addCat('Women', null, 'Womenswear'), Kids: addCat('Kids', null, 'Kidswear'), Accessories: addCat('Accessories', null, 'Bags, belts & more') };
['T-Shirts', 'Jeans', 'Jackets', 'Hoodies'].forEach((n) => addCat(`Men ${n}`, tops.Men, `Men's ${n.toLowerCase()}`));
['Dresses', 'Tops', 'Skirts', 'Shoes'].forEach((n) => addCat(`Women ${n}`, tops.Women, `Women's ${n.toLowerCase()}`));
addCat('Kids Sets', tops.Kids, 'Matching sets');

const brands = []; const brandBy = {};
['Nile Threads', 'Crimson Co.', 'Urban Pharaoh', 'Delta Denim', 'Sahara Sole', 'Luxor Luxe'].forEach((name) => {
  const id = oid('brand');
  brands.push({ _id: O(id), name, slug: slugify(name), createdAt: D(ago(150)), updatedAt: D(ago(150)), __v: 0 }); brandBy[name] = id;
});

// ---------------------------------------------------------------- products
const COLORS = [['Black', '#000000'], ['Crimson', '#bc0202'], ['White', '#ffffff'], ['Navy', '#14213d'], ['Grey', '#9ca3af']];
const CLOTHES = ['S', 'M', 'L', 'XL'];
// [name, type, gender, category, brand, price, compareAt, season, tags, sizes]
const SPEC = [
  ['Classic Crew T-Shirt', 't-shirt', 'men', 'Men T-Shirts', 'Nile Threads', 19.99, 24.99, 'summer', ['basic', 'cotton']],
  ['Graphic Print Tee', 't-shirt', 'men', 'Men T-Shirts', 'Urban Pharaoh', 24.5, null, 'summer', ['graphic', 'cotton']],
  ['Oversized Pocket Tee', 't-shirt', 'unisex', 'Men T-Shirts', 'Crimson Co.', 22, null, 'all-season', ['oversized']],
  ['Slim Fit Jeans', 'jeans', 'men', 'Men Jeans', 'Delta Denim', 59.9, 79.9, 'all-season', ['denim', 'slim']],
  ['Straight Leg Jeans', 'jeans', 'men', 'Men Jeans', 'Delta Denim', 64, null, 'all-season', ['denim']],
  ['Distressed Skinny Jeans', 'jeans', 'women', 'Women Tops', 'Delta Denim', 69, 89, 'autumn', ['denim', 'distressed']],
  ['Bomber Jacket', 'jacket', 'men', 'Men Jackets', 'Urban Pharaoh', 119, 149, 'autumn', ['outerwear']],
  ['Leather Biker Jacket', 'jacket', 'men', 'Men Jackets', 'Luxor Luxe', 249, null, 'winter', ['leather', 'premium']],
  ['Windbreaker', 'jacket', 'unisex', 'Men Jackets', 'Crimson Co.', 79, null, 'spring', ['light']],
  ['Zip Hoodie', 'hoodie', 'men', 'Men Hoodies', 'Nile Threads', 54, null, 'winter', ['fleece']],
  ['Pullover Hoodie', 'hoodie', 'unisex', 'Men Hoodies', 'Crimson Co.', 49, 59, 'winter', ['fleece', 'cozy']],
  ['Cropped Hoodie', 'hoodie', 'women', 'Women Tops', 'Urban Pharaoh', 45, null, 'winter', ['cropped']],
  ['Floral Summer Dress', 'dress', 'women', 'Women Dresses', 'Luxor Luxe', 89, 109, 'summer', ['floral', 'summer']],
  ['Evening Satin Dress', 'dress', 'women', 'Women Dresses', 'Luxor Luxe', 159, null, 'all-season', ['satin', 'evening']],
  ['Wrap Midi Dress', 'dress', 'women', 'Women Dresses', 'Nile Threads', 74.5, null, 'spring', ['midi']],
  ['Pleated Skirt', 'skirt', 'women', 'Women Skirts', 'Crimson Co.', 39, null, 'spring', ['pleated']],
  ['Denim Mini Skirt', 'skirt', 'women', 'Women Skirts', 'Delta Denim', 42, null, 'summer', ['denim']],
  ['Silk Blouse', 'shirt', 'women', 'Women Tops', 'Luxor Luxe', 68, null, 'spring', ['silk']],
  ['Linen Shirt', 'shirt', 'men', 'Men T-Shirts', 'Nile Threads', 46, null, 'summer', ['linen']],
  ['Knit Sweater', 'sweater', 'women', 'Women Tops', 'Nile Threads', 58, 72, 'winter', ['wool']],
  ['Chino Shorts', 'shorts', 'men', 'Men Jeans', 'Urban Pharaoh', 34, null, 'summer', ['shorts']],
  ['Running Sneakers', 'shoes', 'unisex', 'Women Shoes', 'Sahara Sole', 94, 120, 'all-season', ['running', 'sport']],
  ['Leather Ankle Boots', 'shoes', 'women', 'Women Shoes', 'Sahara Sole', 135, null, 'winter', ['leather', 'boots']],
  ['Canvas Low Tops', 'shoes', 'unisex', 'Women Shoes', 'Sahara Sole', 49, null, 'all-season', ['canvas']],
  ['Leather Belt', 'accessory', 'men', 'Accessories', 'Luxor Luxe', 29, null, 'all-season', ['belt', 'leather']],
  ['Wool Scarf', 'accessory', 'unisex', 'Accessories', 'Nile Threads', 27, null, 'winter', ['scarf']],
  ['Crossbody Bag', 'accessory', 'women', 'Accessories', 'Luxor Luxe', 85, 99, 'all-season', ['bag']],
  ['Kids Dino Set', 'other', 'kids', 'Kids Sets', 'Crimson Co.', 32, null, 'summer', ['kids', 'set']],
  ['Kids Denim Jacket', 'jacket', 'kids', 'Kids Sets', 'Delta Denim', 44, null, 'autumn', ['kids', 'denim']],
  ['Discontinued Retro Tee', 't-shirt', 'men', 'Men T-Shirts', 'Urban Pharaoh', 15, null, 'summer', ['retro']],
];
const products = [];
SPEC.forEach(([name, type, gender, cat, brand, price, compareAt, season, tags], idx) => {
  const slug = slugify(name);
  const shoe = type === 'shoes'; const acc = type === 'accessory';
  const sizes = shoe ? ['XS', 'S', 'M', 'L'] : acc ? ['M'] : CLOTHES; // shoe sizes are mapped onto the size enum
  const colors = Array.from({ length: acc ? 1 : int(2, 3) }, (_, i) => COLORS[(idx + i) % COLORS.length]);
  const imgs = colors.map((c, i) => image(`${slug}-${c[0].toLowerCase()}`, name, idx + i));
  const variants = [];
  colors.forEach((c, ci) => sizes.forEach((s) => {
    let stock = int(8, 40);
    if (idx === 5 && s === 'M') stock = 0;                 // sold-out variant
    if (idx % 7 === 3 && s === 'S') stock = int(1, 4);     // low stock
    variants.push({ _id: O(oid('product').replace(/^d4/, 'd9')), sku: `${slug.toUpperCase().replace(/-/g, '').slice(0, 8)}-${c[0].slice(0, 3).toUpperCase()}-${s}`, color: { name: c[0], code: c[1] }, size: s, stock, images: [imgs[ci]], isAvailable: true });
  }));
  counters.product -= variants.length; // variant ids borrowed the product counter; rewind it
  const created = ago(int(90, 140));
  products.push({
    _id: O(oid('product')), name, slug, description: `${name} — test catalog item for the ${cat} collection. Soft, durable and true to size.`, price, ...(compareAt ? { compareAtPrice: compareAt } : {}),
    gender, productType: type, brand: O(brandBy[brand]), category: O(catBy[cat]), subcategory: null, tags, season, images: imgs, variants,
    featured: idx % 6 === 0, isActive: name !== 'Discontinued Retro Tee', ratingAverage: 0, ratingCount: 0, createdAt: D(created), updatedAt: D(created), __v: 0,
  });
});
const productById = Object.fromEntries(products.map((p) => [p._id.$oid, p]));
const activeProducts = products.filter((p) => p.isActive);

// ---------------------------------------------------------------- orders
const orders = [];
const nameOf = (u) => `${u.firstName} ${u.lastName}`;
const N_ORDERS = 120;
for (let n = 1; n <= N_ORDERS; n++) {
  const ageDays = (n / N_ORDERS) * 60 + rnd() * 0.5;       // spread across 60 days, oldest first
  const created = new Date(ANCHOR.getTime() - ageDays * DAY - int(0, 40000) * 1000);
  const user = pick(customers);
  const items = [];
  for (let k = 0, c = int(1, 3); k < c; k++) {
    const p = pick(rnd() < 0.5 ? activeProducts.filter((x) => x.price < 50) : activeProducts); const v = pick(p.variants);
    if (items.some((i) => i.sku === v.sku)) continue;
    items.push({ product: p._id, sku: v.sku, name: p.name, image: v.images[0], color: v.color.name, size: v.size, price: p.price, quantity: int(1, 2), _id: O(oid('order').replace(/^e5/, 'e8')) });
    counters.order--; // keep order ids contiguous
  }
  const subtotal = round2(items.reduce((s, i) => s + round2(i.price * i.quantity), 0));
  const shippingFee = subtotal >= SHIPPING.freeOver ? 0 : SHIPPING.flatFee;
  const tax = round2(subtotal * TAX);
  const total = round2(subtotal + shippingFee + tax);
  const r = rnd();
  let status;
  if (ageDays > 14) status = r < 0.62 ? 'delivered' : r < 0.78 ? 'cancelled' : r < 0.84 ? 'shipped' : 'delivered';
  else if (ageDays > 5) status = r < 0.35 ? 'delivered' : r < 0.55 ? 'shipped' : r < 0.70 ? 'processing' : r < 0.85 ? 'paid' : r < 0.93 ? 'pending' : 'cancelled';
  else status = pick(['pending', 'pending', 'paid', 'paid', 'processing', 'shipped', 'cancelled']);
  const card = rnd() < 0.6 && status !== 'pending'; // card payments are captured immediately, so only COD orders can be pending
  const paymentMethod = card ? 'card' : 'cod';
  const flow = ['pending', 'paid', 'processing', 'shipped', 'delivered'];
  const hist = [];
  const start = card ? 'paid' : 'pending';
  if (status === 'cancelled') hist.push(start, 'cancelled');
  else { for (const s of flow.slice(flow.indexOf(start))) { hist.push(s); if (s === status) break; } }
  const statusHistory = hist.map((s, i) => ({ status: s, at: D(new Date(created.getTime() + i * 6 * 3600e3)), _id: O(oid('order').replace(/^e5/, 'ea')) }));
  counters.order -= statusHistory.length;
  const paid = status === 'delivered' || (card && status !== 'cancelled') || ['paid', 'processing', 'shipped'].includes(status);
  const paidAt = paid ? new Date(created.getTime() + (card ? 0 : 6 * 3600e3 * Math.max(1, hist.indexOf('delivered')))) : undefined;
  orders.push({
    _id: O(oid('order')), orderNumber: `ORD-TEST-${String(n).padStart(4, '0')}`, user: O(user._id.$oid), items,
    shippingAddress: user.address, paymentMethod, isPaid: paid && status !== 'cancelled', ...(paid && status !== 'cancelled' ? { paidAt: D(paidAt) } : {}),
    subtotal, shippingFee, tax, total, status, statusHistory, createdAt: D(created), updatedAt: D(new Date(created.getTime() + (hist.length - 1) * 6 * 3600e3)), __v: 0,
  });
}
// an order that explicitly exercises free-shipping, and one with a single cheap item (paid shipping) are included by the random mix; assert later in tests.

// ---------------------------------------------------------------- reviews (only from delivered orders)
const reviews = []; const seen = new Set();
const COMMENTS = ['Great quality, fits perfectly.', 'Good value for the price.', 'Colour is slightly different than the photo.', 'Fast delivery and nice fabric.', 'Runs a bit small, order one size up.', 'Absolutely love it!', 'Decent, but not amazing.', 'Would buy again.'];
for (const o of orders.filter((x) => x.status === 'delivered')) {
  if (reviews.length >= 40) break;
  if (rnd() > 0.55) continue;
  const it = o.items[0]; const key = `${o.user.$oid}:${it.product.$oid}`;
  if (seen.has(key)) continue; seen.add(key);
  const rating = pick([5, 5, 5, 4, 4, 4, 3, 2, 1]);
  const when = new Date(Date.parse(o.updatedAt.$date) + int(1, 5) * DAY);
  reviews.push({ _id: O(oid('review')), product: it.product, user: o.user, rating, comment: COMMENTS[rating === 5 ? int(0, 5) % 8 : (rating + int(0, 3)) % 8], createdAt: D(when), updatedAt: D(when), __v: 0 });
}
const agg = {};
for (const r of reviews) (agg[r.product.$oid] ||= []).push(r.rating);
for (const [pid, rs] of Object.entries(agg)) { const p = productById[pid]; p.ratingAverage = Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10; p.ratingCount = rs.length; }

// ---------------------------------------------------------------- carts & wishlists
const carts = [];
customers.slice(0, 5).forEach((u, i) => {
  const items = [];
  for (let k = 0; k < 1 + (i % 3); k++) { const p = pick(activeProducts); const v = pick(p.variants.filter((x) => x.stock > 0)); if (!items.some((x) => x.sku === v.sku)) items.push({ product: p._id, sku: v.sku, quantity: int(1, 2), _id: O(oid('cart').replace(/^17/, '19')) }); }
  const t = ago(rnd() * 3);
  carts.push({ _id: O(oid('cart')), user: O(u._id.$oid), items, createdAt: D(t), updatedAt: D(t), __v: 0 });
});
customers.forEach((u) => { u.wishlist = Array.from({ length: int(0, 4) }, () => pick(activeProducts)._id).filter((v, i, a) => a.findIndex((x) => x.$oid === v.$oid) === i); });

// ---------------------------------------------------------------- activity logs
const logs = [];
const admin = users[0];
const UA = ['Mozilla/5.0 (Windows NT 10.0) Chrome/126', 'Mozilla/5.0 (iPhone; CPU iOS 17) Safari/604', 'Mozilla/5.0 (Macintosh) Firefox/128'];
const ipOf = () => `197.${int(32, 60)}.${int(0, 255)}.${int(1, 254)}`;
const actor = (u) => ({ id: u._id.$oid, email: u.email, role: u.role });
let reqN = 0;
function log(type, action, when, o = {}) {
  logs.push({ _id: O(oid('log')), type, action, ...(o.message ? { message: o.message } : {}), ...(o.actor ? { actor: actor(o.actor) } : {}), ...(o.target ? { target: o.target } : {}), ...(o.meta ? { meta: o.meta } : {}), ...(o.status ? { status: o.status } : {}), ip: o.ip || ipOf(), userAgent: pick(UA), requestId: `req-test-${String(++reqN).padStart(5, '0')}`, createdAt: D(when) });
}
users.filter((u) => u.status === 'active').forEach((u) => log('audit', 'auth.register', new Date(Date.parse(u.createdAt.$date)), { actor: u, target: { type: 'user', id: u._id.$oid, label: u.email } }));
for (const o of orders) {
  const u = users.find((x) => x._id.$oid === o.user.$oid); const t = Date.parse(o.createdAt.$date);
  log('audit', 'auth.login', new Date(t - 5 * 60e3), { actor: u });
  log('audit', 'order.create', new Date(t), { actor: u, target: { type: 'order', id: o._id.$oid, label: o.orderNumber }, meta: { total: o.total, items: o.items.length, payment: o.paymentMethod } });
  for (let i = 1; i < o.statusHistory.length; i++) {
    const from = o.statusHistory[i - 1].status; const to = o.statusHistory[i].status;
    log('audit', to === 'cancelled' && i === 1 ? 'order.cancel' : 'order.status', new Date(Date.parse(o.statusHistory[i].at.$date)), { actor: to === 'cancelled' ? u : admin, target: { type: 'order', id: o._id.$oid, label: o.orderNumber }, meta: { from, to } });
  }
}
for (let i = 0; i < 18; i++) { const u = pick(customers); log('security', 'auth.login_failed', ago(rnd() * 20), { actor: u, meta: { email: u.email, reason: 'bad_password' } }); }
for (let i = 0; i < 6; i++) log('security', 'auth.login_failed', ago(rnd() * 20), { meta: { email: `ghost${i}@example.com`, reason: 'unknown_user' } });
log('security', 'auth.account_locked', ago(0.4), { actor: users.find((u) => u.email === 'locked@store.test'), meta: { email: 'locked@store.test' } });
log('security', 'auth.login_blocked', ago(1.2), { actor: users.find((u) => u.email === 'banned@store.test'), meta: { reason: 'banned' } });
for (let i = 0; i < 4; i++) log('security', 'access.denied', ago(rnd() * 10), { actor: pick(customers), message: 'GET /api/v1/admin/reports/sales', meta: { required: ['admin'] } });
log('security', 'auth.refresh_reuse', ago(3), { actor: customers[3], message: 'revoked or reused refresh token; all sessions dropped' });
products.slice(0, 12).forEach((p, i) => log('audit', 'product.create', new Date(Date.parse(p.createdAt.$date)), { actor: admin, target: { type: 'product', id: p._id.$oid, label: p.name }, meta: { price: p.price, variants: p.variants.length } }));
for (let i = 0; i < 8; i++) { const p = pick(products); log('audit', 'product.update', ago(rnd() * 25), { actor: admin, target: { type: 'product', id: p._id.$oid, label: p.name }, meta: { fields: ['price'] } }); }
log('audit', 'user.update', ago(30), { actor: admin, target: { type: 'user', id: users.find((u) => u.email === 'banned@store.test')._id.$oid, label: 'banned@store.test' }, meta: { changes: { status: 'banned' } } });
for (const r of reviews) log('audit', 'review.create', new Date(Date.parse(r.createdAt.$date)), { actor: users.find((u) => u._id.$oid === r.user.$oid), target: { type: 'product', id: r.product.$oid }, meta: { rating: r.rating } });
log('audit', 'report.export', ago(2), { actor: admin, meta: { type: 'sales', rows: 30 } });
log('audit', 'cache.clear', ago(1), { actor: admin, meta: { cleared: 14 } });
log('audit', 'logs.export', ago(0.5), { actor: admin, meta: { rows: 120 } });
log('error', 'server.error', ago(6), { status: 500, message: 'Cast to ObjectId failed for value "abc" (type string) at path "_id"', meta: { method: 'GET', path: '/api/v1/orders/abc', stack: 'CastError: Cast to ObjectId failed\n    at SchemaObjectId.cast' } });
log('error', 'server.error', ago(4), { status: 500, message: 'connection 3 to cluster0-shard-00-01 timed out', meta: { method: 'POST', path: '/api/v1/orders', stack: 'MongoNetworkTimeoutError: connection timed out' } });
log('error', 'server.error', ago(0.2), { status: 500, message: 'Simulated payment gateway failure', meta: { method: 'POST', path: '/api/v1/orders', stack: 'Error: Simulated payment gateway failure' } });
logs.sort((a, b) => a.createdAt.$date.localeCompare(b.createdAt.$date));

// ---------------------------------------------------------------- write
const files = { users, categories: cats, brands, products, carts, orders, reviews, activitylogs: logs };
for (const [name, docs] of Object.entries(files)) fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(docs, null, 1) + '\n');
const counts = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length]));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ anchor: ANCHOR.toISOString(), counts, passwords: { admin: PASSWORDS.admin, customer: PASSWORDS.customer } }, null, 2) + '\n');
console.log('Generated test data', counts, 'anchor', ANCHOR.toISOString().slice(0, 10));

// ---------------------------------------------------------------- SUMMARY.md
const st = {}; orders.forEach((o) => { st[o.status] = (st[o.status] || 0) + 1; });
const lt = {}; logs.forEach((l) => { lt[l.type] = (lt[l.type] || 0) + 1; });
const live = orders.filter((o) => o.status !== 'cancelled');
const money = (n) => round2(n).toFixed(2);
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), `# Test dataset

Generated by \`node testdata/generate.js\` (anchor date **${ANCHOR.toISOString().slice(0, 10)}**; dates are relative to it, so re-generate and re-import to refresh "last 30 days" charts).

## Import

\`\`\`bash
cd Server
# local / Docker / Atlas — the URI must include the database name
export MONGODB_URI="mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/ecommerce"
npm run testdata:import -- --drop --yes      # Node importer (also copies images to UPLOAD_DIR)
# or, with MongoDB Database Tools:
./testdata/import.sh --drop
\`\`\`
Atlas: \`--yes\` is required for any non-local database. With the shell script, copy \`testdata/uploads/*\` into the API's uploads folder yourself.
Atlas Compass / UI: *Add data → Import JSON file* per collection works too (choose "JSON", not "NDJSON").

## Accounts

| Email | Password | What it is |
|---|---|---|
| admin@store.test | ${PASSWORDS.admin} | admin |
| ops@store.test | ${PASSWORDS.admin} | second admin |
| customer1…customer12@store.test | ${PASSWORDS.customer} | active customers (orders, reviews, carts, wishlists) |
| suspended@store.test / banned@store.test / inactive@store.test | ${PASSWORDS.customer} | login refused (403) |
| locked@store.test | ${PASSWORDS.customer} | temporarily locked (423) |
| unverified@store.test | ${PASSWORDS.customer} | e-mail not verified |

## Contents

| Collection | Documents | Notes |
|---|---|---|
| users | ${users.length} | 2 admins, 12 customers, 5 special-state accounts |
| categories | ${cats.length} | 4 top-level + 9 children |
| brands | ${brands.length} | |
| products | ${products.length} | ${products.reduce((n, p) => n + p.variants.length, 0)} variants; 1 inactive, 2 sold-out variants, several low-stock variants; ${products.filter((p) => p.ratingCount).length} products rated |
| carts | ${carts.length} | |
| orders | ${orders.length} | ${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(', ')}; COD + card; free and paid shipping |
| reviews | ${reviews.length} | only from customers with a delivered order; product ratings are consistent |
| activitylogs | ${logs.length} | ${Object.entries(lt).map(([k, v]) => `${k} ${v}`).join(', ')} |

Expected report figures (all-time, cancelled orders excluded): **${live.length} orders, revenue ${money(live.reduce((s, o) => s + o.total, 0))}**, ${orders.length - live.length} cancelled.

## What to check

* **Dashboard / Reports** — sales per day/week/month, top products, categories, top customers, inventory (low stock threshold), CSV export.
* **System & logs** — audit trail, security events (failed logins, access denied, locked account), 3 server errors, cache hit rate, backup status.
* **Caching** — open /products twice: \`X-Cache: MISS\` then \`HIT\`; edit a product as admin and the next read is a MISS again.
* **Backup** — run \`./scripts/backup.sh\` (or the compose \`backup\` service) after importing, then \`./scripts/verify-backup.sh\`.
`);
