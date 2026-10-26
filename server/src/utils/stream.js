import fs from 'fs';
import fsp from 'fs/promises';
import { config } from '../config.js';
import { absPath } from './media.js';

// Video streaming with HTTP Range support (instant seeking, no full download)
export async function sendVideo(req, res, v) {
  if (config.nginxAccel) {
    // nginx serves the file itself (sendfile + native Range). Node only did the access check.
    res.setHeader('X-Accel-Redirect', '/_media/' + v.relPath.split('/').map(encodeURIComponent).join('/'));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.end();
  }

  const file = absPath(v.relPath);
  let size;
  try { size = (await fsp.stat(file)).size; } catch { return res.sendStatus(404); }

  const base = { 'Content-Type': v.mimeType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { ...base, 'Content-Length': size });
    return fs.createReadStream(file, { highWaterMark: 1 << 20 }).pipe(res);
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  else { start = parseInt(m[1], 10); end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1; }
  if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  const stream = fs.createReadStream(file, { start, end, highWaterMark: 1 << 20 });
  stream.pipe(res);
  res.on('close', () => stream.destroy());
}
