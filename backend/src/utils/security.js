// src/utils/security.js
const crypto = require('crypto');
const redis = require('../config/redis');

/**
 * Generate a cryptographically secure nonce and store it in Redis.
 * Nonces are "burn-after-reading", meaning they can only be used once.
 * TTL is 5 minutes to prevent long-term storage of stale nonces.
 */
async function generateNonce(userId) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const key = `nonce:${userId}:${nonce}`;
  
  // Store the nonce in Redis with a 5-minute expiration
  await redis.set(key, 'valid', 'EX', 300);
  
  return nonce;
}

/**
 * Verify if a nonce is valid for a given user and delete it immediately.
 * Returns true if valid and consumed, false otherwise.
 */
async function verifyAndConsumeNonce(userId, nonce) {
  if (!nonce) return false;
  
  const key = `nonce:${userId}:${nonce}`;
  
  // Atomic check and delete
  const result = await redis.del(key);
  
  return result === 1; // result is 1 if the key existed and was deleted
}

module.exports = {
  generateNonce,
  verifyAndConsumeNonce
};
