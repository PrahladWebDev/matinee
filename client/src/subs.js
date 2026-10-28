// Subtitle helpers: parse SRT / WebVTT / ASS-SSA text into cues the player draws itself,
// so the same code works for subtitles inside the video, files next to it, and files picked from the device.

// bytes -> text (BOM / UTF-16 aware, Windows-1252 when the file is not valid UTF-8)
export function decodeSubs(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

const clean = (s) => s
  .replace(/\{[^}]*\}/g, '')                 // {\an8} and other override codes
  .replace(/<[^>]+>/g, '')                   // <i> <b> <font ...> <00:00:01.000> <c.cls> ...
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\\[Nn]/g, '\n')
  .replace(/[ \t]+\n/g, '\n').trim();

// 00:01:02,500 | 01:02.500 | 1:02:03.5
function time(s) {
  const m = /^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d+))?$/.exec(s.trim());
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? +('0.' + m[4]) : 0);
}

function parseCues(text) {
  const out = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const m = /^\s*(\S+)\s*-->\s*(\S+)/.exec(lines[i]);
    if (!m) continue;
    const s = time(m[1]), e = time(m[2]), t = clean(lines.slice(i + 1).join('\n'));
    if (t && Number.isFinite(s) && Number.isFinite(e)) out.push({ s, e, t });
  }
  return out;
}

function parseAss(text) {
  const out = [];
  let cols = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^format:/i.test(line) && !cols) { cols = line.slice(7).split(',').map((c) => c.trim().toLowerCase()); continue; }
    if (!/^dialogue:/i.test(line)) continue;
    const names = cols || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    const parts = line.slice(9).split(',');
    const tIdx = names.indexOf('text');
    const body = parts.slice(tIdx).join(',');
    const s = time(parts[names.indexOf('start')] || ''), e = time(parts[names.indexOf('end')] || '');
    const t = clean(body);
    if (t && Number.isFinite(s) && Number.isFinite(e)) out.push({ s, e, t });
  }
  return out;
}

export function parseSubs(text, format = '') {
  const t = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const f = String(format).toLowerCase();
  const cues = f === 'ass' || f === 'ssa' || /^\s*\[Script Info\]/i.test(t.slice(0, 400)) ? parseAss(t) : parseCues(t);
  return cues.sort((a, b) => a.s - b.s);
}

// text to show at second t (cues may overlap, so look back a little from the first cue that starts after t)
export function activeCue(cues, t) {
  let lo = 0, hi = cues.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cues[mid].s <= t) lo = mid + 1; else hi = mid; }
  const lines = [];
  for (let i = lo - 1; i >= 0 && i >= lo - 8; i--) if (t < cues[i].e) lines.unshift(cues[i].t);
  return lines.join('\n');
}

export function subLabel(s, n) {
  let name = '';
  if (s.lang) {
    try { name = new Intl.DisplayNames(['en'], { type: 'language' }).of(s.lang) || ''; } catch { /* unknown code */ }
    if (!name || name === s.lang) name = s.lang.toUpperCase();
  }
  const extra = [];
  if (s.title && s.title.toLowerCase() !== name.toLowerCase()) extra.push(s.title);
  if (s.forced && !/forced/i.test(s.title || '')) extra.push('Forced');
  if (s.kind === 'external') extra.push('File');
  if (s.kind === 'local') extra.push('From device');
  return [name || (s.kind === 'local' ? '' : `Subtitle ${n + 1}`), ...extra].filter(Boolean).join(' · ');
}
