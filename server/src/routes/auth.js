import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { optionalAuth } from '../middleware/auth.js';

const r = Router();
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));

r.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const okUser = same(username, config.adminUser);
  const okPass = same(password, config.adminPass);
  if (!(okUser && okPass)) return res.status(401).json({ error: 'Wrong username or password' });
  const token = jwt.sign({ u: config.adminUser }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie('mt_token', token, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 30 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

r.post('/logout', (req, res) => { res.clearCookie('mt_token'); res.json({ ok: true }); });

r.get('/me', optionalAuth, (req, res) =>
  res.json({ authenticated: !!req.user, publicBrowsing: config.publicBrowsing }));

export default r;
