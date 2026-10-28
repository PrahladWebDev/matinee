import fsp from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { absPath, exists } from './media.js';
import { L2 } from './audio.js';

const run = promisify(execFile);

// Subtitles come from two places:
//   internal  - text subtitle streams inside the video file (mkv / mp4). Cut out once with ffmpeg
//               into .subs/<id>-<n>.vtt, then served from disk.
//   external  - files sitting next to the video: "Movie.srt", "Movie.en.srt", "Movie.hi.vtt" ...
//               (also inside a Subs/ or Subtitles/ folder next to it). Read straight from disk.
// Picture-based subtitles (PGS / DVD) cannot be shown as text, so they are left out.

export const subsDir = () => path.join(config.mediaRoot, '.subs');
const subPath = (id, n) => path.join(subsDir(), `${id}-${n}.vtt`);

const TEXT_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text']);
const EXT = new Set(['.srt', '.vtt', '.ass', '.ssa']);
const MAX_SUB_BYTES = 5 * 1024 * 1024;
const norm = (c) => { c = String(c || '').toLowerCase(); return c && c !== 'und' ? (L2[c] || c) : ''; };

// ---------- internal streams ----------
const probeCache = new Map();   // id -> { at, list }

async function listInternal(id, relPath) {
  const hit = probeCache.get(String(id));
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list;
  let list = [];
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 's',
      '-show_entries', 'stream=index,codec_name:stream_tags=language,title:stream_disposition=default,forced',
      '-of', 'json', absPath(relPath),
    ], { timeout: 30000 });
    list = (JSON.parse(stdout).streams || [])
      .map((s, n) => ({   // n = position among the subtitle streams, which is what ffmpeg's 0:s:n expects
        key: 'i' + n,
        kind: 'internal',
        codec: s.codec_name || '',
        lang: norm(s.tags?.language),
        title: s.tags?.title || '',
        default: !!s.disposition?.default,
        forced: !!s.disposition?.forced,
      }))
      .filter((s) => TEXT_CODECS.has(s.codec));
  } catch { /* ffprobe missing or unreadable file: no embedded subtitles */ }
  probeCache.set(String(id), { at: Date.now(), list });
  return list;
}

// ---------- external files ----------
async function listExternal(relPath) {
  const dir = path.dirname(absPath(relPath));
  const base = path.basename(relPath, path.extname(relPath)).toLowerCase();
  const found = [];
  for (const d of [dir, path.join(dir, 'Subs'), path.join(dir, 'subs'), path.join(dir, 'Subtitles'), path.join(dir, 'subtitles')]) {
    let names = [];
    try { names = await fsp.readdir(d); } catch { continue; }
    for (const f of names) {
      const ext = path.extname(f).toLowerCase();
      if (!EXT.has(ext)) continue;
      const name = path.basename(f, ext).toLowerCase();
      if (name !== base && !name.startsWith(base + '.')) continue;
      found.push({ file: path.join(d, f), tag: name.slice(base.length + 1), format: ext.slice(1) });
    }
  }
  found.sort((a, b) => a.file.localeCompare(b.file));
  return found.map((f, i) => {
    // "en", "en.forced", "hi.sdh", "english" ... first 2-3 letter token is the language, the rest is a label
    const tokens = f.tag.split(/[._\s-]+/).filter(Boolean);
    const li = tokens.findIndex((t) => /^[a-z]{2,3}$/.test(t) && (t.length === 2 || L2[t]));
    const lang = li >= 0 ? norm(tokens[li]) : '';
    const title = tokens.filter((_, j) => j !== li).join(' ');
    return { key: 'x' + i, kind: 'external', lang, title, format: f.format, file: f.file, default: false, forced: /forced/.test(f.tag) };
  });
}

export async function listSubs(id, relPath) {
  const [a, b] = await Promise.all([listInternal(id, relPath), listExternal(relPath)]);
  return [...a, ...b].map(({ file, ...pub }) => pub);   // never expose server paths
}

// text of an external file: BOM / UTF-16 aware, falls back to Windows-1252 when it is not valid UTF-8
function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  if (buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1))); return b.swap16().toString('utf16le'); }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

// ---------- extraction of internal streams ----------
let queue = Promise.resolve();   // one ffmpeg at a time
const jobs = new Map();          // key -> 'working' | 'error'

async function internalState(id, n, relPath) {
  const out = subPath(id, n);
  if (await exists(out)) return 'ready';
  const key = `${id}-${n}`;
  const j = jobs.get(key);
  if (j === 'working') return 'working';
  if (j === 'error') { jobs.delete(key); return 'error'; }   // reported once, the next request retries
  jobs.set(key, 'working');
  queue = queue.then(async () => {
    await fsp.mkdir(subsDir(), { recursive: true });
    const tmp = out + '.part';
    try {
      await run('ffmpeg', ['-y', '-i', absPath(relPath), '-map', `0:s:${n}`, '-vn', '-an', '-dn', '-c:s', 'webvtt', '-f', 'webvtt', tmp],
        { timeout: 30 * 60 * 1000, maxBuffer: 1 << 24 });
      await fsp.rename(tmp, out);
      jobs.delete(key);
    } catch (e) {
      console.warn('subtitle extract failed:', String(e.message).split('\n')[0]);
      await fsp.rm(tmp, { force: true });
      jobs.set(key, 'error');
    }
  });
  return 'working';
}

// One subtitle track: { state: 'ready', format, text } | { state: 'working' } | { state: 'error' } | null (no such track)
export async function getSub(id, relPath, key) {
  const m = /^([ix])(\d{1,3})$/.exec(String(key));
  if (!m) return null;
  const i = parseInt(m[2], 10);
  if (m[1] === 'x') {
    const f = (await listExternal(relPath))[i];
    if (!f) return null;
    try {
      const st = await fsp.stat(f.file);
      if (st.size > MAX_SUB_BYTES) return { state: 'error' };
      return { state: 'ready', format: f.format, text: decode(await fsp.readFile(f.file)) };
    } catch { return { state: 'error' }; }
  }
  if (!(await listInternal(id, relPath)).some((s) => s.key === key)) return null;
  const state = await internalState(id, i, relPath);
  if (state !== 'ready') return { state };
  try { return { state, format: 'vtt', text: await fsp.readFile(subPath(id, i), 'utf8') }; } catch { return { state: 'error' }; }
}
