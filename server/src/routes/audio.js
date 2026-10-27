import { Router } from 'express';
import mongoose from 'mongoose';
import { Video } from '../models/Video.js';
import { cached } from '../cache.js';
import { config } from '../config.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { privGate } from '../middleware/priv.js';
import { ah } from '../utils/ah.js';
import { audioFailed, audioPath, audioState, clearAudioError, listTracks } from '../utils/audio.js';
import { isPrivatePath, privatePaths } from '../utils/privacy.js';
import { refreshUnlock } from '../utils/pin.js';

// Audio-language picker: lists the audio tracks inside a video file and serves any of them as a
// small stand-alone .m4a that the player plays in sync with the (muted) video.
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

r.get('/:id/tracks', ah(async (req, res) => {
  const x = await load(req, res); if (!x) return;
  res.json({ tracks: await listTracks(x.id, x.v.relPath) });
}));

// start (or check) extraction of track n: { state: 'ready' | 'working' | 'error' }
r.get('/:id/:n/status', ah(async (req, res) => {
  const x = await load(req, res); if (!x) return;
  const n = parseInt(req.params.n, 10);
  const t = (await listTracks(x.id, x.v.relPath))[n];
  if (!t) return res.status(404).json({ error: 'No such audio track' });
  if (audioFailed(x.id, n)) { clearAudioError(x.id, n); return res.json({ state: 'error' }); }   // report once, a retry starts over
  res.json({ state: await audioState(x.id, n, x.v.relPath, t.codec) });
}));

r.get('/:id/:n/file', ah(async (req, res) => {
  const x = await load(req, res); if (!x) return;
  const n = parseInt(req.params.n, 10);
  if (!Number.isInteger(n) || n < 0) return res.sendStatus(404);
  res.sendFile(audioPath(x.id, n), { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=3600' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));

export default r;
