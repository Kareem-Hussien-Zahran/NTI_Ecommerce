const mongoose = require('mongoose');
const config = require('./env');

/** Splits a connection string into safe-to-log parts (never includes credentials). */
function describeUri(uri) {
  const m = /^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/.exec(String(uri || ''));
  if (!m) return null;
  return { scheme: m[1], host: m[2], db: m[3] || '', isAtlas: /\.mongodb\.net$/i.test(m[2].split(',')[0].split(':')[0]) };
}

/** Replaces user:password in a connection string with ***. */
const redactUri = (uri) => String(uri || '').replace(/\/\/[^@/]*@/, '//***@');

/** Turns the driver's cryptic connection errors into an actionable hint (or null). */
function explainConnectionError(err, uri = '') {
  const msg = `${err?.name || ''} ${err?.message || ''} ${err?.cause?.message || ''}`;
  const atlas = describeUri(uri)?.isAtlas;
  if (/bad auth|Authentication failed|AuthenticationFailed/i.test(msg))
    return 'Authentication failed: check the database user name and password in MONGODB_URI. Special characters in the password must be URL-encoded (e.g. @ -> %40), and the user must exist in Atlas -> Database Access.';
  if (/ENOTFOUND|querySrv|EREFUSED.*_mongodb/i.test(msg))
    return 'Could not resolve the cluster host name: check the host in MONGODB_URI (copy it from Atlas -> Connect -> Drivers) and that this machine has working DNS/internet.';
  if (/ECONNREFUSED/i.test(msg))
    return atlas ? 'Connection refused by the cluster: check your network/firewall allows outbound port 27017.'
      : 'Nothing is listening at that address: is MongoDB running? (or point MONGODB_URI at your Atlas cluster)';
  if (/ReplicaSetNoPrimary|Server selection timed out|MongooseServerSelectionError|tlsv1 alert|SSL routines|ETIMEDOUT/i.test(msg))
    return atlas ? 'Could not reach the Atlas cluster. Most often this server\'s public IP is not in Atlas -> Network Access (IP access list). Add it (or your current IP) and retry; also check the cluster is not paused.'
      : 'Could not reach MongoDB within 10s: check the host/port in MONGODB_URI and that the server is up.';
  return null;
}

async function connectDB(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: config.mongoMaxPool });
  } catch (e) {
    const hint = explainConnectionError(e, uri);
    if (hint) e.message = `${e.message}\n  -> ${hint}`;
    throw e;
  }
  const d = describeUri(uri);
  console.log(`MongoDB connected${d ? ` (${d.isAtlas ? 'Atlas' : 'host'} ${d.host}, db "${d.db}")` : ''}`);
}

module.exports = { connectDB, describeUri, redactUri, explainConnectionError };
