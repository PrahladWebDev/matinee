import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { privGate } from '../middleware/priv.js';
import { ah } from '../utils/ah.js';
import { clearUnlock, issueUnlock, pinIsSet, unlockMinutes, verifyPin } from '../utils/pin.js';

const r = Router();
r.use(requireAuth);

r.get('/status', privGate, ah(async (req, res) => {
  res.json({ pinSet: await pinIsSet(), unlocked: !!req.privOk, minutes: unlockMinutes() });
}));

r.post('/unlock',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many wrong PINs. Try again in 15 minutes.' } }),
  ah(async (req, res) => {
    if (!(await pinIsSet())) return res.json({ ok: true });
    if (!(await verifyPin(req.body?.pin))) return res.status(401).json({ error: 'Wrong PIN' });
    await issueUnlock(res);
    res.json({ ok: true });
  }));

r.post('/lock', (req, res) => { clearUnlock(res); res.json({ ok: true }); });

export default r;
