const redis = require('redis');

const client = redis.createClient({
  url: 'redis://localhost:6379',
});

client.on('error', (err) => console.error('Redis Client Error', err));

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
  }
}

async function cacheSet(key, value, ttl = 3600) {
  await client.setEx(key, ttl, JSON.stringify(value));
}

async function cacheGet(key) {
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
}

module.exports = {
  connectRedis,
  cacheSet,
  cacheGet,
};
