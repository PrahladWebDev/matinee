import { Router } from 'express';
import mongoose from 'mongoose';
import { Folder } from '../models/Folder.js';
import { Video } from '../models/Video.js';
import { ah } from '../utils/ah.js';
import { esc, getPoster, thumbPath } from '../utils/media.js';
import { sendVideo } from '../utils/stream.js';
import { getSub, listSubs } from '../utils/subs.js';

// PUBLIC routes (no login). A valid, unexpired token unlocks ONE folder, every sub-folder inside it,
// and only the videos inside those. Nothing outside that folder can be reached through the token.
const r = Router();
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const isId = (id) => mongoose.isValidObjectId(id);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byTitle = (a, b) => collator.compare(a.title, b.title);
const byName = (a, b) => collator.compare(a.name, b.name);
const subtree = (folder) => ({ relPath: { $regex: '^' + esc(folder.path) + '/' } });

r.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

export async function findSharedFolder(token) {
  if (!TOKEN.test(String(token))) return null;
  const f = await Folder.findOne({ shareToken: token }).select('name path parent shareExpires').lean();
  if (!f) return null;
  if (f.shareExpires && new Date(f.shareExpires) < new Date()) return null;
  return f;
}

// first video with a thumbnail anywhere inside the shared folder (for link-preview cards)
export async function folderCover(root) {
  const v = await Video.findOne({ ...subtree(root), hasThumb: true }).select('_id').lean();
  return v?._id || null;
}

// a video is reachable only if it lives inside the shared folder
async function sharedVideo(root, id, fields) {
  if (!isId(id)) return null;
  const v = await Video.findById(id).select(fields + ' relPath').lean();
  if (!v || !v.relPath.startsWith(root.path + '/')) return null;
  return v;
}

const gone = (res) => res.status(404).json({ error: 'This link is no longer available' });
const inside = (root, p) => p === root.path || p.startsWith(root.path + '/');

// folder contents. ?f=<sub-folder id> opens a sub-folder (must be inside the shared folder)
r.get('/:token', ah(async (req, res) => {
  const root = await findSharedFolder(req.params.token);
  if (!root) return gone(res);

  let cur = root;
  const f = req.query.f;
  if (f && String(f) !== String(root._id)) {
    if (!isId(f)) return res.status(404).json({ error: 'Folder not found' });
    cur = await Folder.findById(f).select('name path parent').lean();
    if (!cur || !inside(root, cur.path)) return res.status(404).json({ error: 'Folder not found' });
  } else {
    Folder.updateOne({ _id: root._id }, { $inc: { shareViews: 1 } }).catch(() => {});   // count a visit, not every click inside
  }

  const subs = (await Folder.find({ parent: cur._id }).select('name path').lean()).sort(byName);
  const folders = await Promise.all(subs.map(async (s) => {
    const [videoCount, cover] = await Promise.all([
      Video.countDocuments(subtree(s)),
      Video.findOne({ ...subtree(s), hasThumb: true }).select('_id').lean(),
    ]);
    return { _id: s._id, name: s.name, videoCount, cover: cover?._id || null };
  }));
  const videos = (await Video.find({ folder: cur._id }).select('title duration hasThumb').lean()).sort(byTitle);

  const breadcrumbs = [];
  let c = cur;
  while (c) {
    breadcrumbs.unshift({ _id: c._id, name: c.name });
    if (String(c._id) === String(root._id)) break;
    c = c.parent ? await Folder.findById(c.parent).select('name parent').lean() : null;
  }

  res.set('Cache-Control', 'no-store').json({
    root: { _id: root._id, name: root.name },
    folder: { _id: cur._id, name: cur.name },
    expiresAt: root.shareExpires || null,
    total: await Video.countDocuments(subtree(cur)),
    breadcrumbs, folders, videos,
  });
}));

r.get('/:token/v/:vid/stream', ah(async (req, res) => {
  const root = await findSharedFolder(req.params.token);
  if (!root) return res.sendStatus(404);
  const v = await sharedVideo(root, req.params.vid, 'mimeType');
  if (!v) return res.sendStatus(404);
  await sendVideo(req, res, v);
}));

r.get('/:token/v/:vid/subs', ah(async (req, res) => {
  const root = await findSharedFolder(req.params.token);
  if (!root) return gone(res);
  const v = await sharedVideo(root, req.params.vid, '');
  if (!v) return gone(res);
  res.set('Cache-Control', 'no-store').json({ subs: await listSubs(String(v._id), v.relPath) });
}));

r.get('/:token/v/:vid/subs/:key', ah(async (req, res) => {
  const root = await findSharedFolder(req.params.token);
  if (!root) return gone(res);
  const v = await sharedVideo(root, req.params.vid, '');
  if (!v) return gone(res);
  const s = await getSub(String(v._id), v.relPath, req.params.key);
  if (!s) return res.status(404).json({ error: 'No such subtitle track' });
  res.set('Cache-Control', 'no-store').json(s);
}));

r.get('/:token/v/:vid/thumb', ah(async (req, res) => {
  const root = await findSharedFolder(req.params.token);
  if (!root) return res.sendStatus(404);
  const v = await sharedVideo(root, req.params.vid, '');
  if (!v) return res.sendStatus(404);
  res.sendFile(thumbPath(v._id), { dotfiles: 'allow', headers: { 'Cache-Control': 'public, max-age=86400' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));

r.get('/:token/v/:vid/poster', ah(async (req, res) => {
  const root = await findSharedFolder(req.params.token);
  if (!root) return res.sendStatus(404);
  const v = await sharedVideo(root, req.params.vid, 'duration');
  if (!v) return res.sendStatus(404);
  let file;
  try { file = await getPoster(v); } catch { file = thumbPath(v._id); }
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Cache-Control': 'public, max-age=86400' } },
    (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));

export default r;
