import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { Setting } from '../models/Setting.js';

// PIN for private folders. Stored only as a salted scrypt hash (never the PIN itself).
// PRIVATE_PIN in .env works as a fallback when no PIN has been set from the Admin page.
const KEY = 'privatePin';
const COOKIE = 'mt_priv';
const secret = () => config.jwtSecret + ':private';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

let memo; let memoAt = 0;
async function record() {
  if (memo !== undefined && Date.now() - memoAt < 3000) return memo;
  const s = await Setting.findOne({ key: KEY }).lean();
  memo = s?.value || null; memoAt = Date.now();
  return memo;
}
const forget = () => { memo = undefined; };

export async function pinIsSet() { return !!(await record()) || !!config.privatePin; }

export async function verifyPin(pin) {
  const p = String(pin ?? '');
  const r = await record();
  if (r) return crypto.timingSafeEqual(crypto.scryptSync(p, r.salt, 32), Buffer.from(r.hash, 'hex'));
  if (config.privatePin) return crypto.timingSafeEqual(sha(p), sha(config.privatePin));
  return false;
}

export async function setPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const ver = crypto.randomBytes(6).toString('hex');   // changing the PIN locks every browser again
  await Setting.updateOne({ key: KEY }, { $set: { value: { salt, hash, ver } } }, { upsert: true });
  forget();
}

export async function removePin() { await Setting.deleteOne({ key: KEY }); forget(); }

const version = async () => (await record())?.ver || 'env';
const minutes = () => Math.max(1, config.privateUnlockMinutes);

export async function issueUnlock(res) {
  const token = jwt.sign({ p: await version() }, secret(), { expiresIn: minutes() * 60 });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: minutes() * 60 * 1000 });
}

export const clearUnlock = (res) => res.clearCookie(COOKIE);

// true when there is no PIN, or this browser has entered it recently
export async function isUnlocked(req) {
  if (!(await pinIsSet())) return true;
  const t = req.cookies?.[COOKIE];
  if (!t) return false;
  try { return jwt.verify(t, secret()).p === await version(); } catch { return false; }
}

// sliding window: while you keep watching, the unlock keeps extending
export async function refreshUnlock(req, res) {
  if (!(await pinIsSet())) return;
  const d = jwt.decode(req.cookies?.[COOKIE] || '');
  if (d?.exp && d.exp * 1000 - Date.now() < minutes() * 30 * 1000) await issueUnlock(res);
}

export const unlockMinutes = minutes;
