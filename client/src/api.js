async function call(method, path, data) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (data !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }
  const r = await fetch('/api' + path, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch {}
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export const api = {
  me: () => call('GET', '/auth/me'),
  login: (username, password) => call('POST', '/auth/login', { username, password }),
  logout: () => call('POST', '/auth/logout', {}),

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
  createFolder: (name, parent) => call('POST', '/admin/folders', { name, parent }),
  ensurePath: (path, parent) => call('POST', '/admin/folders/ensure', { path, parent }),
  renameFolder: (id, name) => call('PATCH', '/admin/folders/' + id, { name }),
  deleteFolder: (id) => call('DELETE', '/admin/folders/' + id),
  updateVideo: (id, data) => call('PATCH', '/admin/videos/' + id, data),
  deleteVideo: (id) => call('DELETE', '/admin/videos/' + id),
  scan: () => call('POST', '/admin/scan', {}),

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
