import { Router } from 'express';
import mongoose from 'mongoose';
import { Video } from '../models/Video.js';
import { cached } from '../cache.js';
import { config } from '../config.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { privGate } from '../middleware/priv.js';
import { ah } from '../utils/ah.js';
import { getSub, listSubs } from '../utils/subs.js';
import { isPrivatePath, privatePaths } from '../utils/privacy.js';
import { refreshUnlock } from '../utils/pin.js';

// Subtitles: lists the subtitle tracks of a video (embedded streams + .srt/.vtt/.ass files next to it)
// and returns the text of one track for the player to draw.
const r = Router();
const gate = config.publicBrowsing ? optionalAuth : requireAuth;
r.use(gate, privGate);

// loads the video and applies the same private-folder rules as streaming
async function load(req, res) {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) { res.sendStatus(404); return null; }
  const v = await cached('v:' + id, () => Video.findById(id).select('relPath mimeType').lean());
  if (!v) { res.sendStatus(404); return null; }
  if (isPrivatePath(await privatePaths(), v.relPath)) {
    if (!req.user) { res.sendStatus(404); return null; }
    if (!req.privOk) { res.status(403).json({ error: 'This folder is locked', locked: true }); return null; }
    await refreshUnlock(req, res);
  }
  return { id, v };
}

r.get('/:id/list', ah(async (req, res) => {
  const x = await load(req, res); if (!x) return;
  res.set('Cache-Control', 'no-store').json({ subs: await listSubs(x.id, x.v.relPath) });
}));

r.get('/:id/:key', ah(async (req, res) => {
  const x = await load(req, res); if (!x) return;
  const s = await getSub(x.id, x.v.relPath, req.params.key);
  if (!s) return res.status(404).json({ error: 'No such subtitle track' });
  res.set('Cache-Control', 'no-store').json(s);
}));

export default r;
