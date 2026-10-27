import { Router } from 'express';
import mongoose from 'mongoose';
import { Folder } from '../models/Folder.js';
import { Video } from '../models/Video.js';
import { config } from '../config.js';
import { cached } from '../cache.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { ah } from '../utils/ah.js';
import { esc, getPoster, thumbPath } from '../utils/media.js';
import { sendVideo } from '../utils/stream.js';
import { all, isPrivatePath, privatePaths, visible } from '../utils/privacy.js';
import { privGate } from '../middleware/priv.js';
import { pinIsSet, refreshUnlock } from '../utils/pin.js';

const LOCKED = { error: 'This folder is locked', locked: true };
// 0 = fine; 404 = hidden from logged-out visitors; 403 = needs the private-folder PIN
async function privBlock(req, relPath) {
  if (!isPrivatePath(await privatePaths(), relPath)) return 0;
  if (!req.user) return 404;
  return req.privOk ? 0 : 403;
}
const videoRel = (id) => cached('v:' + id, () => Video.findById(id).select('relPath mimeType').lean());

const r = Router();
const gate = config.publicBrowsing ? optionalAuth : requireAuth;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byTitle = (a, b) => collator.compare(a.title, b.title);
const isId = (id) => mongoose.isValidObjectId(id);
const subtree = (folder) => ({ relPath: { $regex: '^' + esc(folder.path) + '/' } });
const FIELDS = 'title folder duration hasThumb size createdAt';

async function crumbs(folder) {
  const out = [];
  let f = folder;
  while (f) {
    out.unshift({ _id: f._id, name: f.name });
    f = f.parent ? await Folder.findById(f.parent).select('name parent').lean() : null;
  }
  return out;
}

// Home: rows per top-level folder + recently added
r.get('/home', gate, ah(async (req, res) => {
  res.json(await cached('home', async () => {
    const paths = await privatePaths();
    const vis = visible(paths);
    const recent = await Video.find(vis).sort('-createdAt').limit(20).select(FIELDS).lean();
    const roots = (await Folder.find({ parent: null, isPrivate: { $ne: true } }).lean()).sort((a, b) => collator.compare(a.name, b.name));
    const rows = (await Promise.all(roots.map(async (f) => {
      const q = all(subtree(f), vis);
      const [videos, count] = await Promise.all([
        Video.find(q).limit(50).select(FIELDS).lean(),
        Video.countDocuments(q),
      ]);
      return count ? { folder: { _id: f._id, name: f.name }, count, videos: videos.sort(byTitle) } : null;
    }))).filter(Boolean);
    const loose = (await Video.find({ folder: null }).limit(50).select(FIELDS).lean()).sort(byTitle);
    return { recent, rows, loose, total: await Video.countDocuments(vis) };
  }));
}));

// Folder contents (id or "root")
r.get('/folders/:id', gate, privGate, ah(async (req, res) => {
  const id = req.params.id;
  // private folders: logged-in viewers only, and with a PIN set only after the PIN was entered
  if (id !== 'root' && isId(id)) {
    const f = await Folder.findById(id).select('path').lean();
    if (f) {
      const b = await privBlock(req, f.path);
      if (b === 404) return res.status(404).json({ error: 'Folder not found' });
      if (b === 403) return res.status(403).json(LOCKED);
      if (isPrivatePath(await privatePaths(), f.path)) await refreshUnlock(req, res);
    }
  }
  const data = await cached('folder:' + id + (req.user ? '' : ':anon'), async () => {
    let folder = null;
    if (id !== 'root') {
      if (!isId(id)) return null;
      folder = await Folder.findById(id).lean();
      if (!folder) return null;
    }
    const paths = await privatePaths();
    const vis = visible(paths);
    const subs = (await Folder.find({ parent: folder ? folder._id : null }).lean())
      .sort((a, b) => collator.compare(a.name, b.name))
      .filter((s) => req.user || !isPrivatePath(paths, s.path));
    const folders = await Promise.all(subs.map(async (s) => {
      const priv = isPrivatePath(paths, s.path);
      const q = priv ? subtree(s) : all(subtree(s), vis);   // inside a private folder everything counts
      const [videoCount, cover] = await Promise.all([
        Video.countDocuments(q),
        Video.findOne({ ...q, hasThumb: true }).select('_id').lean(),
      ]);
      return { _id: s._id, name: s.name, videoCount, cover: cover?._id || null, isPrivate: priv };
    }));
    const videos = (await Video.find({ folder: folder ? folder._id : null }).select(FIELDS).lean()).sort(byTitle);
    return {
      folder: folder && { _id: folder._id, name: folder.name, parent: folder.parent, isPrivate: isPrivatePath(paths, folder.path) },
      breadcrumbs: folder ? await crumbs(folder) : [],
      folders,
      videos,
    };
  });
  if (!data) return res.status(404).json({ error: 'Folder not found' });
  // while locked, private sub-folders show only their name: no cover picture, no video count
  const out = req.privOk ? data : { ...data, folders: data.folders.map((f) => (f.isPrivate ? { ...f, cover: null, videoCount: 0, locked: true } : f)) };
  res.json({ ...out, pinSet: await pinIsSet() });
}));

// Watch page data: video + sibling playlist + prev/next
r.get('/videos/:id', gate, privGate, ah(async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return res.status(404).json({ error: 'Video not found' });
  const x = await videoRel(id);
  if (x) {
    const b = await privBlock(req, x.relPath);
    if (b === 404) return res.status(404).json({ error: 'Video not found' });
    if (b === 403) return res.status(403).json(LOCKED);
    if (isPrivatePath(await privatePaths(), x.relPath)) await refreshUnlock(req, res);
  }
  const data = await cached('watch:' + id, async () => {
    const found = await Video.findById(id).select(FIELDS + ' relPath').lean();
    if (!found) return null;
    const { relPath, ...rest } = found;
    // priv = lives in a private folder (the client keeps it out of Continue Watching / My List on Home)
    const video = { ...rest, priv: isPrivatePath(await privatePaths(), relPath) };
    const folder = video.folder ? await Folder.findById(video.folder).lean() : null;
    const playlist = (await Video.find({ folder: video.folder }).select('title duration hasThumb').lean()).sort(byTitle);
    const i = playlist.findIndex((v) => String(v._id) === id);
    return {
      video,
      folder: folder && { _id: folder._id, name: folder.name },
      breadcrumbs: folder ? await crumbs(folder) : [],
      playlist,
      prevId: playlist[i - 1]?._id || null,
      nextId: playlist[i + 1]?._id || null,
    };
  });
  if (!data) return res.status(404).json({ error: 'Video not found' });
  res.json(data);
}));

// Random video. ?folder=<id> limits to that folder (and its sub-folders). ?exclude=<id> avoids repeats.
r.get('/random', gate, privGate, ah(async (req, res) => {
  const { folder, exclude } = req.query;
  const match = {};
  const paths = await privatePaths();
  let inPrivate = false;   // shuffling inside a private folder is fine - that is playing it directly
  if (folder && folder !== 'root') {
    if (!isId(folder)) return res.status(400).json({ error: 'Bad folder' });
    const f = await Folder.findById(folder).select('path').lean();
    if (!f) return res.status(404).json({ error: 'Folder not found' });
    inPrivate = isPrivatePath(paths, f.path);
    if (inPrivate && !req.user) return res.status(404).json({ error: 'Folder not found' });
    if (inPrivate && !req.privOk) return res.status(403).json(LOCKED);
    match.relPath = { $regex: '^' + esc(f.path) + '/' };
  }
  const filter = () => all(match, inPrivate ? {} : visible(paths));
  const pick = () => Video.aggregate([{ $match: filter() }, { $sample: { size: 1 } }, { $project: { title: 1, folder: 1, hasThumb: 1, duration: 1 } }]);
  if (exclude && isId(exclude)) match._id = { $ne: new mongoose.Types.ObjectId(exclude) };
  let [v] = await pick();
  if (!v && match._id) { delete match._id; [v] = await pick(); }
  if (!v) return res.status(404).json({ error: 'No videos yet' });
  res.json(v);
}));

r.get('/search', gate, ah(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.json([]);
  const vis = visible(await privatePaths());
  res.json(await Video.find(all({ title: { $regex: esc(q), $options: 'i' } }, vis)).limit(40).select(FIELDS).lean());
}));

r.get('/poster/:id', gate, privGate, ah(async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return res.sendStatus(404);
  const v = await Video.findById(id).select('relPath duration').lean();
  if (!v) return res.sendStatus(404);
  const blocked = await privBlock(req, v.relPath);
  if (blocked) return res.sendStatus(blocked);
  let file;
  try { file = await getPoster(v); } catch { file = thumbPath(id); }   // fall back to the small thumbnail
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=604800' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));

r.get('/thumb/:id', gate, privGate, ah(async (req, res) => {
  if (!isId(req.params.id)) return res.sendStatus(404);
  const x = await videoRel(req.params.id);
  if (!x) return res.sendStatus(404);
  const blocked = await privBlock(req, x.relPath);
  if (blocked) return res.sendStatus(blocked);
  res.sendFile(thumbPath(req.params.id), { dotfiles: 'allow', maxAge: '7d', headers: { 'Cache-Control': 'private, max-age=604800' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));

// Video streaming (login required unless PUBLIC_BROWSING=true)
r.get('/stream/:id', gate, privGate, ah(async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return res.sendStatus(404);
  const v = await cached('v:' + id, () => Video.findById(id).select('relPath mimeType').lean());
  if (!v) return res.sendStatus(404);
  const blocked = await privBlock(req, v.relPath);
  if (blocked) return res.status(blocked).json(blocked === 403 ? LOCKED : { error: 'Not found' });
  if (isPrivatePath(await privatePaths(), v.relPath)) await refreshUnlock(req, res);   // keeps a long movie unlocked while it plays
  await sendVideo(req, res, v);
}));

export default r;
