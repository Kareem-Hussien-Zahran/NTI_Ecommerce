/* Seeds an admin user and sample catalog. Safe by default: skips if products exist; `--force` wipes categories/brands/products first. */
const config = require('./config/env');
const { connectDB } = require('./config/db');
const mongoose = require('mongoose');
const User = require('./models/user.model');
const Category = require('./models/category.model');
const Brand = require('./models/brand.model');
const Product = require('./models/product.model');
const Order = require('./models/order.model');
const { resolveLine, totals } = require('./utils/pricing');

const fs = require('fs');
const path = require('path');

// Brand-coloured placeholder looks (black / deep red / crimson / red)
const LOOKS = [
  { from: '#000000', to: '#830000', text: '#ffffff' },
  { from: '#830000', to: '#bc0202', text: '#ffffff' },
  { from: '#bc0202', to: '#ff0000', text: '#ffffff' },
];

/** Writes a self-contained gradient SVG into the uploads dir and returns its public URL (no external image hosts needed). */
function img(seed, label, look) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const file = `seed-${seed}.svg`;
  const l = LOOKS[look % LOOKS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l.from}"/><stop offset="1" stop-color="${l.to}"/></linearGradient></defs><rect width="600" height="750" fill="url(#g)"/><text x="300" y="390" font-family="Helvetica,Arial,sans-serif" font-size="44" font-weight="700" fill="${l.text}" text-anchor="middle">${label}</text></svg>`;
  fs.writeFileSync(path.join(config.uploadDir, file), svg);
  return `/uploads/${file}`;
}
/**
 * `--demo-orders`: adds 8 demo customers (demo1@store.test …) and ~80 orders spread over the last 60 days so the
 * dashboard and Reports have something to show. Re-running replaces the demo orders. Never run this on a live store.
 */
async function demoOrders() {
  if (!process.argv.includes('--demo-orders')) return;
  let seedN = 42; const rnd = () => ((seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296); // deterministic
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const users = [];
  for (let i = 1; i <= 8; i++) {
    const email = `demo${i}@store.test`;
    users.push((await User.findOne({ email })) || (await User.create({
      firstName: pick(['Amira', 'Omar', 'Layla', 'Youssef', 'Nour', 'Karim', 'Salma', 'Hassan']), lastName: `Demo${i}`, email,
      password: `Demo-${Math.random().toString(36).slice(2)}A1`, createdAt: new Date(Date.now() - rnd() * 80 * 864e5),
    })));
  }
  await Order.deleteMany({ user: { $in: users.map((u) => u._id) } });
  const products = await Product.find();
  if (!products.length) return console.log('No products — seed the catalog first.');
  const docs = [];
  for (let n = 0; n < 80; n++) {
    const ageDays = rnd() * 60;
    const createdAt = new Date(Date.now() - ageDays * 864e5);
    const lines = [];
    for (let k = 0, count = 1 + Math.floor(rnd() * 3); k < count; k++) {
      const p = pick(products); const line = resolveLine(p, pick(p.variants).sku, 1 + Math.floor(rnd() * 2));
      if (line && !lines.some((l) => l.sku === line.sku)) lines.push(line);
    }
    const r = rnd();
    const status = ageDays > 10 ? (r < 0.72 ? 'delivered' : r < 0.84 ? 'cancelled' : 'shipped') : pick(['pending', 'paid', 'processing', 'shipped', 'delivered']);
    const u = pick(users); const card = rnd() < 0.55;
    docs.push({
      orderNumber: `DEMO-${n.toString().padStart(4, '0')}`, user: u._id, paymentMethod: card ? 'card' : 'cod',
      items: lines.map(({ product, sku, name, image, color, size, price, quantity }) => ({ product, sku, name, image, color, size, price, quantity })),
      shippingAddress: { fullName: u.fullName, phone: '+20 100 000 0000', street: '1 Demo Street', city: 'Cairo', postalCode: '11511', country: 'Egypt' },
      ...totals(lines), isPaid: card || status === 'delivered', status, statusHistory: [{ status, at: createdAt }], createdAt, updatedAt: createdAt,
    });
  }
  await Order.deleteMany({ orderNumber: /^DEMO-/ });
  await Order.insertMany(docs, { timestamps: false });
  console.log(`Demo data: ${users.length} customers, ${docs.length} orders`);
}

let counter = 0;
const nextLook = () => counter++ % 3;

async function seed() {
  await connectDB();
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@store.com').toLowerCase();
  if (!(await User.exists({ email }))) {
    await User.create({ firstName: 'Store', lastName: 'Admin', email, password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345', role: 'admin' });
    console.log(`Admin created: ${email}`);
  }
  if ((await Product.estimatedDocumentCount()) > 0 && !process.argv.includes('--force')) {
    console.log('Catalog already has products — skipping sample data. Re-run with --force to wipe and re-seed the catalog.');
    await demoOrders();
    return mongoose.disconnect();
  }
  await Promise.all([Category.deleteMany({}), Brand.deleteMany({}), Product.deleteMany({})]);
  const cats = {};
  for (const n of ['Tops', 'Bottoms', 'Outerwear', 'Footwear', 'Accessories']) cats[n] = await Category.create({ name: n });
  const brands = {};
  for (const n of ['Northwind', 'Urban Loom', 'Aster & Co']) brands[n] = await Brand.create({ name: n });

  const sizes = ['S', 'M', 'L', 'XL'];
  const colors = [{ name: 'Black', code: '#111111' }, { name: 'Sand', code: '#d8c7a5' }, { name: 'Navy', code: '#1f2a44' }];
  const mk = (name, price, cat, brand, gender, type, tags, featured = false) => ({
    name, price, description: `${name} — a versatile staple made from premium materials, designed for everyday comfort and a clean, modern fit.`,
    gender, productType: type, category: cats[cat]._id, brand: brands[brand]._id, tags, featured,
    compareAtPrice: featured ? Math.round(price * 1.25) : undefined,
    images: (() => { const k = nextLook(); return [img(name.replace(/\s/g, ''), name, k), img(name.replace(/\s/g, '') + '2', name, k + 1)]; })(),
    variants: colors.slice(0, 2).flatMap((c, ci) => sizes.map((s, si) => ({
      sku: `${type}-${name.replace(/\s/g, '').slice(0, 4).toUpperCase()}-${c.name.slice(0, 2).toUpperCase()}-${s}`,
      color: c, size: s, stock: 3 + ((ci + si) * 4) % 17,
    }))),
  });

  await Product.create([
    mk('Essential Tee', 24, 'Tops', 'Northwind', 'unisex', 't-shirt', ['basic', 'cotton'], true),
    mk('Oxford Shirt', 54, 'Tops', 'Aster & Co', 'men', 'shirt', ['formal', 'cotton']),
    mk('Linen Shirt', 62, 'Tops', 'Urban Loom', 'women', 'shirt', ['summer', 'linen'], true),
    mk('Slim Fit Jeans', 79, 'Bottoms', 'Urban Loom', 'men', 'jeans', ['denim']),
    mk('Wide Leg Trousers', 88, 'Bottoms', 'Aster & Co', 'women', 'pants', ['tailored']),
    mk('Cargo Shorts', 42, 'Bottoms', 'Northwind', 'men', 'shorts', ['summer']),
    mk('Quilted Jacket', 149, 'Outerwear', 'Northwind', 'unisex', 'jacket', ['winter', 'warm'], true),
    mk('Heavyweight Hoodie', 69, 'Outerwear', 'Urban Loom', 'unisex', 'hoodie', ['fleece', 'cozy'], true),
    mk('Merino Sweater', 96, 'Outerwear', 'Aster & Co', 'women', 'sweater', ['wool', 'winter']),
    mk('Canvas Sneakers', 65, 'Footwear', 'Urban Loom', 'unisex', 'shoes', ['everyday']),
    mk('Leather Belt', 29, 'Accessories', 'Aster & Co', 'men', 'accessory', ['leather']),
    mk('Summer Dress', 74, 'Tops', 'Aster & Co', 'women', 'dress', ['summer', 'floral'], true),
  ]);
  console.log('Seed complete: 5 categories, 3 brands, 12 products');
  await demoOrders();
  await mongoose.disconnect();
}
seed().catch((e) => { console.error(e); process.exit(1); });
