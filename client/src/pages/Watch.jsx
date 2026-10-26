import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import ShareDialog from '../components/ShareDialog';
import { useAuth } from '../App';
import { fmt } from '../progress';
import { store } from '../playerStore';
import { toggleList, useMyList } from '../mylist';

export default function Watch() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState(() => localStorage.getItem('mt_autoplay') || 'next');
  const [rand, setRand] = useState(null);
  const activeRef = useRef(null);
  const slotRef = useRef(null);
  const auth = useAuth();
  const list = useMyList();
  const [sharing, setSharing] = useState(false);

  // always start at the top so the video is on screen (phones keep the old scroll position otherwise)
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [id]);

  // The previous video keeps playing until the next one's data arrives (keeps fullscreen alive)
  useEffect(() => {
    setErr('');
    api.watch(id).then((d) => { setData(d); document.title = d.video.title + ' · Matinee'; }).catch((e) => setErr(e.message));
  }, [id]);

  const vid = data?.video;

  // pre-pick the "random" up-next so the countdown can show its title
  useEffect(() => {
    setRand(null);
    if (!vid || !mode.startsWith('random')) return;
    let alive = true;
    api.random(mode === 'random-folder' ? vid.folder || undefined : undefined, vid._id).then((r) => alive && setRand(r)).catch(() => {});
    return () => { alive = false; };
  }, [vid?._id, mode]); // eslint-disable-line

  // keep the current episode visible INSIDE the playlist only (scrollIntoView used to scroll the whole page down)
  useEffect(() => {
    const el = activeRef.current, list = el?.parentElement;
    if (!el || !list) return;
    list.scrollTop = Math.max(0, el.offsetTop - list.offsetTop - list.clientHeight / 2 + el.clientHeight / 2);
  }, [vid?._id]);

  const changeMode = (m) => { setMode(m); localStorage.setItem('mt_autoplay', m); };
  const go = (vId) => vId && nav('/watch/' + vId);
  const surprise = async (folder) => {
    try { const r = await api.random(folder, vid._id); go(r._id); } catch (e) { alert(e.message); }
  };

  const nextItem = data?.nextId ? data.playlist.find((p) => p._id === data.nextId) : null;
  const upNext = mode === 'next' ? (nextItem && { id: nextItem._id, title: nextItem.title })
    : mode === 'off' ? null
    : rand && { id: rand._id, title: rand.title };
  const folderId = data?.folder?._id;

  // Dock the app-wide player over this page's placeholder. When we leave this page the
  // player is NOT stopped: it shrinks into the floating mini-player.
  const hasData = !!data;
  useEffect(() => {
    if (!hasData) return undefined;
    store.set({ slot: slotRef.current });
    return () => store.set({ slot: null });
  }, [hasData]);

  useEffect(() => {
    if (!data) return;
    store.set({
      session: {
        video: data.video,
        src: `/api/stream/${data.video._id}`,
        onBack: () => (folderId ? nav('/folder/' + folderId) : nav('/')),
        onNext: data.nextId ? () => go(data.nextId) : upNext ? () => go(upNext.id) : null,
        onPrev: data.prevId ? () => go(data.prevId) : null,
        upNext,
        onPlayUpNext: () => upNext && go(upNext.id),
        onRandom: (scope) => surprise(scope === 'folder' ? folderId : undefined),
        hasFolder: !!folderId,
        prefetchSrc: upNext ? `/api/stream/${upNext.id}` : null,
      },
    });
  }, [data, mode, rand]); // eslint-disable-line

  if (err && !data) return <div className="page"><div className="error">{err}</div></div>;
  if (!data) return <div className="page muted">Loading…</div>;

  return (
    <div className="watch">
      <div className="watch-main">
        <div ref={slotRef} className="player-slot" />
        <div className="watch-info">
          <h1>{vid.title}</h1>
          <nav className="crumbs">
            <Link to="/">Library</Link>
            {data.breadcrumbs.map((c) => <span key={c._id}>/ <Link to={`/folder/${c._id}`}>{c.name}</Link></span>)}
          </nav>
          <div className="watch-actions">
            <button className="btn" disabled={!data.prevId} onClick={() => go(data.prevId)}><Icon name="prev" size={18} /> Previous</button>
            <button className="btn" disabled={!data.nextId} onClick={() => go(data.nextId)}>Next <Icon name="next" size={18} /></button>
            <button className="btn" onClick={() => toggleList(vid)}><Icon name={list.some((x) => x._id === vid._id) ? 'check' : 'plus'} size={18} /> My List</button>
            <button className="btn accent" onClick={() => surprise(folderId)} disabled={!folderId}><Icon name="shuffle" size={18} /> Random from this folder</button>
            <button className="btn accent" onClick={() => surprise()}><Icon name="shuffle" size={18} /> Random from everything</button>
            {auth.authenticated && <button className="btn" onClick={() => setSharing(true)}><Icon name="share" size={18} /> Share</button>}
            <label className="select-inline">When this ends
              <select value={mode} onChange={(e) => changeMode(e.target.value)}>
                <option value="next">Play next episode</option>
                <option value="random-folder">Random from this folder</option>
                <option value="random-all">Random from everything</option>
                <option value="off">Stop</option>
              </select>
            </label>
          </div>
          <p className="muted keys">Keys: Space/K play · J/L ±10s · ←/→ ±5s · ↑/↓ volume · M mute · F fullscreen · I mini-player · N/P next/previous · 0–9 jump · &lt; &gt; speed</p>
        </div>
      </div>

      {data.playlist.length > 1 && (
        <aside className="playlist">
          <h3>{data.folder?.name || 'Library'} <span>{data.playlist.length}</span></h3>
          <div className="pl-list">
            {data.playlist.map((p) => (
              <Link key={p._id} to={`/watch/${p._id}`} className={p._id === vid._id ? 'on' : ''} ref={p._id === vid._id ? activeRef : null}>
                <div className="pl-thumb">{p.hasThumb ? <img loading="lazy" src={`/api/thumb/${p._id}`} alt="" /> : <Icon name="play" size={18} />}</div>
                <span>{p.title}</span>
                {p.duration > 0 && <em>{fmt(p.duration)}</em>}
              </Link>
            ))}
          </div>
        </aside>
      )}
      {sharing && <ShareDialog video={vid} onClose={() => setSharing(false)} />}
    </div>
  );
}
