import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmt } from '../progress';
import ShareDialog, { copyText, shareUrl } from '../components/ShareDialog';

const VID = /\.(mp4|m4v|webm|mkv|mov)$/i;
const nat = new Intl.Collator(undefined, { numeric: true });
const sizeOf = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');
const pathLabel = (f) => f.path.split('/').join(' › ');
const PAGE = 60; // rows rendered per folder before "Show more"

/* ---------------- icons (local, so this file is self-contained) ---------------- */
const P = {
  folder: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  film: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  unlock: 'M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z',
  play: 'M8 5v14l11-7z',
  share: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  chev: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z',
  arrow: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
};
const Ic = ({ n, s = 18 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor" aria-hidden="true" focusable="false"><path d={P[n]} /></svg>
);

/* ---------------- small shared pieces ---------------- */
function FolderSelect({ folders, value, onChange, rootLabel = 'Library root' }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="root">{rootLabel}</option>
      {folders.map((f) => <option key={f._id} value={f._id}>{pathLabel(f)}</option>)}
    </select>
  );
}

function PrivBadge({ priv, inherited }) {
  if (!priv && !inherited) return <span className="a-badge pub" title="Public"><em>Public</em></span>;
  return (
    <span className="a-badge priv" title={inherited ? 'Private because a parent folder is private' : 'Private folder'}>
      <Ic n="lock" s={12} /><em>{inherited ? 'Private (inherited)' : 'Private'}</em>
    </span>
  );
}

/* three-dot menu: the menu itself is only rendered while open (keeps big lists light) */
function Kebab({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="a-kebab" ref={ref}>
      <button type="button" className="a-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Ic n="more" />
      </button>
      {open && (
        <>
          <div className="a-sheet-bg" onClick={() => setOpen(false)} />
          <div className="a-menu" role="menu" onClick={() => setOpen(false)}>{children}</div>
        </>
      )}
    </div>
  );
}

function Card({ title, sub, action, children }) {
  return (
    <section className="a-card">
      <div className="a-card-h">
        <div>
          <h2>{title}</h2>
          {sub && <p className="a-sub">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------------- upload ---------------- */
function Uploader({ folders, reload }) {
  const [target, setTarget] = useState('root');
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
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
    <Card
      title="Upload videos"
      sub="Choose a destination, add files or a whole folder (its sub-folders are recreated), tidy the names, then upload. For very large files, copy them to the server and use Scan instead."
    >
      <div className="a-field a-field-narrow">
        <label>Upload into <FolderSelect folders={folders} value={target} onChange={setTarget} /></label>
      </div>

      <div
        className={`a-drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <span className="a-drop-ic"><Ic n="upload" s={30} /></span>
        <strong>Drop video files here</strong>
        <span className="a-faint">mp4 · m4v · webm · mkv · mov</span>
        <div className="a-actions">
          <label className="btn sm accent">Add files
            <input type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="btn sm">Add a whole folder
            <input type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {queue.length > 0 && (
        <>
          <div className="a-queue">
            {queue.map((i) => (
              <div key={i.id} className={`a-q ${i.status}`}>
                <div className="a-q-main">
                  <input value={i.title} disabled={i.status === 'uploading' || i.status === 'done'} onChange={(e) => patch(i.id, { title: e.target.value })} aria-label="Video name" />
                  <small>{i.folderPath && <>{i.folderPath} · </>}{sizeOf(i.file.size)}</small>
                </div>
                <div className="a-q-bar"><b style={{ width: i.progress * 100 + '%' }} /></div>
                <span className="a-q-st">
                  {i.status === 'queued' && 'Waiting'}
                  {i.status === 'uploading' && Math.round(i.progress * 100) + '%'}
                  {i.status === 'done' && <span className="a-ok"><Ic n="check" s={16} /> Done</span>}
                  {i.status === 'error' && <span className="error-text" title={i.error}>Failed</span>}
                </span>
                <button type="button" className="a-icon-btn a-q-x" disabled={i.status === 'uploading'} onClick={() => setQueue((q) => q.filter((x) => x.id !== i.id))} aria-label="Remove">
                  <Ic n="close" s={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="a-actions">
            {!busy
              ? <button className="btn accent" disabled={!pending} onClick={run}>Upload {pending} {pending === 1 ? 'video' : 'videos'}</button>
              : <button className="btn" onClick={stop}>Stop</button>}
            <button className="btn" disabled={busy} onClick={() => setQueue((q) => q.filter((i) => i.status !== 'done'))}>Clear finished</button>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------- private folder PIN ---------------- */
function PrivatePin({ onChange }) {
  const [set, setSet] = useState(null);
  const [cur, setCur] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  useEffect(() => { api.pinInfo().then((r) => setSet(r.pinSet)).catch(() => setSet(false)); }, []);

  const save = async (e) => {
    e.preventDefault(); setMsg(''); setOk('');
    if (pin !== pin2) { setMsg('The two PINs do not match'); return; }
    try { await api.setPin(pin, cur); setSet(true); setCur(''); setPin(''); setPin2(''); setOk('PIN saved. Private folders are locked until it is entered.'); onChange?.(); }
    catch (x) { setMsg(x.message); }
  };
  const remove = async () => {
    setMsg(''); setOk('');
    if (!confirm('Remove the PIN? Private folders will open without asking.')) return;
    try { const r = await api.removePin(cur); setSet(r.pinSet); setCur(''); setOk(r.pinSet ? 'Saved PIN removed (a PIN from the server .env file is still active).' : 'PIN removed.'); onChange?.(); }
    catch (x) { setMsg(x.message); }
  };

  return (
    <Card
      title="Private folder PIN"
      sub="With a PIN set, private folders stay locked: their videos, pictures and counts are hidden until you enter the PIN."
      action={set !== null && (
        <span className={`a-status ${set ? 'on' : ''}`}><Ic n={set ? 'lock' : 'unlock'} s={14} /> {set ? 'PIN active' : 'No PIN set'}</span>
      )}
    >
      {set === false && <p className="a-note">No PIN is set yet, so private folders currently open without one.</p>}
      <form className="a-grid" onSubmit={save}>
        {set && <label>Current PIN<input type="password" autoComplete="off" value={cur} onChange={(e) => setCur(e.target.value)} /></label>}
        <label>{set ? 'New PIN' : 'PIN'}<input type="password" autoComplete="new-password" maxLength={32} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4–32 letters or digits" /></label>
        <label>Repeat PIN<input type="password" autoComplete="new-password" maxLength={32} value={pin2} onChange={(e) => setPin2(e.target.value)} /></label>
        <div className="a-actions">
          <button className="btn accent" disabled={pin.length < 4 || (set && !cur)}>{set ? 'Change PIN' : 'Set PIN'}</button>
          {set && <button type="button" className="btn" disabled={!cur} onClick={remove}>Remove PIN</button>}
        </div>
      </form>
      {msg && <div className="error">{msg}</div>}
      {ok && <p className="ok">{ok}</p>}
    </Card>
  );
}

/* ---------------- new folder ---------------- */
function NewFolder({ folders, reload, onDone }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('root');
  const [vis, setVis] = useState('public');
  const [msg, setMsg] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await api.createFolder(name, parent === 'root' ? null : parent, vis === 'private'); setName(''); setMsg(''); await reload(); onDone?.(); }
    catch (x) { setMsg(x.message); }
  };

  return (
    <form className="a-new" onSubmit={add}>
      <div className="a-grid">
        <label>Folder name<input autoFocus placeholder="e.g. Friends, Season 1" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Inside <FolderSelect folders={folders} value={parent} onChange={setParent} /></label>
        <label>Visibility
          <select value={vis} onChange={(e) => setVis(e.target.value)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <div className="a-actions">
          <button className="btn accent" disabled={!name.trim()}>Create folder</button>
          <button type="button" className="btn" onClick={onDone}>Cancel</button>
        </div>
      </div>
      <p className="a-faint a-small">Private folders (and everything inside them) stay off the Home page, search and shuffle. With a PIN set, nothing inside shows until the PIN is entered.</p>
      {msg && <div className="error">{msg}</div>}
    </form>
  );
}

/* ---------------- move picker (one shared dialog instead of a dropdown per video) ---------------- */
function MovePicker({ folders, video, onPick, onClose }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = needle ? folders.filter((f) => f.path.toLowerCase().includes(needle)) : folders;
    return [...list].sort((a, b) => nat.compare(a.path, b.path));
  }, [folders, needle]);
  const shown = matches.slice(0, 150);
  const here = video.folder || 'root';

  return (
    <div className="a-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="a-modal" role="dialog" aria-modal="true" aria-label="Move video">
        <header>
          <div>
            <h3>Move video</h3>
            <p className="a-faint a-clip">{video.title}</p>
          </div>
          <button type="button" className="a-icon-btn" onClick={onClose} aria-label="Close"><Ic n="close" /></button>
        </header>
        <div className="a-modal-search">
          <Ic n="search" s={18} />
          <input autoFocus placeholder="Search folders…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="a-modal-list">
          {!needle && (
            <li><button type="button" className="a-pick" disabled={here === 'root'} onClick={() => onPick('root')}><Ic n="folder" /> <span>Library root</span>{here === 'root' && <small>current</small>}</button></li>
          )}
          {shown.map((f) => (
            <li key={f._id}>
              <button type="button" className="a-pick" disabled={here === f._id} onClick={() => onPick(f._id)}>
                <Ic n="folder" /> <span>{pathLabel(f)}</span>{here === f._id && <small>current</small>}
              </button>
            </li>
          ))}
          {matches.length > shown.length && <li className="a-faint a-small a-pad">Showing the first {shown.length} of {matches.length}. Type to narrow it down.</li>}
          {!matches.length && <li className="a-faint a-pad">No folders match.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- PIN prompt for locked private folders ---------------- */
function PinPrompt({ folder, onUnlocked, onClose }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const submit = async (e) => {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true); setErr('');
    try { await api.unlockPrivate(pin); await onUnlocked(folder); }
    catch (x) { setErr(x.message); setPin(''); setBusy(false); }
  };
  return (
    <div className="a-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="a-modal a-pinbox" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Enter PIN">
        <header>
          <div>
            <h3>Private folder</h3>
            <p className="a-faint a-clip">{folder.name}</p>
          </div>
          <button type="button" className="a-icon-btn" onClick={onClose} aria-label="Close"><Ic n="close" /></button>
        </header>
        <div className="a-pin">
          <p className="a-faint a-small">Enter your PIN to see what is inside. Until then its videos and counts stay hidden.</p>
          <input autoFocus type="password" autoComplete="off" maxLength={32} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" />
          {err && <div className="error">{err}</div>}
          <button className="btn accent" disabled={busy || !pin}>{busy ? 'Checking…' : 'Unlock'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- library tree ---------------- */
const VideoRow = memo(function VideoRow({ v, onVideo, where }) {
  const meta = [v.duration ? fmt(v.duration) : '', v.size ? sizeOf(v.size) : ''].filter(Boolean).join(' · ');
  return (
    <li className="a-vrow">
      <span className="a-vic"><Ic n="film" s={18} /></span>
      <div className="a-main">
        <b className="a-title" title={v.title}>{v.title}</b>
        {(where || meta) && <small>{where && <>{where}{meta && ' · '}</>}{meta}</small>}
      </div>
      <Link className="a-icon-btn" to={`/watch/${v._id}`} aria-label={`Play ${v.title}`} title="Play"><Ic n="play" /></Link>
      <Kebab label={`Actions for ${v.title}`}>
        <Link className="a-mi" role="menuitem" to={`/watch/${v._id}`}><Ic n="play" />Play</Link>
        <button type="button" className="a-mi" role="menuitem" onClick={() => onVideo('share', v)}><Ic n="share" />Share</button>
        <button type="button" className="a-mi" role="menuitem" onClick={() => onVideo('rename', v)}><Ic n="edit" />Rename</button>
        <button type="button" className="a-mi" role="menuitem" onClick={() => onVideo('move', v)}><Ic n="arrow" />Move to…</button>
        <button type="button" className="a-mi danger" role="menuitem" onClick={() => onVideo('delete', v)}><Ic n="trash" />Delete</button>
      </Kebab>
    </li>
  );
});

const VideoList = memo(function VideoList({ list, onVideo }) {
  const [n, setN] = useState(PAGE);
  const shown = list.length > n ? list.slice(0, n) : list;
  return (
    <>
      {shown.map((v) => <VideoRow key={v._id} v={v} onVideo={onVideo} />)}
      {list.length > n && (
        <li>
          <button type="button" className="a-more" onClick={() => setN((x) => x + PAGE)}>
            Show {Math.min(PAGE, list.length - n)} more · {list.length - n} remaining
          </button>
        </li>
      )}
    </>
  );
});

function FolderNode({ f, inherited, idx, open, locked, onToggle, onFolder, onVideo }) {
  const priv = f.isPrivate || inherited;
  const hide = locked && priv; // private + PIN not entered: nothing inside may show
  const isOpen = open.has(f._id) && !hide;
  const n = idx.tot[f._id] || 0;
  return (
    <li className="a-folder">
      <div className={`a-frow ${isOpen ? 'on' : ''}`}>
        <button type="button" className={`a-caret ${isOpen ? 'on' : ''}`} onClick={() => onToggle(f, priv)} aria-label={hide ? 'Locked, enter PIN' : isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen}>
          <Ic n="chev" />
        </button>
        <button type="button" className="a-fname" onClick={() => onToggle(f, priv)} title={hide ? 'Locked — enter PIN to open' : f.name}>
          <Ic n="folder" s={20} /><span>{f.name}</span>
        </button>
        {hide
          ? <span className="a-count lock" title="Locked — enter PIN to see inside"><Ic n="lock" s={12} /></span>
          : <span className="a-count" title={`${n} ${n === 1 ? 'video' : 'videos'}`}>{n}</span>}
        <PrivBadge priv={f.isPrivate} inherited={!f.isPrivate && inherited} />
        <Kebab label={`Actions for ${f.name}`}>
          <Link className="a-mi" role="menuitem" to={`/folder/${f._id}`}><Ic n="folder" />Open folder</Link>
          <button type="button" className="a-mi" role="menuitem" onClick={() => onFolder('privacy', f)}><Ic n={f.isPrivate ? 'unlock' : 'lock'} />{f.isPrivate ? 'Make public' : 'Make private'}</button>
          <button type="button" className="a-mi" role="menuitem" onClick={() => onFolder('rename', f)}><Ic n="edit" />Rename</button>
          <button type="button" className="a-mi danger" role="menuitem" onClick={() => onFolder('delete', f)}><Ic n="trash" />Delete</button>
        </Kebab>
      </div>
      {isOpen && (
        <ul className="a-children">
          {(idx.kids[f._id] || []).map((c) => (
            <FolderNode key={c._id} f={c} inherited={priv} idx={idx} open={open} locked={locked} onToggle={onToggle} onFolder={onFolder} onVideo={onVideo} />
          ))}
          <VideoList list={idx.vids[f._id] || EMPTY} onVideo={onVideo} />
          {!(idx.kids[f._id]?.length) && !(idx.vids[f._id]?.length) && <li className="a-empty-row">Empty folder</li>}
        </ul>
      )}
    </li>
  );
}
const EMPTY = [];

function Library({ folders, videos, setVideos, reload, locked, canLock, privIds, refreshGate }) {
  const [open, setOpen] = useState(() => new Set());
  const [share, setShare] = useState(null);
  const [moving, setMoving] = useState(null);
  const [adding, setAdding] = useState(false);
  const [ask, setAsk] = useState(null); // private folder waiting for its PIN
  const [q, setQ] = useState('');
  const query = useDeferredValue(q).trim().toLowerCase();

  // Build the folder/video index once per data change, not on every click.
  const idx = useMemo(() => {
    const kids = {}; const vids = {};
    folders.forEach((f) => { (kids[f.parent || 'root'] ||= []).push(f); });
    (videos || []).forEach((v) => { (vids[v.folder || 'root'] ||= []).push(v); });
    Object.values(kids).forEach((l) => l.sort((a, b) => nat.compare(a.name, b.name)));
    Object.values(vids).forEach((l) => l.sort((a, b) => nat.compare(a.title || '', b.title || '')));
    const tot = {};
    const walk = (id) => {
      if (tot[id] !== undefined) return tot[id];
      tot[id] = 0; // guards against a parent cycle
      let c = vids[id]?.length || 0;
      (kids[id] || []).forEach((k) => { c += walk(k._id); });
      tot[id] = c;
      return c;
    };
    folders.forEach((f) => walk(f._id));
    const byId = new Map(folders.map((f) => [f._id, f]));
    return { kids, vids, tot, byId };
  }, [folders, videos]);

  const hits = useMemo(() => {
    if (!query) return null;
    const out = []; let total = 0;
    for (const v of videos || []) {
      if (locked && privIds.has(v.folder)) continue; // locked private videos never show up in search
      if ((v.title || '').toLowerCase().includes(query)) { total++; if (out.length < 150) out.push(v); }
    }
    return { out, total };
  }, [query, videos, locked, privIds]);

  const toggle = useCallback((id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const expandAll = () => setOpen(new Set([...folders.filter((f) => !(locked && privIds.has(f._id))).map((f) => f._id), 'root']));

  // Opening a private folder re-checks the PIN state first; a locked one asks for the PIN instead of expanding.
  const onToggle = useCallback(async (f, priv) => {
    if (priv) {
      let needPin = true;
      try { const s = await api.privateStatus(); needPin = !!s.pinSet && !s.unlocked; refreshGate(); } catch { /* treat as locked */ }
      if (needPin) { setOpen((o) => { if (!o.has(f._id)) return o; const n = new Set(o); n.delete(f._id); return n; }); setAsk(f); return; }
    }
    toggle(f._id);
  }, [toggle, refreshGate]);

  const unlocked = async (f) => {
    await refreshGate();
    setAsk(null);
    setOpen((o) => new Set(o).add(f._id));
  };
  const lockNow = async () => { try { await api.lockPrivate(); } catch { /* ignore */ } refreshGate(); };
  const collapseAll = () => setOpen(new Set());

  const onVideo = useCallback(async (kind, v) => {
    try {
      if (kind === 'share') setShare(v);
      else if (kind === 'move') setMoving(v);
      else if (kind === 'rename') {
        const t = prompt('New name', v.title);
        if (t && t.trim()) {
          await api.updateVideo(v._id, { title: t });
          setVideos((l) => l.map((x) => (x._id === v._id ? { ...x, title: t.trim() } : x)));
        }
      } else if (kind === 'delete') {
        if (!confirm(`Delete “${v.title}”? The file is removed from the server.`)) return;
        await api.deleteVideo(v._id);
        setVideos((l) => l.filter((x) => x._id !== v._id));
      }
    } catch (e) { alert(e.message); }
  }, [setVideos]);

  const onFolder = useCallback(async (kind, f) => {
    try {
      if (kind === 'rename') {
        const n = prompt('New name', f.name);
        if (n && n.trim()) { await api.renameFolder(f._id, n); reload(); }
      } else if (kind === 'delete') {
        if (!confirm(`Delete “${f.name}” and every video inside it? The files are removed from the server too.`)) return;
        await api.deleteFolder(f._id); reload();
      } else if (kind === 'privacy') {
        let pin;
        if (f.isPrivate) {
          pin = prompt('Enter the current private-folder PIN to make this folder public:');
          if (pin === null) return;
          if (!pin) { alert('PIN is required to make a private folder public.'); return; }
        }
        await api.setFolderPrivate(f._id, !f.isPrivate, pin);
        reload();
      }
    } catch (e) { alert(e.message); }
  }, [reload]);

  const moveTo = async (to) => {
    const v = moving; setMoving(null);
    try {
      await api.updateVideo(v._id, { folderId: to });
      setVideos((l) => l.map((x) => (x._id === v._id ? { ...x, folder: to === 'root' ? null : to } : x)));
    } catch (e) { alert(e.message); }
  };

  const rootFolders = idx.kids.root || EMPTY;
  const rootVideos = idx.vids.root || EMPTY;
  const rootOpen = open.has('root');

  return (
    <Card
      title="Library"
      sub="Every folder with its sub-folders and videos. Tap a folder to open it; use ⋯ for actions."
      action={<button className="btn sm accent" onClick={() => setAdding((a) => !a)}><Ic n="plus" s={16} /> New folder</button>}
    >
      {adding && <NewFolder folders={folders} reload={reload} onDone={() => setAdding(false)} />}

      <div className="a-bar">
        <div className="a-search">
          <Ic n="search" s={18} />
          <input type="search" placeholder="Search videos by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search videos" />
        </div>
        <div className="a-actions">
          {!query && <button className="btn sm" onClick={expandAll}>Expand all</button>}
          {!query && <button className="btn sm" onClick={collapseAll}>Collapse all</button>}
          {canLock && !locked && <button className="btn sm" onClick={lockNow}><Ic n="lock" s={14} /> Lock private</button>}
        </div>
      </div>
      {locked && privIds.size > 0 && <p className="a-note a-lockinfo"><Ic n="lock" s={14} /> Private folders are locked. Tap one and enter your PIN to see what is inside.</p>}

      {!videos && <p className="a-faint a-pad">Loading…</p>}

      {videos && hits && (
        <ul className="a-tree">
          {hits.out.map((v) => (
            <VideoRow key={v._id} v={v} onVideo={onVideo} where={v.folder ? idx.byId.get(v.folder) && pathLabel(idx.byId.get(v.folder)) : 'Library root'} />
          ))}
          {hits.total > hits.out.length && <li className="a-faint a-small a-pad">Showing the first {hits.out.length} of {hits.total} matches. Type more to narrow it down.</li>}
          {!hits.total && <li className="a-empty-row">No videos match “{q.trim()}”.</li>}
        </ul>
      )}

      {videos && !hits && (
        <ul className="a-tree">
          {rootFolders.map((f) => (
            <FolderNode key={f._id} f={f} inherited={false} idx={idx} open={open} locked={locked} onToggle={onToggle} onFolder={onFolder} onVideo={onVideo} />
          ))}
          {rootVideos.length > 0 && (
            <li className="a-folder">
              <div className={`a-frow ${rootOpen ? 'on' : ''}`}>
                <button type="button" className={`a-caret ${rootOpen ? 'on' : ''}`} onClick={() => toggle('root')} aria-label={rootOpen ? 'Collapse' : 'Expand'} aria-expanded={rootOpen}><Ic n="chev" /></button>
                <button type="button" className="a-fname" onClick={() => toggle('root')}><Ic n="folder" s={20} /><span>Loose videos (no folder)</span></button>
                <span className="a-count">{rootVideos.length}</span>
                <PrivBadge priv={false} />
              </div>
              {rootOpen && <ul className="a-children"><VideoList list={rootVideos} onVideo={onVideo} /></ul>}
            </li>
          )}
          {!rootFolders.length && !rootVideos.length && <li className="a-empty-row">Nothing here yet. Create a folder or upload your first video.</li>}
        </ul>
      )}

      {share && <ShareDialog video={share} onClose={() => setShare(null)} />}
      {ask && <PinPrompt folder={ask} onUnlocked={unlocked} onClose={() => setAsk(null)} />}
      {moving && <MovePicker folders={folders} video={moving} onPick={moveTo} onClose={() => setMoving(null)} />}
    </Card>
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
    <Card title="Shared links" sub="Anyone with one of these links can watch that one video without logging in. Stop sharing to disable a link immediately.">
      <ul className="a-tree">
        {list?.map((v) => {
          const expired = v.shareExpires && new Date(v.shareExpires) < new Date();
          return (
            <li key={v._id} className="a-vrow">
              <span className="a-vic"><Ic n="link" s={18} /></span>
              <div className="a-main">
                <b className="a-title" title={v.title}>{v.title}</b>
                <small>{expired ? 'Expired' : when(v.shareExpires)} · {v.shareViews || 0} views</small>
              </div>
              <button className="btn sm" onClick={() => copy(v)}>{copied === v._id ? <><Ic n="check" s={15} /> Copied</> : 'Copy link'}</button>
              <button className="a-icon-btn danger" onClick={() => stop(v)} aria-label={`Stop sharing ${v.title}`} title="Stop sharing"><Ic n="close" /></button>
            </li>
          );
        })}
        {!list && <li className="a-faint a-pad">Loading…</li>}
        {list && !list.length && <li className="a-empty-row">Nothing is shared right now.</li>}
      </ul>
    </Card>
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
    <Card title="Scan library" sub="Copy big files straight to the server, then scan. Folders become site folders, files become videos, and thumbnails are generated. Entries whose file has disappeared are removed.">
      <pre className="a-code"><code>rsync -avP ./Friends/ user@server:/var/media/matinee/Friends/</code></pre>
      <div className="a-actions">
        <button className="btn accent" onClick={go} disabled={busy}><Ic n="refresh" s={16} /> {busy ? 'Scanning…' : 'Scan now'}</button>
      </div>
      {res && <p className="ok">Added {res.newVideos} videos and {res.newFolders} folders. Removed {res.removed} missing.</p>}
      {err && <div className="error">{err}</div>}
    </Card>
  );
}

/* ---------------- page ---------------- */
const TABS = [
  ['library', 'Library', 'folder'],
  ['upload', 'Upload', 'upload'],
  ['sharing', 'Shared links', 'share'],
  ['privacy', 'Privacy', 'lock'],
  ['scan', 'Scan', 'refresh'],
];
const TAB_KEY = 'matinee-admin-tab';

export default function Admin() {
  const [folders, setFolders] = useState([]);
  const [videos, setVideos] = useState(null);
  const [tab, setTab] = useState(() => {
    try { const t = sessionStorage.getItem(TAB_KEY); return TABS.some((x) => x[0] === t) ? t : 'library'; } catch { return 'library'; }
  });

  // null until the server answers: until then private folders are treated as locked
  const [gate, setGate] = useState(null);
  const refreshGate = useCallback(() => api.privateStatus().then((s) => setGate({ pinSet: !!s.pinSet, unlocked: !!s.unlocked })).catch(() => {}), []);
  const locked = !gate || (gate.pinSet && !gate.unlocked);
  const loadFolders = useCallback(() => api.folders().then(setFolders).catch(() => {}), []);
  const loadVideos = useCallback(() => api.library().then((d) => setVideos(d.videos)).catch(() => setVideos((v) => v || [])), []);
  const reload = useCallback(() => Promise.all([loadFolders(), loadVideos()]), [loadFolders, loadVideos]);
  useEffect(() => { reload(); refreshGate(); document.title = 'Admin · Matinee'; }, [reload, refreshGate]);
  // the unlock expires on the server, so re-check regularly and when the tab regains focus
  useEffect(() => {
    const t = setInterval(refreshGate, 20000);
    const onVis = () => { if (!document.hidden) refreshGate(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [refreshGate]);

  // ids of every private folder, including ones that are private only because a parent is
  const privIds = useMemo(() => {
    const byId = new Map(folders.map((f) => [f._id, f]));
    const out = new Set();
    for (const f of folders) {
      let cur = f; let hops = 0;
      while (cur && hops++ < 64) {
        if (cur.isPrivate) { out.add(f._id); break; }
        cur = cur.parent ? byId.get(cur.parent) : null;
      }
    }
    return out;
  }, [folders]);

  const go = (t) => { setTab(t); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } };

  const stats = useMemo(() => {
    const list = (videos || []).filter((v) => !(locked && privIds.has(v.folder)));
    return {
      videos: videos ? list.length : '–',
      folders: folders.length,
      priv: folders.filter((f) => f.isPrivate).length,
      size: videos ? sizeOf(list.reduce((n, v) => n + (v.size || 0), 0)) : '–',
    };
  }, [videos, folders, locked, privIds]);

  return (
    <div className="page admin adm">
      <style>{CSS}</style>

      <header className="a-head">
        <div>
          <span className="eyebrow"><i />Dashboard</span>
          <h1>Admin</h1>
          <p>Manage your library, uploads, sharing and privacy.</p>
        </div>
      </header>

      <div className="a-stats">
        <div className="a-stat"><b>{stats.videos}</b><span>Videos</span></div>
        <div className="a-stat"><b>{stats.folders}</b><span>Folders</span></div>
        <div className="a-stat"><b>{stats.priv}</b><span>Private</span></div>
        <div className="a-stat"><b>{stats.size}</b><span>Storage</span></div>
      </div>

      <nav className="a-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map(([id, label, ic]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`a-tab ${tab === id ? 'on' : ''}`} onClick={() => go(id)}>
            <Ic n={ic} s={17} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {tab === 'library' && <Library folders={folders} videos={videos} setVideos={setVideos} reload={reload} locked={locked} canLock={!!gate?.pinSet} privIds={privIds} refreshGate={refreshGate} />}
      {/* stays mounted so an upload in progress is not lost when switching tabs */}
      <div hidden={tab !== 'upload'}><Uploader folders={folders} reload={reload} /></div>
      {tab === 'sharing' && <SharedLinks />}
      {tab === 'privacy' && <PrivatePin onChange={refreshGate} />}
      {tab === 'scan' && <Scan reload={reload} />}
    </div>
  );
}

/* ---------------- styles (scoped to .adm, driven by the theme variables) ---------------- */
const CSS = `
.page.adm{max-width:1120px}
.adm *{box-sizing:border-box}
.adm [hidden]{display:none!important}
.adm h1,.adm h2,.adm h3{margin:0}

.a-head{margin-bottom:22px}
.a-head h1{font-size:clamp(30px,4.4vw,44px);letter-spacing:-.5px;margin-top:6px}
.a-head p{margin:6px 0 0;color:var(--muted)}

.a-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:22px}
.a-stat{position:relative;overflow:hidden;padding:16px 18px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(160deg,var(--surface),var(--bg2))}
.a-stat::after{content:'';position:absolute;right:-28px;top:-28px;width:96px;height:96px;border-radius:50%;background:color-mix(in srgb,var(--accent) 13%,transparent)}
.a-stat b{display:block;font:700 clamp(22px,3vw,29px) var(--serif);letter-spacing:-.3px;line-height:1.15}
.a-stat span{display:block;margin-top:2px;font:700 11.5px var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}

.a-tabs{position:sticky;top:var(--nav-h);z-index:20;display:flex;gap:6px;overflow-x:auto;padding:8px 0 12px;margin:0 0 6px;scrollbar-width:none;background:linear-gradient(var(--bg) 75%,transparent)}
.a-tabs::-webkit-scrollbar{display:none}
.a-tab{flex:none;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--text-soft);font:600 14px var(--sans);cursor:pointer;transition:background .2s,color .2s,border-color .2s,transform .2s var(--ease)}
.a-tab:hover{border-color:var(--line2);background:var(--surface2)}
.a-tab.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);box-shadow:0 6px 20px color-mix(in srgb,var(--accent2) 28%,transparent)}

.a-card{border:1px solid var(--line);background:color-mix(in srgb,var(--bg2) 88%,transparent);border-radius:20px;padding:clamp(16px,2.6vw,28px);margin:14px 0 18px;animation:aUp .35s var(--ease) both}
.a-card-h{display:flex;align-items:flex-start;justify-content:space-between;gap:14px 20px;flex-wrap:wrap;margin-bottom:16px}
.a-card h2{font-size:clamp(19px,2.4vw,23px);letter-spacing:-.2px}
.a-sub{margin:6px 0 0;color:var(--muted);font-size:14px;max-width:68ch}
.a-faint{color:var(--muted)} .a-small{font-size:12.5px} .a-pad{padding:12px 8px}
.a-clip{margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:36ch}
.a-note{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:color-mix(in srgb,var(--warn) 12%,transparent);color:var(--warn);font-size:13.5px}
.a-ok{display:inline-flex;align-items:center;gap:4px;color:var(--ok)}

.a-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;align-items:end}
.a-grid input,.a-grid select,.a-field select{width:100%}
.a-field{margin-bottom:16px} .a-field-narrow{max-width:420px}
.a-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.a-new{margin:0 0 18px;padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--surface);display:grid;gap:12px}
.a-new p{margin:0}

.a-status{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:99px;font:700 12.5px var(--sans);color:var(--muted);background:var(--surface2);border:1px solid var(--line)}
.a-status.on{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,transparent);background:color-mix(in srgb,var(--ok) 11%,transparent)}

.a-bar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:14px}
.a-search{position:relative;flex:1 1 240px;min-width:0}
.a-search svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
.a-search input{width:100%;padding-left:40px;border-radius:12px}

.a-tree,.a-children{list-style:none;margin:0;padding:0}
.a-children{margin:2px 0 6px 21px;padding-left:12px;border-left:1px solid var(--line);animation:aFade .18s ease both}
.a-frow,.a-vrow{display:flex;align-items:center;gap:8px;min-height:50px;padding:4px 6px 4px 4px;border-radius:14px;transition:background .15s}
.a-frow:hover,.a-vrow:hover{background:color-mix(in srgb,var(--text) 5%,transparent)}
.a-frow.on{background:color-mix(in srgb,var(--accent) 7%,transparent)}
.a-caret{flex:none;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:10px;background:none;color:var(--muted);cursor:pointer}
.a-caret svg{transition:transform .2s var(--ease)} .a-caret.on svg{transform:rotate(90deg)} .a-caret:hover{color:var(--text)}
.a-fname{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:10px 4px;border:0;background:none;color:var(--text);font:600 15px var(--sans);text-align:left;cursor:pointer}
.a-fname svg{flex:none;color:var(--accent)}
.a-fname span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a-count{flex:none;min-width:28px;padding:2px 9px;border-radius:99px;background:var(--surface2);color:var(--muted);font:700 12px var(--sans);text-align:center;font-variant-numeric:tabular-nums}
.a-count.lock{display:inline-grid;place-items:center;color:var(--danger-ink);background:var(--danger-bg)}
.a-lockinfo{display:flex;align-items:center;gap:8px}
.a-pinbox{width:min(420px,100%)}
.a-pin{display:grid;gap:12px;padding:0 22px 22px}
.a-pin p{margin:0}
.a-pin input{width:100%}
.a-vic{flex:none;width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--surface2);color:var(--muted)}
.a-main{flex:1;min-width:0;display:grid;gap:1px}
.a-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:14.5px}
.a-main small{color:var(--muted);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.a-empty-row{padding:14px 12px;color:var(--muted);font-size:14px}
.a-more{display:block;width:100%;margin:6px 0;padding:11px;border:1px dashed var(--line2);border-radius:12px;background:none;color:var(--accent);font:600 13.5px var(--sans);cursor:pointer;transition:background .15s}
.a-more:hover{background:color-mix(in srgb,var(--accent) 9%,transparent)}

.a-badge{flex:none;display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font:700 11.5px var(--sans)}
.a-badge em{font-style:normal}
.a-badge.pub{color:var(--ok);background:color-mix(in srgb,var(--ok) 13%,transparent)}
.a-badge.priv{color:var(--danger-ink);background:var(--danger-bg);border:1px solid var(--danger-line)}

.a-icon-btn{flex:none;width:36px;height:36px;display:inline-grid;place-items:center;border:0;border-radius:10px;background:none;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.a-icon-btn:hover:not(:disabled){background:var(--surface3);color:var(--text)}
.a-icon-btn.danger:hover{color:var(--danger)} .a-icon-btn:disabled{opacity:.35;cursor:not-allowed}

.a-kebab{position:relative;flex:none}
.a-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:40;min-width:196px;padding:6px;border:1px solid var(--line2);border-radius:14px;background:var(--surface);box-shadow:0 18px 50px var(--shadow);animation:aPop .14s var(--ease)}
.a-mi{display:flex;align-items:center;gap:11px;width:100%;padding:10px 12px;border:0;border-radius:9px;background:none;color:var(--text);font:600 14px var(--sans);text-align:left;cursor:pointer;text-decoration:none}
.a-mi svg{color:var(--muted);flex:none} .a-mi:hover{background:var(--surface3)}
.a-mi.danger,.a-mi.danger svg{color:var(--danger)}
.a-sheet-bg{display:none}

.a-drop{display:grid;justify-items:center;gap:8px;padding:clamp(26px,5vw,46px) 16px;border:1.5px dashed var(--line2);border-radius:18px;background:color-mix(in srgb,var(--surface) 55%,transparent);text-align:center;transition:border-color .2s,background .2s,transform .2s var(--ease)}
.a-drop.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 9%,transparent);transform:scale(1.005)}
.a-drop strong{font-size:16px}
.a-drop-ic{display:grid;place-items:center;width:58px;height:58px;border-radius:18px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
.a-drop .a-actions{justify-content:center;margin-top:6px}

.a-queue{display:grid;gap:8px;margin:18px 0}
.a-q{display:grid;grid-template-columns:minmax(0,1fr) 130px 76px 36px;grid-template-areas:"main bar st x";align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--bg2)}
.a-q-main{grid-area:main;display:grid;gap:4px;min-width:0} .a-q-main input{width:100%}
.a-q-main small{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a-q-bar{grid-area:bar;height:6px;border-radius:9px;background:var(--surface3);overflow:hidden}
.a-q-bar b{display:block;height:100%;background:linear-gradient(90deg,var(--accent2),var(--accent));transition:width .2s}
.a-q-st{grid-area:st;font-size:13px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.a-q-x{grid-area:x}
.a-q.done{opacity:.72} .a-q.error{border-color:var(--danger-line)}

.a-code{margin:0 0 16px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--input-bg);overflow-x:auto;font-size:13px}
.a-code code{background:none;padding:0}

.a-modal-bg{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:16px;background:#000a;backdrop-filter:blur(4px);animation:aFade .15s ease both}
.a-modal{width:min(520px,100%);max-height:min(82vh,660px);display:flex;flex-direction:column;border:1px solid var(--line2);border-radius:22px;background:var(--bg2);box-shadow:0 30px 80px var(--shadow);animation:aPop .18s var(--ease)}
.a-modal header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 18px 8px 22px}
.a-modal h3{font-size:19px}
.a-modal-search{position:relative;padding:6px 18px 10px}
.a-modal-search svg{position:absolute;left:32px;top:50%;margin-top:-4px;transform:translateY(-50%);color:var(--muted);pointer-events:none}
.a-modal-search input{width:100%;padding-left:40px;border-radius:12px}
.a-modal-list{list-style:none;margin:0;padding:4px 10px 14px;overflow-y:auto;scrollbar-width:thin}
.a-pick{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:0;border-radius:11px;background:none;color:var(--text);font:600 14px var(--sans);text-align:left;cursor:pointer}
.a-pick svg{flex:none;color:var(--accent)} .a-pick span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a-pick small{color:var(--muted)} .a-pick:hover:not(:disabled){background:var(--surface3)} .a-pick:disabled{opacity:.5;cursor:default}

@keyframes aUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes aFade{from{opacity:0}to{opacity:1}}
@keyframes aPop{from{opacity:0;transform:scale(.97) translateY(-4px)}to{opacity:1;transform:none}}

@media (max-width:860px){
  .a-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:640px){
  .a-tab span{font-size:13.5px} .a-tab{padding:9px 14px}
  .a-badge em{display:none} .a-badge{padding:5px}
  .a-children{margin-left:15px;padding-left:8px}
  .a-frow,.a-vrow{gap:6px;padding-right:2px}
  .a-caret{width:30px}
  .a-actions .btn{flex:1 1 auto}
  .a-q{grid-template-columns:minmax(0,1fr) auto 36px;grid-template-areas:"main st x" "bar bar bar";gap:8px 10px}
  .a-sheet-bg{display:block;position:fixed;inset:0;z-index:39;background:#0008;animation:aFade .15s ease both}
  .a-menu{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));top:auto;z-index:40;min-width:0;padding:8px;border-radius:20px;animation:aUp .2s var(--ease)}
  .a-mi{padding:14px 14px;font-size:15px}
  .a-modal-bg{place-items:end stretch;padding:0}
  .a-modal{width:100%;max-height:86vh;border-radius:22px 22px 0 0;animation:aUp .22s var(--ease)}
}
@media (prefers-reduced-motion:reduce){
  .adm *{animation-duration:.01ms!important;transition-duration:.01ms!important}
}
`;