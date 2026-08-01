'use strict';

const buckets = new Map();

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function prune() {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size > 5000) {
    for (const [key, b] of buckets) {
      if (b.resetAt <= now + 60 * 1000) buckets.delete(key);
    }
  }
}

function bucket(key, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  return b;
}

function rateLimitHit(key, windowMs) {
  prune();
  bucket(key, windowMs).count += 1;
}

function isRateLimited(key, max, windowMs) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= Date.now()) return false;
  return b.count > max;
}

function middleware({
  windowMs = 15 * 60 * 1000,
  max = 20,
  keyPrefix = 'rl',
  message = 'Demasiados intentos. Intenta de nuevo más tarde.',
} = {}) {
  return (req, res, next) => {
    prune();
    const key = `${keyPrefix}:${clientIp(req)}:${windowMs}`;
    const b = bucket(key, windowMs);
    b.count += 1;
    const remaining = Math.max(0, max - b.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - Date.now()) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = { middleware, rateLimitHit, isRateLimited, clientIp };
