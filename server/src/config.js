import 'dotenv/config';
import path from 'path';

const e = process.env;
export const config = {
  port: +e.PORT || 5000,
  mongoUri: e.MONGO_URI || 'mongodb://127.0.0.1:27017/matinee',
  redisUrl: e.REDIS_URL || 'redis://127.0.0.1:6379',
  mediaRoot: path.resolve(e.MEDIA_ROOT || './media'),
  jwtSecret: e.JWT_SECRET || 'dev-secret',
  adminUser: e.ADMIN_USER || 'admin',
  adminPass: e.ADMIN_PASSWORD || 'admin',
  publicBrowsing: e.PUBLIC_BROWSING === 'true',
  cookieSecure: e.COOKIE_SECURE === 'true',
  nginxAccel: e.USE_NGINX_ACCEL === 'true',
  cacheTtl: +e.CACHE_TTL || 3600,
  privatePin: e.PRIVATE_PIN || '',                       // optional; the PIN can also be set from Admin
  privateUnlockMinutes: +e.PRIVATE_UNLOCK_MINUTES || 60, // how long a correct PIN keeps private folders open
};

if (process.env.NODE_ENV === 'production' &&
    (config.jwtSecret === 'dev-secret' || config.adminPass === 'admin' || config.adminPass === 'change-this-password')) {
  throw new Error('Set JWT_SECRET and ADMIN_PASSWORD in .env before running in production');
}
