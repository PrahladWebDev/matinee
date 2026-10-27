import { Folder } from '../models/Folder.js';
import { esc } from './media.js';
import { onInvalidate } from '../cache.js';

// A folder marked private hides itself AND everything inside it (sub-folders inherit).

// relative paths of every folder marked private
let memo = null; let memoAt = 0;
export async function privatePaths() {
  if (memo && Date.now() - memoAt < 3000) return memo;   // thumbnails call this a lot; a few seconds is plenty fresh
  memo = (await Folder.find({ isPrivate: true }).select('path').lean()).map((f) => f.path);
  memoAt = Date.now();
  return memo;
}
onInvalidate(() => { memo = null; });

// is this folder path / video relPath inside (or equal to) a private folder?
export const isPrivatePath = (paths, p) => paths.some((x) => p === x || p.startsWith(x + '/'));

// Mongo filter: only videos that are NOT inside a private folder
export function visible(paths) {
  if (!paths.length) return {};
  return { relPath: { $not: new RegExp('^(?:' + paths.map(esc).join('|') + ')/') } };
}

export const all = (...qs) => ({ $and: qs });
