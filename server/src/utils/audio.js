import fsp from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { absPath, exists } from './media.js';

const run = promisify(execFile);

// ISO 639-2 (3 letter, what video files use) -> 639-1 (what the browser can turn into "Hindi")
export const L2 = {
  eng: 'en', hin: 'hi', tam: 'ta', tel: 'te', mal: 'ml', kan: 'kn', ben: 'bn', mar: 'mr', guj: 'gu', pan: 'pa', urd: 'ur', nep: 'ne',
  jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', cmn: 'zh', yue: 'zh', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it',
  por: 'pt', rus: 'ru', ara: 'ar', tha: 'th', ind: 'id', msa: 'ms', may: 'ms', tur: 'tr', dut: 'nl', nld: 'nl', pol: 'pl', swe: 'sv',
  nor: 'no', dan: 'da', fin: 'fi', gre: 'el', ell: 'el', heb: 'he', per: 'fa', fas: 'fa', vie: 'vi', ukr: 'uk', cze: 'cs', ces: 'cs',
  hun: 'hu', rum: 'ro', ron: 'ro', fil: 'fil', tgl: 'tl',
};

export const audioDir = () => path.join(config.mediaRoot, '.audio');
export const audioPath = (id, n) => path.join(audioDir(), `${id}-${n}.m4a`);

const trackCache = new Map();   // id -> { at, tracks }

export async function listTracks(id, relPath) {
  const hit = trackCache.get(String(id));
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.tracks;
  let tracks = [];
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'a',
      '-show_entries', 'stream=index,codec_name,channels:stream_tags=language,title:stream_disposition=default',
      '-of', 'json', absPath(relPath),
    ], { timeout: 30000 });
    tracks = (JSON.parse(stdout).streams || []).map((s, n) => {
      const code = String(s.tags?.language || '').toLowerCase();
      return {
        n,
        lang: code && code !== 'und' ? (L2[code] || code) : '',
        title: s.tags?.title || '',
        codec: s.codec_name || '',
        channels: s.channels || 2,
        default: !!s.disposition?.default,
      };
    });
  } catch { /* ffprobe missing or unreadable file: no audio picker */ }
  trackCache.set(String(id), { at: Date.now(), tracks });
  return tracks;
}

// Extract one audio track to a small .m4a next to the thumbnails (done once, then served from disk).
// One job at a time so a click never launches several ffmpeg processes.
let queue = Promise.resolve();
const jobs = new Map();   // key -> 'working' | 'error'

export async function audioState(id, n, relPath, codec) {
  const out = audioPath(id, n);
  if (await exists(out)) return 'ready';
  const key = `${id}-${n}`;
  if (jobs.get(key) === 'working') return 'working';
  jobs.set(key, 'working');
  queue = queue.then(async () => {
    await fsp.mkdir(audioDir(), { recursive: true });
    const tmp = out + '.part.m4a';
    const codecArgs = codec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'];
    try {
      await run('ffmpeg', ['-y', '-i', absPath(relPath), '-map', `0:a:${n}`, '-vn', '-sn', '-dn', ...codecArgs, '-movflags', '+faststart', tmp],
        { timeout: 60 * 60 * 1000, maxBuffer: 1 << 24 });
      await fsp.rename(tmp, out);
      jobs.delete(key);
    } catch (e) {
      console.warn('audio extract failed:', String(e.message).split('\n')[0]);
      await fsp.rm(tmp, { force: true });
      jobs.set(key, 'error');
    }
  });
  return 'working';
}

export const audioFailed = (id, n) => jobs.get(`${id}-${n}`) === 'error';
export const clearAudioError = (id, n) => { if (jobs.get(`${id}-${n}`) === 'error') jobs.delete(`${id}-${n}`); };
