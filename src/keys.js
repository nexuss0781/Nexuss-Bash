'use strict';

const crypto = require('crypto');

function generateApiKey() {
  return `pk_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { generateApiKey, hashApiKey, hashPassword, verifyPassword };
