import { Router } from 'express';
import { Video } from '../models/Video.js';
import { ah } from '../utils/ah.js';
import { getPoster, thumbPath } from '../utils/media.js';
import { sendVideo } from '../utils/stream.js';

// PUBLIC routes (no login). A valid, unexpired token unlocks exactly one video.
const r = Router();
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

r.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

export async function findShared(token, fields) {
  if (!TOKEN.test(String(token))) return null;
  const v = await Video.findOne({ shareToken: token }).select(fields + ' shareExpires').lean();
  if (!v) return null;
  if (v.shareExpires && new Date(v.shareExpires) < new Date()) return null;
  return v;
}

const gone = (res) => res.status(404).json({ error: 'This link is no longer available' });

r.get('/:token', ah(async (req, res) => {
  const v = await findShared(req.params.token, 'title duration');
  if (!v) return gone(res);
  Video.updateOne({ _id: v._id }, { $inc: { shareViews: 1 } }).catch(() => {});
  res.json({ title: v.title, duration: v.duration, expiresAt: v.shareExpires || null });
}));

r.get('/:token/stream', ah(async (req, res) => {
  const v = await findShared(req.params.token, 'relPath mimeType');
  if (!v) return res.sendStatus(404);
  await sendVideo(req, res, v);
}));

r.get('/:token/poster', ah(async (req, res) => {
  const v = await findShared(req.params.token, 'relPath duration');
  if (!v) return res.sendStatus(404);
  let file;
  try { file = await getPoster(v); } catch { file = thumbPath(v._id); }
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Cache-Control': 'public, max-age=86400' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));

export default r;
