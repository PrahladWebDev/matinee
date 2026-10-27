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
    <select value={value} onChange={(e) => onChange(e.target.value)} className="select">
      <option value="root">{rootLabel}</option>
      {folders.map((f) => (
        <option key={f._id} value={f._id}>
          {f.path.split('/').join(' › ')}
        </option>
      ))}
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
    const items = [...fileList]
      .filter((f) => VID.test(f.name))
      .map((f) => {
        const rel = f.webkitRelativePath || '';
        const parts = rel.split('/');
        return {
          id: crypto.randomUUID(),
          file: f,
          status: 'queued',
          progress: 0,
          title: f.name.replace(/\.[^.]+$/, ''),
          folderPath: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
        };
      });
    items.sort((a, b) => nat.compare(a.folderPath + '/' + a.title, b.folderPath + '/' + b.title));
    setQueue((q) => [...q, ...items]);
  };

  const run = async () => {
    setBusy(true);
    stopRef.current = false;
    const cache = new Map();
    for (const it of queueRef.current.filter((i) => i.status !== 'done')) {
      if (stopRef.current) break;
      patch(it.id, { status: 'uploading', progress: 0, error: null });
      try {
        let folderId = target;
        if (it.folderPath) {
          const key = target + '|' + it.folderPath;
          if (!cache.has(key)) {
            cache.set(key, (await api.ensurePath(it.folderPath, target === 'root' ? null : target))._id);
          }
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

  const stop = () => {
    stopRef.current = true;
    abortRef.current?.();
  };
  const pending = queue.filter((i) => i.status !== 'done').length;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Upload videos</h2>
        <p className="muted">
          Choose a destination, add files or a whole folder (sub-folders are recreated automatically), edit names, then upload.
          For very large files, prefer copying them to the server and using <strong>Scan library</strong> below.
        </p>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Upload into</span>
          <FolderSelect folders={folders} value={target} onChange={setTarget} />
        </label>

        <div className="btn-group">
          <label className="btn file">
            Add files
            <input
              type="file"
              accept="video/*,.mkv"
              multiple
              hidden
              onChange={(e) => {
                add(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <label className="btn file">
            Add folder
            <input
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              hidden
              onChange={(e) => {
                add(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={20} />
        <span>Drop video files here</span>
      </div>

      {queue.length > 0 && (
        <>
          <div className="queue">
            {queue.map((i) => (
              <div key={i.id} className={`q-item ${i.status}`}>
                <div className="q-main">
                  <input
                    value={i.title}
                    disabled={i.status === 'uploading' || i.status === 'done'}
                    onChange={(e) => patch(i.id, { title: e.target.value })}
                    aria-label="Video name"
                    className="q-title"
                  />
                  <small className="muted">
                    {i.folderPath && <>{i.folderPath} · </>}
                    {sizeOf(i.file.size)}
                  </small>
                </div>
                <div className="q-bar">
                  <b style={{ width: i.progress * 100 + '%' }} />
                </div>
                <span className="q-status">
                  {i.status === 'queued' && 'Waiting'}
                  {i.status === 'uploading' && Math.round(i.progress * 100) + '%'}
                  {i.status === 'done' && 'Done'}
                  {i.status === 'error' && (
                    <span className="error-text" title={i.error}>
                      Failed
                    </span>
                  )}
                </span>
                <button
                  className="x"
                  disabled={i.status === 'uploading'}
                  onClick={() => setQueue((q) => q.filter((x) => x.id !== i.id))}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="form-actions">
            {!busy ? (
              <button className="btn accent" disabled={!pending} onClick={run}>
                Upload {pending} {pending === 1 ? 'video' : 'videos'}
              </button>
            ) : (
              <button className="btn" onClick={stop}>
                Stop
              </button>
            )}
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => setQueue((q) => q.filter((i) => i.status !== 'done'))}
            >
              Clear finished
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PrivBadge({ priv, inherited }) {
  if (!priv && !inherited) return <span className="badge pub">Public</span>;
  return (
    <span
      className="badge priv"
      title={inherited ? 'Private because a parent folder is private' : 'Private folder'}
    >
      <Icon name="lock" size={11} /> {inherited ? 'Private (inherited)' : 'Private'}
    </span>
  );
}

/* ---------------- private folder PIN ---------------- */
function PrivatePin() {
  const [set, setSet] = useState(null);
  const [cur, setCur] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api.pinInfo()
      .then((r) => setSet(r.pinSet))
      .catch(() => setSet(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    setOk('');
    if (pin !== pin2) {
      setMsg('The two PINs do not match');
      return;
    }
    try {
      await api.setPin(pin, cur);
      setSet(true);
      setCur('');
      setPin('');
      setPin2('');
      setOk('PIN saved. Private folders are locked until it is entered.');
    } catch (x) {
      setMsg(x.message);
    }
  };

  const remove = async () => {
    setMsg('');
    setOk('');
    if (!confirm('Remove the PIN? Private folders will open without asking.')) return;
    try {
      const r = await api.removePin(cur);
      setSet(r.pinSet);
      setCur('');
      setOk(r.pinSet ? 'Saved PIN removed (a PIN from the server .env file is still active).' : 'PIN removed.');
    } catch (x) {
      setMsg(x.message);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Private folder PIN</h2>
        <p className="muted">
          With a PIN set, private folders stay locked: their videos, pictures and counts are hidden until you enter the PIN.
          {set === false && ' No PIN is set yet, so private folders currently open without one.'}
        </p>
      </div>

      <form className="form-grid" onSubmit={save}>
        {set && (
          <label className="field">
            <span>Current PIN</span>
            <input
              type="password"
              autoComplete="off"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          <span>{set ? 'New PIN' : 'PIN'}</span>
          <input
            type="password"
            autoComplete="new-password"
            maxLength={32}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4–32 letters or digits"
          />
        </label>
        <label className="field">
          <span>Repeat PIN</span>
          <input
            type="password"
            autoComplete="new-password"
            maxLength={32}
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
          />
        </label>

        <div className="form-actions">
          <button className="btn accent" disabled={pin.length < 4 || (set && !cur)}>
            {set ? 'Change PIN' : 'Set PIN'}
          </button>
          {set && (
            <button type="button" className="btn ghost" disabled={!cur} onClick={remove}>
              Remove PIN
            </button>
          )}
        </div>
      </form>

      {msg && <div className="error">{msg}</div>}
      {ok && <p className="ok">{ok}</p>}
    </section>
  );
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
    try {
      await api.createFolder(name, parent === 'root' ? null : parent, vis === 'private');
      setName('');
      setMsg('');
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const togglePrivate = async (f) => {
    const makePublic = f.isPrivate;
    let pin;

    if (makePublic) {
      pin = prompt('Enter the current private-folder PIN to make this folder public:');
      if (pin === null) return;
      if (!pin) return setMsg('PIN is required to make a private folder public.');
    }

    try {
      await api.setFolderPrivate(f._id, !f.isPrivate, pin);
      setMsg('');
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const rename = async (f) => {
    const n = prompt('New name', f.name);
    if (n && n.trim()) {
      await api.renameFolder(f._id, n);
      reload();
    }
  };

  const del = async (f) => {
    if (!confirm(`Delete “${f.name}” and every video inside it? The files are removed from the server too.`)) return;
    await api.deleteFolder(f._id);
    reload();
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Folders</h2>
        <p className="muted">
          Private folders (and everything inside them) are kept off the Home page, search and random shuffle.
          Their videos play only when you open the folder directly, and with a PIN set nothing inside shows until the PIN is entered.
        </p>
      </div>

      <form className="form-grid" onSubmit={add}>
        <label className="field grow">
          <span>New folder name</span>
          <input
            placeholder="e.g. Friends, Season 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Inside</span>
          <FolderSelect folders={folders} value={parent} onChange={setParent} />
        </label>
        <label className="field">
          <span>Visibility</span>
          <select value={vis} onChange={(e) => setVis(e.target.value)} className="select">
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <div className="form-actions">
          <button className="btn accent">Create folder</button>
        </div>
      </form>

      {msg && <div className="error">{msg}</div>}

      <ul className="tree">
        {folders.map((f) => (
          <li key={f._id} style={{ paddingLeft: (f.path.split('/').length - 1) * 22 }}>
            <span className="folder-name">{f.name}</span>
            <PrivBadge priv={f.isPrivate} />
            <span className="grow" />
            <div className="row-actions">
              <button className="link" onClick={() => togglePrivate(f)}>
                {f.isPrivate ? 'Make public' : 'Make private'}
              </button>
              <button className="link" onClick={() => rename(f)}>
                Rename
              </button>
              <button className="link danger" onClick={() => del(f)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {!folders.length && <li className="muted">No folders yet.</li>}
      </ul>
    </section>
  );
}

/* ---------------- library ---------------- */
function Library({ folders, reload }) {
  const [videos, setVideos] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [share, setShare] = useState(null);

  const load = () => api.library().then((d) => setVideos(d.videos)).catch(() => setVideos([]));
  useEffect(() => {
    load();
  }, [folders.length]); // eslint-disable-line

  const kids = {};
  const vids = {};
  folders.forEach((f) => {
    (kids[f.parent || 'root'] ||= []).push(f);
  });
  (videos || []).forEach((v) => {
    (vids[v.folder || 'root'] ||= []).push(v);
  });
  Object.values(kids).forEach((l) => l.sort((a, b) => nat.compare(a.name, b.name)));
  Object.values(vids).forEach((l) => l.sort((a, b) => nat.compare(a.title, b.title)));

  const total = (id) => (vids[id]?.length || 0) + (kids[id] || []).reduce((n, f) => n + total(f._id), 0);

  const toggle = (id) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const expandAll = () => setOpen(new Set(folders.map((f) => f._id).concat('root')));
  const collapseAll = () => setOpen(new Set());

  const both = () => {
    load();
    reload();
  };
  const renameV = async (v) => {
    const t = prompt('New name', v.title);
    if (t && t.trim()) {
      await api.updateVideo(v._id, { title: t });
      load();
    }
  };
  const moveV = async (v, to) => {
    await api.updateVideo(v._id, { folderId: to });
    load();
  };
  const delV = async (v) => {
    if (!confirm(`Delete “${v.title}”? The file is removed from the server.`)) return;
    await api.deleteVideo(v._id);
    both();
  };
  const renameF = async (f) => {
    const n = prompt('New name', f.name);
    if (n && n.trim()) {
      await api.renameFolder(f._id, n);
      reload();
    }
  };
  const delF = async (f) => {
    if (!confirm(`Delete “${f.name}” and every video inside it? The files are removed from the server too.`)) return;
    await api.deleteFolder(f._id);
    both();
  };
  const privF = async (f) => {
    const makePublic = f.isPrivate;
    let pin;

    if (makePublic) {
      pin = prompt('Enter the current private-folder PIN to make this folder public:');
      if (pin === null) return;
      if (!pin) return alert('PIN is required to make a private folder public.');
    }

    try {
      await api.setFolderPrivate(f._id, !f.isPrivate, pin);
      reload();
    } catch (e) {
      alert(e.message);
    }
  };

  const videoRow = (v) => (
    <li key={v._id} className="lib-video">
      <span className="grow-text">{v.title}</span>
      <small className="muted">
        {v.duration ? fmt(v.duration) : ''} {sizeOf(v.size)}
      </small>
      <div className="row-actions">
        <Link className="link" to={`/watch/${v._id}`}>
          Play
        </Link>
        <button className="link" onClick={() => renameV(v)}>
          Rename
        </button>
        <button className="link" onClick={() => setShare(v)}>
          Share
        </button>
        <select
          aria-label="Move to"
          value=""
          onChange={(e) => e.target.value && moveV(v, e.target.value)}
          className="select sm"
        >
          <option value="">Move to…</option>
          <option value="root">Library root</option>
          {folders.map((f) => (
            <option key={f._id} value={f._id}>
              {f.path.split('/').join(' › ')}
            </option>
          ))}
        </select>
        <button className="link danger" onClick={() => delV(v)}>
          Delete
        </button>
      </div>
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
          <button
            className="caret"
            onClick={() => toggle(f._id)}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            aria-expanded={isOpen}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <button className="lib-name" onClick={() => toggle(f._id)}>
            <Icon name="folder" size={16} />
            <span className="grow-text">{f.name}</span>
          </button>
          <small className="muted">
            {total(f._id)} {total(f._id) === 1 ? 'video' : 'videos'}
          </small>
          <PrivBadge priv={f.isPrivate} inherited={!f.isPrivate && inheritedPriv} />
          <span className="grow" />
          <div className="row-actions">
            <Link className="link" to={`/folder/${f._id}`}>
              Open
            </Link>
            <button className="link" onClick={() => privF(f)}>
              {f.isPrivate ? 'Make public' : 'Make private'}
            </button>
            <button className="link" onClick={() => renameF(f)}>
              Rename
            </button>
            <button className="link danger" onClick={() => delF(f)}>
              Delete
            </button>
          </div>
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
      <div className="panel-header">
        <h2>Library</h2>
        <p className="muted">Every folder with its sub-folders and videos. Click a folder name to expand/collapse.</p>
      </div>

      <div className="form-actions top">
        <button className="btn sm" onClick={expandAll}>
          Expand all
        </button>
        <button className="btn sm" onClick={collapseAll}>
          Collapse all
        </button>
      </div>

      {!videos && <p className="muted">Loading…</p>}
      {videos && (
        <ul className="tree lib">
          {rootFolders.map((f) => folderNode(f, false))}
          {rootVideos.length > 0 && (
            <li className="lib-folder">
              <div className="lib-head">
                <button className="caret" onClick={() => toggle('root')} aria-expanded={rootOpen}>
                  {rootOpen ? '▾' : '▸'}
                </button>
                <button className="lib-name" onClick={() => toggle('root')}>
                  <Icon name="folder" size={16} />
                  <span className="grow-text">Loose videos (no folder)</span>
                </button>
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
  useEffect(() => {
    load();
  }, []);

  const copy = async (v) => {
    await copyText(shareUrl(v.shareToken));
    setCopied(v._id);
    setTimeout(() => setCopied(''), 1500);
  };

  const stop = async (v) => {
    if (!confirm(`Stop sharing “${v.title}”? The link will stop working.`)) return;
    await api.revokeShare(v._id);
    load();
  };

  const when = (d) =>
    d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never expires';

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Shared links</h2>
        <p className="muted">
          Anyone with one of these links can watch that one video without logging in. Stop sharing to disable a link immediately.
        </p>
      </div>

      <ul className="tree">
        {list?.map((v) => {
          const expired = v.shareExpires && new Date(v.shareExpires) < new Date();
          return (
            <li key={v._id}>
              <span className="grow-text">{v.title}</span>
              <small className="muted">
                {expired ? 'Expired' : when(v.shareExpires)} · {v.shareViews || 0} views
              </small>
              <div className="row-actions">
                <button className="link" onClick={() => copy(v)}>
                  {copied === v._id ? 'Copied ✓' : 'Copy link'}
                </button>
                <button className="link danger" onClick={() => stop(v)}>
                  Stop sharing
                </button>
              </div>
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
    setBusy(true);
    setErr('');
    setRes(null);
    try {
      setRes(await api.scan());
      reload();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Scan library</h2>
        <p className="muted">
          Copy big files straight to the server (
          <code>rsync -avP ./Friends/ user@server:/var/media/matinee/Friends/</code>
          ), then scan. Folders become site folders, files become videos, and thumbnails are generated. Entries whose file
          has disappeared are removed.
        </p>
      </div>

      <div className="form-actions">
        <button className="btn accent" onClick={go} disabled={busy}>
          {busy ? 'Scanning…' : 'Scan now'}
        </button>
      </div>

      {res && (
        <p className="ok">
          Added {res.newVideos} videos and {res.newFolders} folders. Removed {res.removed} missing.
        </p>
      )}
      {err && <div className="error">{err}</div>}
    </section>
  );
}

/* ==================== MAIN ADMIN ==================== */
export default function Admin() {
  const [folders, setFolders] = useState([]);
  const reload = () => api.folders().then(setFolders).catch(() => {});
  useEffect(() => {
    reload();
    document.title = 'Admin · Matinee';
  }, []);

  return (
    <div className="page admin">
      {/* Embedded CSS for this page */}
      <style>{`
        /* ===== Admin page improvements ===== */
        .page.admin {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.5rem 1.25rem 3rem;
        }

        /* Page header */
        .page-header {
          margin-bottom: 2rem;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--border, #e5e7eb);
        }
        .page-header h1 {
          margin: 0 0 0.3rem;
          font-size: 1.85rem;
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1.2;
        }
        .page-header .muted {
          margin: 0;
          font-size: 0.95rem;
          color: var(--muted, #6b7280);
        }

        /* Consistent panel headers */
        .panel {
          background: var(--panel-bg, #fff);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 12px;
          padding: 1.4rem 1.5rem;
          margin-bottom: 0;
        }
        .panel-header {
          margin-bottom: 1.25rem;
        }
        .panel-header h2 {
          margin: 0 0 0.35rem;
          font-size: 1.2rem;
          font-weight: 600;
        }
        .panel-header .muted {
          margin: 0;
          line-height: 1.5;
          font-size: 0.9rem;
        }

        /* Form layout */
        .form-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem 1.25rem;
          align-items: flex-end;
          margin-bottom: 1.25rem;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-width: 160px;
        }
        .field.grow {
          flex: 1;
          min-width: 220px;
        }
        .field span {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--muted, #6b7280);
        }
        .field input,
        .field select,
        .select {
          padding: 0.45rem 0.7rem;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 8px;
          font-size: 0.9rem;
          background: var(--input-bg, #fff);
        }
        .select.sm {
          padding: 0.3rem 0.5rem;
          font-size: 0.85rem;
        }

        .form-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-top: 0.25rem;
        }
        .form-actions.top {
          margin: 0 0 1rem;
        }

        .btn-group {
          display: flex;
          gap: 0.6rem;
          align-items: center;
        }

        /* Buttons */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          border: 1px solid var(--border, #d1d5db);
          background: var(--btn-bg, #f9fafb);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .btn:hover:not(:disabled) {
          background: var(--btn-hover, #f3f4f6);
        }
        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .btn.accent {
          background: var(--accent, #2563eb);
          color: white;
          border-color: var(--accent, #2563eb);
        }
        .btn.accent:hover:not(:disabled) {
          background: var(--accent-hover, #1d4ed8);
        }
        .btn.ghost {
          background: transparent;
        }
        .btn.sm {
          padding: 0.35rem 0.75rem;
          font-size: 0.85rem;
        }
        .btn.file {
          position: relative;
          overflow: hidden;
        }

        /* Dropzone */
        .dropzone {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          padding: 1.6rem;
          border: 2px dashed var(--border, #d1d5db);
          border-radius: 10px;
          color: var(--muted, #6b7280);
          margin-bottom: 1.25rem;
          transition: border-color 0.15s, background 0.15s;
          cursor: pointer;
        }
        .dropzone:hover {
          border-color: var(--accent, #3b82f6);
          background: color-mix(in srgb, var(--accent, #3b82f6) 5%, transparent);
        }

        /* Queue */
        .queue {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .q-item {
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 0.75rem;
          align-items: center;
          padding: 0.6rem 0.75rem;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 8px;
          background: var(--panel-bg, #fafafa);
        }
        .q-main {
          min-width: 0;
        }
        .q-title {
          width: 100%;
          font-weight: 500;
          border: 1px solid transparent;
          background: transparent;
          padding: 0.2rem 0.3rem;
          border-radius: 4px;
        }
        .q-title:focus {
          border-color: var(--accent, #3b82f6);
          background: white;
          outline: none;
        }
        .q-bar {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
          width: 80px;
        }
        .q-bar b {
          display: block;
          height: 100%;
          background: var(--accent, #2563eb);
          transition: width 0.2s;
        }
        .q-status {
          font-size: 0.8rem;
          min-width: 48px;
          text-align: right;
        }
        .q-item .x {
          background: none;
          border: none;
          font-size: 1.2rem;
          line-height: 1;
          cursor: pointer;
          color: var(--muted, #9ca3af);
          padding: 0 0.25rem;
        }
        .q-item .x:hover {
          color: #ef4444;
        }

        /* Tree / lists */
        .tree {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .tree > li {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.55rem 0;
          border-bottom: 1px solid var(--border, #f3f4f6);
        }
        .tree > li:last-child {
          border-bottom: none;
        }
        .folder-name {
          font-weight: 500;
        }
        .grow {
          flex: 1;
        }
        .grow-text {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Row actions */
        .row-actions {
          display: flex;
          gap: 0.65rem;
          align-items: center;
          flex-shrink: 0;
        }
        .link {
          background: none;
          border: none;
          color: var(--accent, #2563eb);
          font-size: 0.85rem;
          cursor: pointer;
          padding: 0;
          text-decoration: none;
        }
        .link:hover {
          text-decoration: underline;
        }
        .link.danger {
          color: #ef4444;
        }

        /* Library specific */
        .lib-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.4rem 0;
        }
        .lib-name {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: none;
          border: none;
          font: inherit;
          cursor: pointer;
          padding: 0;
          min-width: 0;
        }
        .lib-name .grow-text {
          font-weight: 500;
        }
        .caret {
          background: none;
          border: none;
          font-size: 0.9rem;
          cursor: pointer;
          width: 1.4rem;
          color: var(--muted, #6b7280);
          padding: 0;
        }
        .lib-children {
          list-style: none;
          margin: 0;
          padding: 0 0 0 1.6rem;
        }
        .lib-video {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.45rem 0;
          border-bottom: 1px solid var(--border, #f3f4f6);
        }
        .lib-empty {
          padding: 0.5rem 0;
          font-style: italic;
        }

        /* Badges */
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
        }
        .badge.pub {
          background: #ecfdf5;
          color: #047857;
        }
        .badge.priv {
          background: #fef3c7;
          color: #b45309;
        }

        /* Messages */
        .error {
          margin-top: 0.75rem;
          padding: 0.6rem 0.85rem;
          background: #fef2f2;
          color: #b91c1c;
          border-radius: 8px;
          font-size: 0.9rem;
        }
        .ok {
          margin-top: 0.75rem;
          color: #047857;
          font-size: 0.9rem;
        }
        .muted {
          color: var(--muted, #6b7280);
        }
        .muted.small {
          font-size: 0.85rem;
        }

        /* Sections spacing */
        .admin-sections {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* Responsive */
        @media (max-width: 700px) {
          .form-grid {
            flex-direction: column;
            align-items: stretch;
          }
          .field, .field.grow {
            min-width: 0;
          }
          .row-actions {
            flex-wrap: wrap;
            gap: 0.5rem;
          }
          .q-item {
            grid-template-columns: 1fr auto;
          }
          .q-bar, .q-status {
            display: none;
          }
        }
      `}</style>

      {/* Improved header */}
      <header className="page-header">
        <div>
          <h1>Admin</h1>
          <p className="muted">Manage uploads, folders, privacy, sharing and library scanning</p>
        </div>
      </header>

      <div className="admin-sections">
        <Uploader folders={folders} reload={reload} />
        <PrivatePin />
        <Folders folders={folders} reload={reload} />
        <Library folders={folders} reload={reload} />
        <SharedLinks />
        <Scan reload={reload} />
      </div>
    </div>
  );
}