import { Router } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { Folder } from '../models/Folder.js';
import { Video } from '../models/Video.js';
import { config } from '../config.js';
import { invalidate } from '../cache.js';
import { requireAuth } from '../middleware/auth.js';
import { ah } from '../utils/ah.js';
import rateLimit from 'express-rate-limit';
import { pinIsSet, removePin, setPin, verifyPin, clearUnlock } from '../utils/pin.js';
import { VIDEO_EXT, absPath, esc, exists, queueProcess, removeThumbs, safeName } from '../utils/media.js';

const r = Router();
r.use(requireAuth);

const posix = path.posix;
const bad = (res, code, error) => res.status(code).json({ error });

async function ensureFolder(name, parent, isPrivate = false) {
  const dirName = safeName(name);
  const rel = parent ? `${parent.path}/${dirName}` : dirName;
  let f = await Folder.findOne({ path: rel });
  if (!f) {
    await fsp.mkdir(absPath(rel), { recursive: true });
    f = await Folder.create({ name: String(name).trim() || dirName, dirName, parent: parent?._id || null, path: rel, isPrivate: !!isPrivate });
  }
  return f;
}

// ---------- folders ----------
r.get('/folders', ah(async (req, res) => {
  res.json(await Folder.find().sort('path').lean());
}));

// everything for the admin tree in one go: all folders + every video's basic info
r.get('/library', ah(async (req, res) => {
  const [folders, videos] = await Promise.all([
    Folder.find().sort('path').lean(),
    Video.find().select('title folder duration size').lean(),
  ]);
  res.json({ folders, videos });
}));

r.post('/folders', ah(async (req, res) => {
  const { name, parent, isPrivate } = req.body || {};
  if (!name?.trim()) return bad(res, 400, 'Folder name is required');
  let p = null;
  if (parent) { p = await Folder.findById(parent); if (!p) return bad(res, 404, 'Parent folder not found'); }
  const f = await ensureFolder(name, p, isPrivate);
  invalidate();
  res.status(201).json(f);
}));

// "Show/Season 1" -> creates every missing level, returns the last folder
r.post('/folders/ensure', ah(async (req, res) => {
  const { path: p, parent } = req.body || {};
  let cur = null;
  if (parent) { cur = await Folder.findById(parent); if (!cur) return bad(res, 404, 'Parent folder not found'); }
  for (const part of String(p || '').split('/').filter(Boolean)) cur = await ensureFolder(part, cur);
  if (!cur) return bad(res, 400, 'Empty path');
  invalidate();
  res.json(cur);
}));

r.patch('/folders/:id', ah(async (req, res) => {
  const f = await Folder.findById(req.params.id);
  if (!f) return bad(res, 404, 'Folder not found');
  if (req.body?.name?.trim()) f.name = req.body.name.trim();
  if (typeof req.body?.isPrivate === 'boolean') f.isPrivate = req.body.isPrivate;
  await f.save();
  invalidate();
  res.json(f);
}));

r.delete('/folders/:id', ah(async (req, res) => {
  const f = await Folder.findById(req.params.id);
  if (!f) return bad(res, 404, 'Folder not found');
  const rx = { $regex: '^' + esc(f.path) + '/' };
  const vids = await Video.find({ relPath: rx }).select('_id');
  await Promise.all(vids.map((v) => removeThumbs(v._id)));
  await Video.deleteMany({ relPath: rx });
  await Folder.deleteMany({ $or: [{ _id: f._id }, { path: rx }] });
  await fsp.rm(absPath(f.path), { recursive: true, force: true });
  invalidate();
  res.json({ ok: true, removedVideos: vids.length });
}));

// ---------- videos ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (q, f, cb) => cb(null, path.join(config.mediaRoot, '.tmp')),
    filename: (q, f, cb) => cb(null, crypto.randomUUID() + path.extname(f.originalname).toLowerCase()),
  }),
  fileFilter: (q, f, cb) =>
    VIDEO_EXT[path.extname(f.originalname).toLowerCase()] ? cb(null, true) : cb(new Error('Unsupported file type (use mp4, m4v, webm, mkv, mov)')),
});

r.post('/videos', upload.single('file'), async (req, res, next) => {
  if (!req.file) return bad(res, 400, 'No file received');
  try {
    const { folderId } = req.body;
    let folder = null;
    if (folderId && folderId !== 'root') {
      folder = await Folder.findById(folderId);
      if (!folder) throw Object.assign(new Error('Folder not found'), { status: 404 });
    }
    const ext = path.extname(req.file.filename).toLowerCase();
    const title = (req.body.title || '').trim() || 'Untitled';
    const dir = folder ? folder.path : '';
    const base = safeName(title);
    let rel = posix.join(dir, base + ext);
    for (let n = 1; await exists(absPath(rel)); n++) rel = posix.join(dir, `${base} (${n})${ext}`);
    await fsp.rename(req.file.path, absPath(rel));
    const video = await Video.create({
      title, folder: folder?._id || null, relPath: rel, filename: posix.basename(rel),
      size: req.file.size, mimeType: VIDEO_EXT[ext],
    });
    queueProcess(video._id);
    invalidate();
    res.status(201).json(video);
  } catch (e) {
    await fsp.rm(req.file.path, { force: true });
    next(e);
  }
});

r.patch('/videos/:id', ah(async (req, res) => {
  const v = await Video.findById(req.params.id);
  if (!v) return bad(res, 404, 'Video not found');
  const { title, folderId } = req.body || {};
  if (title?.trim()) v.title = title.trim();
  if (folderId !== undefined) {
    const target = folderId && folderId !== 'root' ? await Folder.findById(folderId) : null;
    if (folderId && folderId !== 'root' && !target) return bad(res, 404, 'Folder not found');
    if (String(target?._id || null) !== String(v.folder || null)) {
      const dir = target ? target.path : '';
      const ext = path.extname(v.filename);
      const stem = path.basename(v.filename, ext);
      let rel = posix.join(dir, v.filename);
      for (let n = 1; await exists(absPath(rel)); n++) rel = posix.join(dir, `${stem} (${n})${ext}`);
      await fsp.mkdir(path.dirname(absPath(rel)), { recursive: true });
      await fsp.rename(absPath(v.relPath), absPath(rel));
      v.relPath = rel; v.filename = posix.basename(rel); v.folder = target?._id || null;
    }
  }
  await v.save();
  invalidate();
  res.json(v);
}));

r.delete('/videos/:id', ah(async (req, res) => {
  const v = await Video.findById(req.params.id);
  if (!v) return bad(res, 404, 'Video not found');
  await fsp.rm(absPath(v.relPath), { force: true });
  await removeThumbs(v._id);
  await v.deleteOne();
  invalidate();
  res.json({ ok: true });
}));

// ---------- PIN for private folders ----------
const pinLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Try again in 15 minutes.' } });

r.get('/private-pin', ah(async (req, res) => {
  res.json({ pinSet: await pinIsSet() });
}));

// set or change the PIN (changing needs the current one). Every browser is locked again afterwards.
r.put('/private-pin', pinLimit, ah(async (req, res) => {
  const { pin, current } = req.body || {};
  if (!/^[0-9A-Za-z]{4,32}$/.test(String(pin || ''))) return bad(res, 400, 'PIN must be 4 to 32 letters or digits');
  if (await pinIsSet() && !(await verifyPin(current))) return bad(res, 403, 'Current PIN is wrong');
  await setPin(pin);
  clearUnlock(res);
  res.json({ pinSet: true });
}));

r.post('/private-pin/remove', pinLimit, ah(async (req, res) => {
  if (await pinIsSet() && !(await verifyPin(req.body?.current))) return bad(res, 403, 'Current PIN is wrong');
  await removePin();
  clearUnlock(res);
  res.json({ pinSet: await pinIsSet() });   // stays true if PRIVATE_PIN is still set in .env
}));

// ---------- sharing ----------
const shareJson = (v) => ({
  shared: !!v.shareToken,
  token: v.shareToken || null,
  expiresAt: v.shareExpires || null,
  views: v.shareViews || 0,
  sharedAt: v.sharedAt || null,
});

r.get('/videos/:id/share', ah(async (req, res) => {
  const v = await Video.findById(req.params.id).select('shareToken shareExpires shareViews sharedAt');
  if (!v) return bad(res, 404, 'Video not found');
  res.json(shareJson(v));
}));

// create a link (or change expiry / make a new link). expires: never | 1d | 7d | 30d
r.post('/videos/:id/share', ah(async (req, res) => {
  const v = await Video.findById(req.params.id);
  if (!v) return bad(res, 404, 'Video not found');
  const { expires, regenerate } = req.body || {};
  if (!v.shareToken || regenerate) {
    v.shareToken = crypto.randomBytes(24).toString('base64url');   // 192-bit, unguessable
    v.sharedAt = new Date();
    v.shareViews = 0;
  }
  if (expires !== undefined) {
    const days = { '1d': 1, '7d': 7, '30d': 30 }[expires];
    v.shareExpires = days ? new Date(Date.now() + days * 86400000) : undefined;
  }
  await v.save();
  res.json(shareJson(v));
}));

r.delete('/videos/:id/share', ah(async (req, res) => {
  const v = await Video.findById(req.params.id);
  if (!v) return bad(res, 404, 'Video not found');
  v.shareToken = undefined; v.shareExpires = undefined; v.sharedAt = undefined; v.shareViews = 0;
  await v.save();
  res.json({ shared: false });
}));

r.get('/shares', ah(async (req, res) => {
  res.json(await Video.find({ shareToken: { $exists: true } }).sort('-sharedAt').select('title shareToken shareExpires shareViews sharedAt').lean());
}));

// ---------- scan: import files you copied to MEDIA_ROOT by scp/rsync ----------
r.post('/scan', ah(async (req, res) => {
  const stats = { newFolders: 0, newVideos: 0, removed: 0 };
  async function walk(rel, folderDoc) {
    const entries = await fsp.readdir(absPath(rel), { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        let f = await Folder.findOne({ path: childRel });
        if (!f) {
          f = await Folder.create({ name: e.name, dirName: e.name, parent: folderDoc?._id || null, path: childRel });
          stats.newFolders++;
        }
        await walk(childRel, f);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (!VIDEO_EXT[ext]) continue;
        const known = await Video.findOne({ relPath: childRel }).select('hasThumb');
        if (known) { if (!known.hasThumb) queueProcess(known._id); continue; }   // retry missing thumbnails
        const st = await fsp.stat(absPath(childRel));
        const v = await Video.create({
          title: path.basename(e.name, ext), folder: folderDoc?._id || null, relPath: childRel,
          filename: e.name, size: st.size, mimeType: VIDEO_EXT[ext],
        });
        queueProcess(v._id);
        stats.newVideos++;
      }
    }
  }
  await walk('', null);
  for (const v of await Video.find().select('relPath')) {
    if (!fs.existsSync(absPath(v.relPath))) { await removeThumbs(v._id); await v.deleteOne(); stats.removed++; }
  }
  for (const f of await Folder.find().select('path')) {
    if (!fs.existsSync(absPath(f.path))) await f.deleteOne();
  }
  invalidate();
  res.json(stats);
}));

export default r;
