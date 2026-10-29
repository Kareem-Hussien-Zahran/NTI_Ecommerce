/* Shared test setup. Import this FIRST in every integration test file (it sets NODE_ENV before the app loads). */
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = require('os').tmpdir() + '/ecom-test-uploads';

const mongoose = require('mongoose');
const request = require('supertest');

/**
 * Connects to MongoDB for a test file.
 *  - TEST_MONGODB_URI set  -> uses it (CI / docker), with a dedicated database per test file
 *  - otherwise            -> mongodb-memory-server (downloads a mongod on first use)
 * Also detects FerretDB-style emulators, which lack $elemMatch on sub-documents; tests that need real MongoDB skip there.
 */
async function connect(name) {
  let mongod;
  if (process.env.TEST_MONGODB_URI) {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: `test_${name}` });
  } else {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }
  await mongoose.connection.dropDatabase();
  const app = require('../src/app');
  // emulators (FerretDB) reject some index options such as TTL; real MongoDB/Atlas accept them
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
  const info = await mongoose.connection.db.admin().command({ buildInfo: 1 }).catch(() => ({}));
  return { app, mongod, isFerret: !!info.ferretdbVersion };
}

async function disconnect(ctx) {
  await mongoose.disconnect();
  if (ctx.mongod) await ctx.mongod.stop();
}

/** supertest helper: api(app)('get', '/products', token).send(...) */
const apiFor = (app) => (method, path, token) => {
  const r = request(app)[method]('/api/v1' + path);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

/** Creates a user directly in the DB and returns { user, token } via the real login endpoint. */
async function makeUser(app, { role = 'customer', email, password = 'Passw0rd!', ...rest } = {}) {
  const User = require('../src/models/user.model');
  const user = await User.create({ firstName: 'Test', lastName: 'User', email, password, role, ...rest });
  const res = await apiFor(app)('post', '/auth/login').send({ email, password });
  return { user, token: res.body.accessToken };
}

module.exports = { connect, disconnect, apiFor, makeUser };
