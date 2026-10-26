import fsp from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { Video } from '../models/Video.js';
import { invalidate } from '../cache.js';

const run = promisify(execFile);

export const VIDEO_EXT = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
};

export const safeName = (s) =>
  String(s).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 150) || 'untitled';

export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function absPath(rel) {
  const p = path.join(config.mediaRoot, rel);
  if (p !== config.mediaRoot && !p.startsWith(config.mediaRoot + path.sep)) throw new Error('Bad path');
  return p;
}

export const thumbPath = (id) => path.join(config.mediaRoot, '.thumbs', `${id}.jpg`);
export const hdPath = (id) => path.join(config.mediaRoot, '.thumbs', `${id}-hd.jpg`);
export const removeThumbs = (id) =>
  Promise.all([fsp.rm(thumbPath(id), { force: true }), fsp.rm(hdPath(id), { force: true })]);

export async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

// duration + thumbnail via ffprobe/ffmpeg (optional - site works without them)
async function processVideo(id) {
  const v = await Video.findById(id);
  if (!v) return;
  const file = absPath(v.relPath);
  let duration = 0, hasThumb = false;
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    duration = parseFloat(stdout) || 0;
  } catch {}
  try {
    const at = Math.max(1, Math.min(duration * 0.15, 120));
    await run('ffmpeg', ['-y', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', thumbPath(id)], { timeout: 60000 });
    hasThumb = true;
  } catch {}
  v.duration = duration;
  v.hasThumb = hasThumb;
  await v.save();
  invalidate();
}

let chain = Promise.resolve();
export function queueProcess(id) {
  chain = chain.then(() => processVideo(id)).catch((e) => console.warn('thumbnail job failed:', e.message));
}

// Big 1280px frame for banners / link previews. Made on first request, then served from disk.
// Jobs run one at a time so a page load never spawns several ffmpeg processes.
let posterQueue = Promise.resolve();
const posterJobs = new Map();
export function getPoster(v) {
  const key = String(v._id);
  const out = hdPath(key);
  if (!posterJobs.has(key)) {
    const job = posterQueue.then(async () => {
      if (await exists(out)) return out;
      const at = Math.max(1, Math.min((v.duration || 0) * 0.18, 180));
      await run('ffmpeg', ['-y', '-ss', String(at), '-i', absPath(v.relPath), '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', out], { timeout: 60000 });
      return out;
    }).finally(() => posterJobs.delete(key));
    posterQueue = job.catch(() => {});
    posterJobs.set(key, job);
  }
  return posterJobs.get(key);
}
