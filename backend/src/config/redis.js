// src/config/redis.js
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Using ioredis for Cluster and Performance support
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true; // Reconnect on cluster failover
    }
    return false;
  },
});

redis.on('connect', () => console.log('✅ Connected to Redis'));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

module.exports = redis;
