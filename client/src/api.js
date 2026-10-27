async function call(method, path, data) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (data !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }
  const r = await fetch('/api' + path, opts);
  if (!r.ok) {
    let msg = r.statusText, locked = false;
    try { const j = await r.json(); msg = j.error || msg; locked = !!j.locked; } catch {}
    const e = new Error(msg);
    e.status = r.status;
    e.locked = r.status === 403 && locked;   // private folder that needs its PIN
    throw e;
  }
  return r.json();
}

export const api = {
  me: () => call('GET', '/auth/me'),
  login: (username, password) => call('POST', '/auth/login', { username, password }),
  logout: () => call('POST', '/auth/logout', {}),

  privateStatus: () => call('GET', '/private/status'),
  unlockPrivate: (pin) => call('POST', '/private/unlock', { pin }),
  lockPrivate: () => call('POST', '/private/lock', {}),
  pinInfo: () => call('GET', '/admin/private-pin'),
  setPin: (pin, current) => call('PUT', '/admin/private-pin', { pin, current }),
  removePin: (current) => call('POST', '/admin/private-pin/remove', { current }),

  audioTracks: (id) => call('GET', `/audio/${id}/tracks`),
  audioStatus: (id, n) => call('GET', `/audio/${id}/${n}/status`),

  home: () => call('GET', '/home'),
  folder: (id) => call('GET', '/folders/' + (id || 'root')),
  watch: (id) => call('GET', '/videos/' + id),
  search: (q) => call('GET', '/search?q=' + encodeURIComponent(q)),
  random: (folder, exclude) => {
    const p = new URLSearchParams();
    if (folder) p.set('folder', folder);
    if (exclude) p.set('exclude', exclude);
    return call('GET', '/random?' + p);
  },

  folders: () => call('GET', '/admin/folders'),
  library: () => call('GET', '/admin/library'),
  createFolder: (name, parent, isPrivate = false) => call('POST', '/admin/folders', { name, parent, isPrivate }),
  setFolderPrivate: (id, isPrivate, pin) => call('PATCH', '/admin/folders/' + id, { isPrivate, ...(pin ? { pin } : {}) }),
  ensurePath: (path, parent) => call('POST', '/admin/folders/ensure', { path, parent }),
  renameFolder: (id, name) => call('PATCH', '/admin/folders/' + id, { name }),
  deleteFolder: (id) => call('DELETE', '/admin/folders/' + id),
  updateVideo: (id, data) => call('PATCH', '/admin/videos/' + id, data),
  deleteVideo: (id) => call('DELETE', '/admin/videos/' + id),
  scan: () => call('POST', '/admin/scan', {}),

  // sharing (getShare/createShare/revokeShare/shares need login; shareInfo is public)
  getShare: (id) => call('GET', `/admin/videos/${id}/share`),
  createShare: (id, body) => call('POST', `/admin/videos/${id}/share`, body || {}),
  revokeShare: (id) => call('DELETE', `/admin/videos/${id}/share`),
  shares: () => call('GET', '/admin/shares'),
  shareInfo: (token) => call('GET', '/share/' + token),

  // returns { promise, abort } so the UI can show progress and cancel
  upload(file, { folderId, title }, onProgress) {
    const xhr = new XMLHttpRequest();
    const promise = new Promise((resolve, reject) => {
      xhr.open('POST', '/api/admin/videos');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status < 300) return resolve(JSON.parse(xhr.responseText));
        let m = 'Upload failed';
        try { m = JSON.parse(xhr.responseText).error || m; } catch {}
        reject(new Error(m));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.onabort = () => reject(new Error('Cancelled'));
      const fd = new FormData();
      fd.append('folderId', folderId || 'root');
      fd.append('title', title);
      fd.append('file', file);
      xhr.send(fd);
    });
    return { promise, abort: () => xhr.abort() };
  },
};
