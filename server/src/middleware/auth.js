import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function optionalAuth(req, res, next) {
  const t = req.cookies?.mt_token;
  if (t) {
    try { req.user = jwt.verify(t, config.jwtSecret); } catch {}
  }
  next();
}

export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Please log in' });
    next();
  });
}
