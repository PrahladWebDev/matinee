import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import { fmt } from '../progress';
import ShareDialog, { copyText, shareUrl } from '../components/ShareDialog';

const VID = /\.(mp4|m4v|webm|mkv|mov)$/i;
const nat = new Intl.Collator(undefined, { numeric: true });
const sizeOf = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');

function FolderSelect({ folders, value, onChange, rootLabel = 'Library root' }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="root">{rootLabel}</option>
      {folders.map((f) => <option key={f._id} value={f._id}>{f.path.split('/').join(' › ')}</option>)}
    </select>
  );
}

/* ---------------- upload ---------------- */
function Uploader({ folders, reload }) {
  const [target, setTarget] = useState('root');
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const abortRef = useRef(null);
  const stopRef = useRef(false);

  const patch = (id, p) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const add = (fileList) => {
    const items = [...fileList].filter((f) => VID.test(f.name)).map((f) => {
      const rel = f.webkitRelativePath || '';
      const parts = rel.split('/');
      return {
        id: crypto.randomUUID(), file: f, status: 'queued', progress: 0,
        title: f.name.replace(/\.[^.]+$/, ''),
        folderPath: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
      };
    });
    items.sort((a, b) => nat.compare(a.folderPath + '/' + a.title, b.folderPath + '/' + b.title));
    setQueue((q) => [...q, ...items]);
  };

  const run = async () => {
    setBusy(true); stopRef.current = false;
    const cache = new Map();
    for (const it of queueRef.current.filter((i) => i.status !== 'done')) {
      if (stopRef.current) break;
      patch(it.id, { status: 'uploading', progress: 0, error: null });
      try {
        let folderId = target;
        if (it.folderPath) {
          const key = target + '|' + it.folderPath;
          if (!cache.has(key)) cache.set(key, (await api.ensurePath(it.folderPath, target === 'root' ? null : target))._id);
          folderId = cache.get(key);
        }
        const up = api.upload(it.file, { folderId, title: it.title }, (p) => patch(it.id, { progress: p }));
        abortRef.current = up.abort;
        await up.promise;
        patch(it.id, { status: 'done', progress: 1 });
      } catch (e) {
        patch(it.id, { status: 'error', error: e.message });
        if (e.message === 'Cancelled') break;
      }
    }
    setBusy(false);
    reload();
  };

  const stop = () => { stopRef.current = true; abortRef.current?.(); };
  const pending = queue.filter((i) => i.status !== 'done').length;

  return (
    <section className="panel">
      <h2>Upload videos</h2>
      <p className="muted">Pick a destination, add files (or a whole folder — its sub-folders are recreated here), edit the names, and upload. For very large files, copy them to the server and use “Scan library” below instead.</p>
      <div className="form-row">
        <label>Upload into <FolderSelect folders={folders} value={target} onChange={setTarget} /></label>
        <label className="btn file">Add files
          <input type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
        <label className="btn file">Add a whole folder
          <input type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        Drop video files here
      </div>

      {queue.length > 0 && (
        <>
          <div className="queue">
            {queue.map((i) => (
              <div key={i.id} className={`q-item ${i.status}`}>
                <div className="q-main">
                  <input value={i.title} disabled={i.status === 'uploading' || i.status === 'done'} onChange={(e) => patch(i.id, { title: e.target.value })} aria-label="Video name" />
                  <small>{i.folderPath && <>{i.folderPath} · </>}{sizeOf(i.file.size)}</small>
                </div>
                <div className="q-bar"><b style={{ width: i.progress * 100 + '%' }} /></div>
                <span className="q-status">
                  {i.status === 'queued' && 'Waiting'}
                  {i.status === 'uploading' && Math.round(i.progress * 100) + '%'}
                  {i.status === 'done' && 'Done'}
                  {i.status === 'error' && <span className="error-text" title={i.error}>Failed</span>}
                </span>
                <button className="x" disabled={i.status === 'uploading'} onClick={() => setQueue((q) => q.filter((x) => x.id !== i.id))} aria-label="Remove">×</button>
              </div>
            ))}
          </div>
          <div className="form-row">
            {!busy ? <button className="btn accent" disabled={!pending} onClick={run}>Upload {pending} {pending === 1 ? 'video' : 'videos'}</button>
              : <button className="btn" onClick={stop}>Stop</button>}
            <button className="btn" disabled={busy} onClick={() => setQueue((q) => q.filter((i) => i.status !== 'done'))}>Clear finished</button>
          </div>
        </>
      )}
    </section>
  );
}

function PrivBadge({ priv, inherited }) {
  if (!priv && !inherited) return <span className="badge pub">Public</span>;
  return <span className="badge priv" title={inherited ? 'Private because a parent folder is private' : 'Private folder'}><Icon name="lock" size={11} /> {inherited ? 'Private (inherited)' : 'Private'}</span>;
}

/* ---------------- folders ---------------- */
function Folders({ folders, reload }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('root');
  const [vis, setVis] = useState('public');
  const [msg, setMsg] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await api.createFolder(name, parent === 'root' ? null : parent, vis === 'private'); setName(''); setMsg(''); reload(); }
    catch (e) { setMsg(e.message); }
  };
  const togglePrivate = async (f) => { await api.setFolderPrivate(f._id, !f.isPrivate); reload(); };
  const rename = async (f) => {
    const n = prompt('New name', f.name);
    if (n && n.trim()) { await api.renameFolder(f._id, n); reload(); }
  };
  const del = async (f) => {
    if (!confirm(`Delete “${f.name}” and every video inside it? The files are removed from the server too.`)) return;
    await api.deleteFolder(f._id); reload();
  };

  return (
    <section className="panel">
      <h2>Folders</h2>
      <form className="form-row" onSubmit={add}>
        <input placeholder="New folder name (e.g. Friends, Season 1)" value={name} onChange={(e) => setName(e.target.value)} />
        <label>inside <FolderSelect folders={folders} value={parent} onChange={setParent} /></label>
        <label>visibility
          <select value={vis} onChange={(e) => setVis(e.target.value)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <button className="btn accent">Create folder</button>
      </form>
      <p className="muted small">Private folders (and everything inside them) are kept off the Home page, search and random shuffle. Their videos play only when you open the folder directly.</p>
      {msg && <div className="error">{msg}</div>}
      <ul className="tree">
        {folders.map((f) => (
          <li key={f._id} style={{ paddingLeft: (f.path.split('/').length - 1) * 22 }}>
            <span>{f.name}</span>
            <PrivBadge priv={f.isPrivate} />
            <span className="grow" />
            <button className="link" onClick={() => togglePrivate(f)}>{f.isPrivate ? 'Make public' : 'Make private'}</button>
            <button className="link" onClick={() => rename(f)}>Rename</button>
            <button className="link danger" onClick={() => del(f)}>Delete</button>
          </li>
        ))}
        {!folders.length && <li className="muted">No folders yet.</li>}
      </ul>
    </section>
  );
}

/* ---------------- library: every folder, its sub-folders and videos ---------------- */
function Library({ folders, reload }) {
  const [videos, setVideos] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [share, setShare] = useState(null);
  const load = () => api.library().then((d) => setVideos(d.videos)).catch(() => setVideos([]));
  useEffect(() => { load(); }, [folders.length]); // eslint-disable-line

  const kids = {}; const vids = {};
  folders.forEach((f) => { (kids[f.parent || 'root'] ||= []).push(f); });
  (videos || []).forEach((v) => { (vids[v.folder || 'root'] ||= []).push(v); });
  Object.values(kids).forEach((l) => l.sort((a, b) => nat.compare(a.name, b.name)));
  Object.values(vids).forEach((l) => l.sort((a, b) => nat.compare(a.title, b.title)));
  const total = (id) => (vids[id]?.length || 0) + (kids[id] || []).reduce((n, f) => n + total(f._id), 0);

  const toggle = (id) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => setOpen(new Set(folders.map((f) => f._id).concat('root')));
  const collapseAll = () => setOpen(new Set());

  const both = () => { load(); reload(); };
  const renameV = async (v) => { const t = prompt('New name', v.title); if (t && t.trim()) { await api.updateVideo(v._id, { title: t }); load(); } };
  const moveV = async (v, to) => { await api.updateVideo(v._id, { folderId: to }); load(); };
  const delV = async (v) => { if (!confirm(`Delete “${v.title}”? The file is removed from the server.`)) return; await api.deleteVideo(v._id); both(); };
  const renameF = async (f) => { const n = prompt('New name', f.name); if (n && n.trim()) { await api.renameFolder(f._id, n); reload(); } };
  const delF = async (f) => { if (!confirm(`Delete “${f.name}” and every video inside it? The files are removed from the server too.`)) return; await api.deleteFolder(f._id); both(); };
  const privF = async (f) => { await api.setFolderPrivate(f._id, !f.isPrivate); reload(); };

  const videoRow = (v) => (
    <li key={v._id} className="lib-video">
      <span className="grow-text">{v.title}</span>
      <small className="muted">{v.duration ? fmt(v.duration) : ''} {sizeOf(v.size)}</small>
      <Link className="link" to={`/watch/${v._id}`}>Play</Link>
      <button className="link" onClick={() => renameV(v)}>Rename</button>
      <button className="link" onClick={() => setShare(v)}>Share</button>
      <select aria-label="Move to" value="" onChange={(e) => e.target.value && moveV(v, e.target.value)}>
        <option value="">Move to…</option>
        <option value="root">Library root</option>
        {folders.map((f) => <option key={f._id} value={f._id}>{f.path.split('/').join(' › ')}</option>)}
      </select>
      <button className="link danger" onClick={() => delV(v)}>Delete</button>
    </li>
  );

  const folderNode = (f, inheritedPriv) => {
    const isOpen = open.has(f._id);
    const sub = kids[f._id] || [];
    const own = vids[f._id] || [];
    const priv = f.isPrivate || inheritedPriv;
    return (
      <li key={f._id} className="lib-folder">
        <div className="lib-head">
          <button className="caret" onClick={() => toggle(f._id)} aria-label={isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen}>{isOpen ? '▾' : '▸'}</button>
          <button className="lib-name" onClick={() => toggle(f._id)}><Icon name="folder" size={16} /> <span className="grow-text">{f.name}</span></button>
          <small className="muted">{total(f._id)} {total(f._id) === 1 ? 'video' : 'videos'}</small>
          <PrivBadge priv={f.isPrivate} inherited={!f.isPrivate && inheritedPriv} />
          <span className="grow" />
          <Link className="link" to={`/folder/${f._id}`}>Open</Link>
          <button className="link" onClick={() => privF(f)}>{f.isPrivate ? 'Make public' : 'Make private'}</button>
          <button className="link" onClick={() => renameF(f)}>Rename</button>
          <button className="link danger" onClick={() => delF(f)}>Delete</button>
        </div>
        {isOpen && (
          <ul className="lib-children">
            {sub.map((c) => folderNode(c, priv))}
            {own.map(videoRow)}
            {!sub.length && !own.length && <li className="muted lib-empty">Empty folder.</li>}
          </ul>
        )}
      </li>
    );
  };

  const rootFolders = kids.root || [];
  const rootVideos = vids.root || [];
  const rootOpen = open.has('root');

  return (
    <section className="panel">
      <h2>Library</h2>
      <p className="muted small">Every folder with its sub-folders and videos. Click a folder to open it.</p>
      <div className="form-row">
        <button className="btn sm" onClick={expandAll}>Expand all</button>
        <button className="btn sm" onClick={collapseAll}>Collapse all</button>
      </div>
      {!videos && <p className="muted">Loading…</p>}
      {videos && (
        <ul className="tree lib">
          {rootFolders.map((f) => folderNode(f, false))}
          {rootVideos.length > 0 && (
            <li className="lib-folder">
              <div className="lib-head">
                <button className="caret" onClick={() => toggle('root')} aria-expanded={rootOpen}>{rootOpen ? '▾' : '▸'}</button>
                <button className="lib-name" onClick={() => toggle('root')}><Icon name="folder" size={16} /> <span className="grow-text">Loose videos (no folder)</span></button>
                <small className="muted">{rootVideos.length}</small>
                <PrivBadge priv={false} />
              </div>
              {rootOpen && <ul className="lib-children">{rootVideos.map(videoRow)}</ul>}
            </li>
          )}
          {!rootFolders.length && !rootVideos.length && <li className="muted">Nothing here yet.</li>}
        </ul>
      )}
      {share && <ShareDialog video={share} onClose={() => setShare(null)} />}
    </section>
  );
}

/* ---------------- shared links ---------------- */
function SharedLinks() {
  const [list, setList] = useState(null);
  const [copied, setCopied] = useState('');
  const load = () => api.shares().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const copy = async (v) => { await copyText(shareUrl(v.shareToken)); setCopied(v._id); setTimeout(() => setCopied(''), 1500); };
  const stop = async (v) => {
    if (!confirm(`Stop sharing “${v.title}”? The link will stop working.`)) return;
    await api.revokeShare(v._id); load();
  };
  const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never expires');
  return (
    <section className="panel">
      <h2>Shared links</h2>
      <p className="muted">Anyone with one of these links can watch that one video without logging in. Stop sharing to disable a link immediately.</p>
      <ul className="tree">
        {list?.map((v) => {
          const expired = v.shareExpires && new Date(v.shareExpires) < new Date();
          return (
            <li key={v._id}>
              <span className="grow-text">{v.title}</span>
              <small className="muted">{expired ? 'Expired' : when(v.shareExpires)} · {v.shareViews || 0} views</small>
              <button className="link" onClick={() => copy(v)}>{copied === v._id ? 'Copied ✓' : 'Copy link'}</button>
              <button className="link danger" onClick={() => stop(v)}>Stop sharing</button>
            </li>
          );
        })}
        {list && !list.length && <li className="muted">Nothing is shared right now.</li>}
      </ul>
    </section>
  );
}

/* ---------------- scan ---------------- */
function Scan({ reload }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr(''); setRes(null);
    try { setRes(await api.scan()); reload(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <section className="panel">
      <h2>Scan library</h2>
      <p className="muted">Copy big files straight to the server (<code>rsync -avP ./Friends/ user@server:/var/media/matinee/Friends/</code>), then scan. Folders become site folders, files become videos, and thumbnails are generated. Entries whose file has disappeared are removed.</p>
      <button className="btn accent" onClick={go} disabled={busy}>{busy ? 'Scanning…' : 'Scan now'}</button>
      {res && <p className="ok">Added {res.newVideos} videos and {res.newFolders} folders. Removed {res.removed} missing.</p>}
      {err && <div className="error">{err}</div>}
    </section>
  );
}

export default function Admin() {
  const [folders, setFolders] = useState([]);
  const reload = () => api.folders().then(setFolders).catch(() => {});
  useEffect(() => { reload(); document.title = 'Admin · Matinee'; }, []);
  return (
    <div className="page admin">
      <h1>Admin</h1>
      <Uploader folders={folders} reload={reload} />
      <Folders folders={folders} reload={reload} />
      <Library folders={folders} reload={reload} />
      <SharedLinks />
      <Scan reload={reload} />
    </div>
  );
}
