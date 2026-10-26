import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { fmt } from '../progress';

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

/* ---------------- folders ---------------- */
function Folders({ folders, reload }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('root');
  const [msg, setMsg] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await api.createFolder(name, parent === 'root' ? null : parent); setName(''); setMsg(''); reload(); }
    catch (e) { setMsg(e.message); }
  };
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
        <button className="btn accent">Create folder</button>
      </form>
      {msg && <div className="error">{msg}</div>}
      <ul className="tree">
        {folders.map((f) => (
          <li key={f._id} style={{ paddingLeft: (f.path.split('/').length - 1) * 22 }}>
            <span>{f.name}</span>
            <span className="grow" />
            <button className="link" onClick={() => rename(f)}>Rename</button>
            <button className="link danger" onClick={() => del(f)}>Delete</button>
          </li>
        ))}
        {!folders.length && <li className="muted">No folders yet.</li>}
      </ul>
    </section>
  );
}

/* ---------------- manage videos ---------------- */
function Manager({ folders }) {
  const [fid, setFid] = useState('root');
  const [data, setData] = useState(null);
  const load = () => api.folder(fid).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, [fid]); // eslint-disable-line

  const rename = async (v) => {
    const t = prompt('New name', v.title);
    if (t && t.trim()) { await api.updateVideo(v._id, { title: t }); load(); }
  };
  const move = async (v, to) => { await api.updateVideo(v._id, { folderId: to }); load(); };
  const del = async (v) => {
    if (!confirm(`Delete “${v.title}”? The file is removed from the server.`)) return;
    await api.deleteVideo(v._id); load();
  };

  return (
    <section className="panel">
      <h2>Manage videos</h2>
      <div className="form-row"><label>Folder <FolderSelect folders={folders} value={fid} onChange={setFid} /></label></div>
      <ul className="tree">
        {data?.videos.map((v) => (
          <li key={v._id}>
            <span className="grow-text">{v.title}</span>
            <small className="muted">{v.duration ? fmt(v.duration) : ''} {sizeOf(v.size)}</small>
            <button className="link" onClick={() => rename(v)}>Rename</button>
            <select aria-label="Move to" value="" onChange={(e) => e.target.value && move(v, e.target.value)}>
              <option value="">Move to…</option>
              <option value="root">Library root</option>
              {folders.map((f) => <option key={f._id} value={f._id}>{f.path.split('/').join(' › ')}</option>)}
            </select>
            <button className="link danger" onClick={() => del(v)}>Delete</button>
          </li>
        ))}
        {data && !data.videos.length && <li className="muted">No videos directly in this folder.</li>}
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
      <Manager folders={folders} />
      <Scan reload={reload} />
    </div>
  );
}
