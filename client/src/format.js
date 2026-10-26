// Display-only title cleanup: drops a trailing "(720P_HD)" tag and turns " _ " into " · ".
// The real title (shown on the watch page) is never changed.
export const cleanTitle = (t) =>
  String(t)
    .replace(/\s*[(\[]\s*\d{3,4}p[^)\]]*[)\]]\s*$/i, '')
    .replace(/\s+_\s+/g, ' · ')
    .trim() || String(t);
