#!/usr/bin/env node
/**
 * Loads the test dataset into MongoDB (local, Docker or Atlas) and copies the placeholder images.
 *
 *   MONGODB_URI="mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/ecommerce" npm run testdata:import -- --drop --yes
 *
 *   --drop      delete existing documents in the 8 dataset collections first (otherwise import aborts if they are not empty)
 *   --yes       required for any non-local database (Atlas) or NODE_ENV=production — a deliberate "yes, wipe it" confirmation
 *   --no-uploads  skip copying images to UPLOAD_DIR
 *   --dry-run   validate the files and print what would happen
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = mongoose.mongo.BSON;

const DIR = __dirname;
const COLLECTIONS = ['users', 'categories', 'brands', 'products', 'carts', 'orders', 'reviews', 'activitylogs'];
const flag = (f) => process.argv.includes(f);

const load = (name) => EJSON.deserialize(JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8')));

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_URI (include the database name, e.g. mongodb+srv://…/ecommerce)');
  const isLocal = /^mongodb:\/\/(?:[^@/]*@)?(localhost|127\.0\.0\.1|mongo|db)(:|\/|$)/.test(uri);
  if ((!isLocal || process.env.NODE_ENV === 'production') && !flag('--yes') && !flag('--dry-run')) {
    throw new Error('This is not a local database. Re-run with --yes to confirm you want to write the test data there (use --drop --yes to replace existing data).');
  }
  const data = Object.fromEntries(COLLECTIONS.map((c) => [c, load(c)]));
  const summary = Object.fromEntries(COLLECTIONS.map((c) => [c, data[c].length]));
  if (flag('--dry-run')) { console.log('Dry run OK — would import', summary); return; }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Connected to database "${db.databaseName}"`);

  const existing = {};
  for (const c of COLLECTIONS) existing[c] = await db.collection(c).countDocuments();
  const nonEmpty = Object.entries(existing).filter(([, n]) => n > 0);
  if (nonEmpty.length && !flag('--drop')) {
    throw new Error(`Collections already contain data (${nonEmpty.map(([c, n]) => `${c}:${n}`).join(', ')}). Use --drop to replace them.`);
  }
  if (flag('--drop')) for (const c of COLLECTIONS) await db.collection(c).deleteMany({});

  for (const c of COLLECTIONS) {
    await db.collection(c).insertMany(data[c], { ordered: true });
    console.log(`  ${c.padEnd(13)} ${String(data[c].length).padStart(4)} documents`);
  }

  // make sure the app's indexes (unique email/slug/sku, TTL on activitylogs…) exist
  require('../src/models/user.model'); require('../src/models/category.model'); require('../src/models/brand.model');
  require('../src/models/product.model'); require('../src/models/cart.model'); require('../src/models/order.model');
  require('../src/models/review.model'); require('../src/models/activitylog.model');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch((e) => console.warn(`  (index warning on ${m.modelName}: ${e.message})`))));

  if (!flag('--no-uploads')) {
    const dest = process.env.UPLOAD_DIR || path.join(DIR, '../uploads');
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(path.join(DIR, 'uploads'));
    for (const f of files) fs.copyFileSync(path.join(DIR, 'uploads', f), path.join(dest, f));
    console.log(`  images        ${String(files.length).padStart(4)} files -> ${dest}`);
  }
  console.log('\nDone. Logins: admin@store.test / Admin@12345  ·  customer1@store.test / Test@12345  (see testdata/SUMMARY.md)');
}

main().catch((e) => { console.error(`\n✖ ${e.message}`); process.exitCode = 1; }).finally(() => mongoose.disconnect());
