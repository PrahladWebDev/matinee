import Redis from 'ioredis';
import { config } from './config.js';

let redis = null;
let ready = false;

export function initCache() {
  redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (n) => Math.min(n * 500, 10000),
  });
  redis.on('ready', () => { ready = true; console.log('Redis connected'); });
  redis.on('close', () => { ready = false; });
  redis.on('error', () => {});
  redis.connect().catch(() => console.warn('Redis unavailable - running without cache'));
}

// Read-through cache. Falls back to the DB if Redis is down.
export async function cached(key, fn, ttl = config.cacheTtl) {
  const k = 'mt:' + key;
  if (ready) {
    try {
      const hit = await redis.get(k);
      if (hit) return JSON.parse(hit);
    } catch {}
  }
  const raw = await fn();
  const val = raw === undefined ? null : JSON.parse(JSON.stringify(raw));
  if (ready && val !== null) redis.set(k, JSON.stringify(val), 'EX', ttl).catch(() => {});
  return val;
}

// Library is small & write-rarely, so any change just clears every cached key.
export function invalidate() {
  if (!ready) return;
  const stream = redis.scanStream({ match: 'mt:*', count: 200 });
  stream.on('data', (keys) => { if (keys.length) redis.del(keys).catch(() => {}); });
  stream.on('error', () => {});
}
