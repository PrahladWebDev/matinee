// "Continue watching" + resume positions live in the browser (localStorage)
const KEY = 'mt_progress';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export const getProgress = (id) => read()[id] || null;

export function saveProgress(id, data) {
  const all = read();
  all[id] = { ...all[id], ...data, id, ts: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > 100) keys.sort((a, b) => all[a].ts - all[b].ts).slice(0, keys.length - 100).forEach((k) => delete all[k]);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
}

export function clearProgress(id) {
  const all = read();
  delete all[id];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
}

export const continueList = () =>
  Object.values(read())
    .filter((p) => p.t > 5 && p.d && p.t < p.d * 0.95)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 20);

export function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
