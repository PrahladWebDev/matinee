import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { fmt } from '../progress';
import { cleanTitle } from '../format';

const canPreview = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  !navigator.connection?.saveData;

/** Full-width featured banner: crossfading posters, slow zoom, muted preview, auto-rotate. */
export default function Hero({ items, onRandom }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showVid, setShowVid] = useState(false);
  const [vidOn, setVidOn] = useState(false);
  const [muted, setMuted] = useState(true);
  const vref = useRef(null);
  const cur = items[i];
  const start = cur.duration > 60 ? Math.floor(cur.duration * 0.2) : 3;

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 12000);
    return () => clearInterval(t);
  }, [items.length, paused]);

  // after a short pause, fade a muted preview over the poster
  useEffect(() => {
    setShowVid(false); setVidOn(false);
    if (!canPreview()) return;
    const t = setTimeout(() => setShowVid(true), 2200);
    return () => clearTimeout(t);
  }, [cur._id]);

  useEffect(() => { if (vref.current) vref.current.muted = muted; }, [muted, showVid]);

  return (
    <section className="hero2" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="hero2-bg">
        {items.map((it, k) => (
          <img key={it._id} className={k === i ? 'on' : ''} src={`/api/poster/${it._id}`} alt=""
            loading={k === 0 ? 'eager' : 'lazy'}
            onError={(e) => { if (!e.currentTarget.dataset.f) { e.currentTarget.dataset.f = '1'; e.currentTarget.src = `/api/thumb/${it._id}`; } }} />
        ))}
        {showVid && (
          <video key={cur._id} ref={vref} className={`hero2-vid${vidOn ? ' on' : ''}`}
            src={`/api/stream/${cur._id}#t=${start}`} autoPlay loop muted playsInline preload="auto"
            onPlaying={() => setVidOn(true)}
            onTimeUpdate={(e) => { if (e.currentTarget.currentTime > start + 40) e.currentTarget.currentTime = start; }} />
        )}
        <div className="hero2-shade" />
      </div>

      <div className="hero2-copy" key={cur._id}>
        <span className="eyebrow"><i /> {cur.folderName ? 'From ' + cur.folderName : 'Featured tonight'}</span>
        <h1>{cleanTitle(cur.title)}</h1>
        <p className="hero2-meta">
          {cur.duration > 0 && <span>{fmt(cur.duration)}</span>}
          {cur.folderName && <span>{cur.folderName}</span>}
          <span className="badge">HD</span>
        </p>
        <div className="hero2-actions">
          <Link to={`/watch/${cur._id}`} className="btn accent big"><Icon name="play" size={22} /> Play</Link>
          <button className="btn glass big" onClick={onRandom}><Icon name="shuffle" size={20} /> Surprise me</button>
          {cur.folderId && <Link to={`/folder/${cur.folderId}`} className="btn glass big"><Icon name="info" size={20} /> More like this</Link>}
        </div>
      </div>

      <div className="hero2-side">
        {showVid && vidOn && (
          <button className="round-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
            <Icon name={muted ? 'mute' : 'volume'} size={20} />
          </button>
        )}
        {items.length > 1 && (
          <div className="dots">
            {items.map((it, k) => <button key={it._id} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Show featured ${k + 1}`} />)}
          </div>
        )}
      </div>
    </section>
  );
}
