const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeUri, redactUri, explainConnectionError } = require('../../src/config/db');

const ATLAS = 'mongodb+srv://shop:p%40ss@cluster0.ab1cd.mongodb.net/myStore?retryWrites=true&w=majority';

test('describeUri extracts host and database without credentials', () => {
  const d = describeUri(ATLAS);
  assert.deepEqual(d, { scheme: 'mongodb+srv', host: 'cluster0.ab1cd.mongodb.net', db: 'myStore', isAtlas: true });
  assert.ok(!JSON.stringify(d).includes('p%40ss'));
  assert.equal(describeUri('mongodb://localhost:27017/shop').isAtlas, false);
  assert.equal(describeUri('mongodb://h1:27017,h2:27017/shop').db, 'shop');
  assert.equal(describeUri('mongodb+srv://c.mongodb.net/?x=1').db, '');
  assert.equal(describeUri('http://nope'), null);
});

test('redactUri hides the password', () => {
  assert.equal(redactUri(ATLAS), 'mongodb+srv://***@cluster0.ab1cd.mongodb.net/myStore?retryWrites=true&w=majority');
  assert.equal(redactUri('mongodb://localhost/x'), 'mongodb://localhost/x');
});

test('connection errors get actionable hints', () => {
  assert.match(explainConnectionError(new Error('bad auth : Authentication failed.'), ATLAS), /URL-encoded/);
  assert.match(explainConnectionError(new Error('querySrv ENOTFOUND _mongodb._tcp.x.mongodb.net'), ATLAS), /host name/);
  const timeout = Object.assign(new Error('Server selection timed out after 10000 ms'), { name: 'MongooseServerSelectionError' });
  assert.match(explainConnectionError(timeout, ATLAS), /Network Access/);
  assert.match(explainConnectionError(timeout, 'mongodb://localhost/x'), /host\/port/);
  assert.match(explainConnectionError(new Error('connect ECONNREFUSED 127.0.0.1:27017'), 'mongodb://localhost/x'), /MongoDB running/);
  assert.equal(explainConnectionError(new Error('something else')), null);
});

test('env.js rejects connection strings that are unusable', () => {
  const load = (uri) => {
    const saved = process.env.MONGODB_URI; process.env.MONGODB_URI = uri;
    delete require.cache[require.resolve('../../src/config/env')];
    try { return require('../../src/config/env'); } finally { process.env.MONGODB_URI = saved; delete require.cache[require.resolve('../../src/config/env')]; }
  };
  assert.throws(() => load('http://x/db'), /must start with mongodb/);
  assert.throws(() => load('mongodb+srv://u:p@c.mongodb.net/?retryWrites=true'), /database name/);
  assert.equal(load(ATLAS).mongoUri, ATLAS);
});
