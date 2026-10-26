import { Folder } from '../models/Folder.js';
import { esc } from './media.js';

// A folder marked private hides itself AND everything inside it (sub-folders inherit).

// relative paths of every folder marked private
export async function privatePaths() {
  return (await Folder.find({ isPrivate: true }).select('path').lean()).map((f) => f.path);
}

// is this folder path / video relPath inside (or equal to) a private folder?
export const isPrivatePath = (paths, p) => paths.some((x) => p === x || p.startsWith(x + '/'));

// Mongo filter: only videos that are NOT inside a private folder
export function visible(paths) {
  if (!paths.length) return {};
  return { relPath: { $not: new RegExp('^(?:' + paths.map(esc).join('|') + ')/') } };
}

export const all = (...qs) => ({ $and: qs });
