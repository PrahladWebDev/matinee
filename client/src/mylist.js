import { useSyncExternalStore } from 'react';

// "My List" lives in this browser (localStorage), like "Continue watching".
const KEY = 'mt_list';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
let cache = read();
const subs = new Set();
const emit = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = read(); emit(); } });
}

export const inList = (id) => cache.some((v) => v._id === id);

export function toggleList(v) {
  cache = inList(v._id)
    ? cache.filter((x) => x._id !== v._id)
    : [{ _id: v._id, title: v.title, duration: v.duration || 0, hasThumb: !!v.hasThumb, priv: !!v.priv }, ...cache].slice(0, 200);
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  emit();
}

export const useMyList = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cache);
