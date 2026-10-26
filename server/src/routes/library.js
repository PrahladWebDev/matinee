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
    const recent = await Video.find().sort('-createdAt').limit(20).select(FIELDS).lean();
    const roots = (await Folder.find({ parent: null }).lean()).sort((a, b) => collator.compare(a.name, b.name));
    const rows = (await Promise.all(roots.map(async (f) => {
      const q = subtree(f);
      const [videos, count] = await Promise.all([
        Video.find(q).limit(50).select(FIELDS).lean(),
        Video.countDocuments(q),
      ]);
      return count ? { folder: { _id: f._id, name: f.name }, count, videos: videos.sort(byTitle) } : null;
    }))).filter(Boolean);
    const loose = (await Video.find({ folder: null }).limit(50).select(FIELDS).lean()).sort(byTitle);
    return { recent, rows, loose, total: await Video.estimatedDocumentCount() };
  }));
}));

// Folder contents (id or "root")
r.get('/folders/:id', gate, ah(async (req, res) => {
  const id = req.params.id;
  const data = await cached('folder:' + id, async () => {
    let folder = null;
    if (id !== 'root') {
      if (!isId(id)) return null;
      folder = await Folder.findById(id).lean();
      if (!folder) return null;
    }
    const subs = (await Folder.find({ parent: folder ? folder._id : null }).lean())
      .sort((a, b) => collator.compare(a.name, b.name));
    const folders = await Promise.all(subs.map(async (s) => {
      const q = subtree(s);
      const [videoCount, cover] = await Promise.all([
        Video.countDocuments(q),
        Video.findOne({ ...q, hasThumb: true }).select('_id').lean(),
      ]);
      return { _id: s._id, name: s.name, videoCount, cover: cover?._id || null };
    }));
    const videos = (await Video.find({ folder: folder ? folder._id : null }).select(FIELDS).lean()).sort(byTitle);
    return {
      folder: folder && { _id: folder._id, name: folder.name, parent: folder.parent },
      breadcrumbs: folder ? await crumbs(folder) : [],
      folders,
      videos,
    };
  });
  if (!data) return res.status(404).json({ error: 'Folder not found' });
  res.json(data);
}));

// Watch page data: video + sibling playlist + prev/next
r.get('/videos/:id', gate, ah(async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return res.status(404).json({ error: 'Video not found' });
  const data = await cached('watch:' + id, async () => {
    const video = await Video.findById(id).select(FIELDS).lean();
    if (!video) return null;
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
r.get('/random', gate, ah(async (req, res) => {
  const { folder, exclude } = req.query;
  const match = {};
  if (folder && folder !== 'root') {
    if (!isId(folder)) return res.status(400).json({ error: 'Bad folder' });
    const f = await Folder.findById(folder).select('path').lean();
    if (!f) return res.status(404).json({ error: 'Folder not found' });
    match.relPath = { $regex: '^' + esc(f.path) + '/' };
  }
  const pick = () => Video.aggregate([{ $match: match }, { $sample: { size: 1 } }, { $project: { title: 1, folder: 1, hasThumb: 1, duration: 1 } }]);
  if (exclude && isId(exclude)) match._id = { $ne: new mongoose.Types.ObjectId(exclude) };
  let [v] = await pick();
  if (!v && match._id) { delete match._id; [v] = await pick(); }
  if (!v) return res.status(404).json({ error: 'No videos yet' });
  res.json(v);
}));

r.get('/search', gate, ah(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.json([]);
  res.json(await Video.find({ title: { $regex: esc(q), $options: 'i' } }).limit(40).select(FIELDS).lean());
}));

r.get('/poster/:id', gate, ah(async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return res.sendStatus(404);
  const v = await Video.findById(id).select('relPath duration').lean();
  if (!v) return res.sendStatus(404);
  let file;
  try { file = await getPoster(v); } catch { file = thumbPath(id); }   // fall back to the small thumbnail
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=604800' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));

r.get('/thumb/:id', gate, (req, res) => {
  if (!isId(req.params.id)) return res.sendStatus(404);
  res.sendFile(thumbPath(req.params.id), { dotfiles: 'allow', maxAge: '7d', headers: { 'Cache-Control': 'private, max-age=604800' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
});

// Video streaming (login required unless PUBLIC_BROWSING=true)
r.get('/stream/:id', gate, ah(async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return res.sendStatus(404);
  const v = await cached('v:' + id, () => Video.findById(id).select('relPath mimeType').lean());
  if (!v) return res.sendStatus(404);
  await sendVideo(req, res, v);
}));

export default r;
