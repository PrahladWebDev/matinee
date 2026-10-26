import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { fmt, getProgress } from '../progress';
import { cleanTitle } from '../format';

// hover previews only on real mice, not on phones / data-saver / reduced-motion
const canPreview = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  !navigator.connection?.saveData;

export default function VideoCard({ v, i = 0 }) {
  const [bad, setBad] = useState(false);
  const [prev, setPrev] = useState(false);
  const [ready, setReady] = useState(false);
  const timer = useRef();
  const p = getProgress(v._id);
  const pct = p && p.d ? Math.min(100, (p.t / p.d) * 100) : 0;
  const start = v.duration > 60 ? Math.floor(v.duration * 0.25) : 4;

  const enter = () => { if (canPreview()) timer.current = setTimeout(() => setPrev(true), 650); };
  const leave = () => { clearTimeout(timer.current); setPrev(false); setReady(false); };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Link to={`/watch/${v._id}`} className="vcard" style={{ '--i': Math.min(i, 14) }} onMouseEnter={enter} onMouseLeave={leave}>
      <div className="thumb">
        {v.hasThumb && !bad ? (
          <img loading="lazy" src={`/api/thumb/${v._id}`} alt="" onError={() => setBad(true)} />
        ) : (
          <div className="ph"><Icon name="play" size={30} /></div>
        )}
        {prev && (
          <video
            className={`prev${ready ? ' on' : ''}`}
            src={`/api/stream/${v._id}#t=${start}`}
            muted loop autoPlay playsInline preload="auto"
            onPlaying={() => setReady(true)}
            onTimeUpdate={(e) => { if (e.currentTarget.currentTime > start + 8) e.currentTarget.currentTime = start; }}
          />
        )}
        {v.duration > 0 && <span className="dur">{fmt(v.duration)}</span>}
        {pct > 1 && pct < 95 && <i className="prog"><b style={{ width: pct + '%' }} /></i>}
        <div className="t-info"><span className="round"><Icon name="play" size={18} /></span></div>
      </div>
      <p title={v.title}>{cleanTitle(v.title)}</p>
    </Link>
  );
}
