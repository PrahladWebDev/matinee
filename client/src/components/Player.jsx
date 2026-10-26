import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { clearProgress, fmt, getProgress, saveProgress } from '../progress';

const FITS = ['fit', 'fill', 'stretch'];
const FIT_LABEL = { fit: 'Fit', fill: 'Fill', stretch: 'Stretch' };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const getPrefs = () => { try { return JSON.parse(localStorage.getItem('mt_prefs')) || {}; } catch { return {}; } };
const setPrefs = (p) => { try { localStorage.setItem('mt_prefs', JSON.stringify({ ...getPrefs(), ...p })); } catch {} };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/**
 * Custom player. Stays mounted while you move between episodes, so
 * fullscreen survives auto-play of the next video.
 */
export default function Player({ video, src, onBack, onNext, onPrev, upNext, onPlayUpNext, onRandom, hasFolder, prefetchSrc }) {
  const vref = useRef(null);
  const box = useRef(null);
  const bar = useRef(null);
  const live = useRef({});
  live.current = { onNext, onPrev, video };

  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [bufs, setBufs] = useState([]);
  const [vol, setVol] = useState(getPrefs().volume ?? 1);
  const [muted, setMuted] = useState(getPrefs().muted ?? false);
  const [rate, setRate] = useState(getPrefs().rate ?? 1);
  const [fit, setFit] = useState(FITS.includes(getPrefs().fit) ? getPrefs().fit : 'fit');
  const [full, setFull] = useState(false);
  const [pseudo, setPseudo] = useState(false);   // iPhone fallback: CSS fullscreen (iOS can't fullscreen a div)
  const [show, setShow] = useState(true);
  const [wait, setWait] = useState(true);
  const [err, setErr] = useState(false);
  const [menu, setMenu] = useState(false);
  const [hover, setHover] = useState(null);
  const [scrub, setScrub] = useState(null);
  const [flash, setFlash] = useState(null);
  const [ended, setEnded] = useState(false);
  const [count, setCount] = useState(null);

  const showRef = useRef(true);
  showRef.current = show;
  const hideTimer = useRef();
  const lastSave = useRef(0);
  const prefetched = useRef(false);
  const tap = useRef({ t: 0, timer: null, type: 'mouse' });

  const flashIt = (type, label) => setFlash({ type, label, k: Date.now() });
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 750);
    return () => clearTimeout(t);
  }, [flash]);

  // ---- reset when a different video is loaded into the same player ----
  useEffect(() => {
    const v = vref.current;
    const p = getPrefs();
    v.volume = p.volume ?? 1;
    v.muted = p.muted ?? false;
    v.defaultPlaybackRate = p.rate ?? 1;
    v.playbackRate = p.rate ?? 1;
    setCur(0); setDur(0); setBufs([]); setWait(true); setErr(false); setEnded(false); setCount(null);
    prefetched.current = false;
    return () => {
      // remember where we stopped
      if (v.currentTime > 3 && v.duration) saveProgress(video._id, { t: v.currentTime, d: v.duration, title: video.title, thumb: video.hasThumb });
    };
  }, [video._id]); // eslint-disable-line

  // ---- actions ----
  const poke = useCallback(() => {
    setShow(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (vref.current && !vref.current.paused) { setShow(false); setMenu(false); }
    }, 2800);
  }, []);

  const toggle = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    if (v.paused || v.ended) { v.play().catch(() => {}); flashIt('play'); }
    else { v.pause(); flashIt('pause'); }
  }, []);

  const seekBy = useCallback((d) => {
    const v = vref.current;
    if (!v || !v.duration) return;
    v.currentTime = clamp(v.currentTime + d, 0, v.duration);
    flashIt(d > 0 ? 'fwd' : 'back', Math.abs(d) + 's');
  }, []);

  const changeVol = useCallback((d) => {
    const v = vref.current;
    v.muted = false;
    v.volume = clamp(v.volume + d, 0, 1);
    flashIt('vol', Math.round(v.volume * 100) + '%');
  }, []);

  const toggleFull = useCallback(() => {
    const el = box.current;
    const nativeOn = document.fullscreenElement || document.webkitFullscreenElement;
    if (nativeOn) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (el.requestFullscreen || el.webkitRequestFullscreen) {
      const r = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen();
      // turn the phone sideways automatically (Android/Chrome); ignored where unsupported
      Promise.resolve(r).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
      return;
    }
    setPseudo((p) => !p);   // iPhone: CSS fullscreen, rotated to landscape when held upright
  }, []);

  const pip = useCallback(async () => {
    const v = vref.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await v.requestPictureInPicture();
    } catch {}
  }, []);

  const cycleFit = useCallback(() => {
    setFit((f) => {
      const n = FITS[(FITS.indexOf(f) + 1) % FITS.length];
      setPrefs({ fit: n });
      flashIt('vol', FIT_LABEL[n]);
      return n;
    });
  }, []);

  const applyRate = (r) => { const v = vref.current; v.defaultPlaybackRate = r; v.playbackRate = r; };

  useEffect(() => {
    const onFs = () => {
      const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setFull(on);
      if (!on) { try { screen.orientation?.unlock?.(); } catch {} }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('no-scroll', pseudo);
    return () => document.documentElement.classList.remove('no-scroll');
  }, [pseudo]);

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches?.('input[type=text],input[type=search],input[type=password],textarea,select')) return;
      const v = vref.current;
      if (!v) return;
      const k = e.key;
      let ok = true;
      if (k === ' ' || k === 'k' || k === 'K') toggle();
      else if (k === 'ArrowRight') seekBy(5);
      else if (k === 'ArrowLeft') seekBy(-5);
      else if (k === 'l' || k === 'L') seekBy(10);
      else if (k === 'j' || k === 'J') seekBy(-10);
      else if (k === 'ArrowUp') changeVol(0.05);
      else if (k === 'ArrowDown') changeVol(-0.05);
      else if (k === 'm' || k === 'M') { v.muted = !v.muted; flashIt('vol', v.muted ? 'Muted' : Math.round(v.volume * 100) + '%'); }
      else if (k === 'f' || k === 'F') toggleFull();
      else if (k === 'i' || k === 'I') pip();
      else if (k === 'n' || k === 'N') live.current.onNext?.();
      else if (k === 'p' || k === 'P') live.current.onPrev?.();
      else if (k === '>') { applyRate(Math.min(2, v.playbackRate + 0.25)); flashIt('vol', v.playbackRate + '×'); }
      else if (k === '<') { applyRate(Math.max(0.25, v.playbackRate - 0.25)); flashIt('vol', v.playbackRate + '×'); }
      else if (/^[0-9]$/.test(k) && v.duration) v.currentTime = (v.duration * Number(k)) / 10;
      else if (k === 'Home') v.currentTime = 0;
      else ok = false;
      if (ok) { e.preventDefault(); poke(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekBy, changeVol, toggleFull, pip, poke]);

  // ---- OS media keys / lock-screen controls ----
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: video.title,
      artist: 'Matinee',
      artwork: video.hasThumb ? [{ src: `/api/thumb/${video._id}`, sizes: '480x270', type: 'image/jpeg' }] : [],
    });
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
    set('play', () => vref.current?.play());
    set('pause', () => vref.current?.pause());
    set('seekbackward', () => seekBy(-10));
    set('seekforward', () => seekBy(10));
    set('nexttrack', () => live.current.onNext?.());
    set('previoustrack', () => live.current.onPrev?.());
  }, [video._id, video.title, video.hasThumb, seekBy]);

  // ---- up-next countdown ----
  useEffect(() => {
    if (count === null) return;
    if (count <= 0) { setCount(null); onPlayUpNext?.(); return; }
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count]); // eslint-disable-line

  // ---- video element events ----
  const readBuffered = () => {
    const v = vref.current, a = [];
    for (let i = 0; i < v.buffered.length; i++) a.push([v.buffered.start(i), v.buffered.end(i)]);
    setBufs(a);
  };

  const onLoadedMeta = () => {
    const v = vref.current;
    setDur(isFinite(v.duration) ? v.duration : 0);
    const p = getProgress(video._id);
    if (p && p.t > 5 && p.t < v.duration - 15) v.currentTime = p.t;   // resume
    v.play().catch(() => {});
  };

  const onTime = () => {
    const v = vref.current;
    setCur(v.currentTime);
    readBuffered();
    if (Date.now() - lastSave.current > 4000 && v.duration) {
      lastSave.current = Date.now();
      saveProgress(video._id, { t: v.currentTime, d: v.duration, title: video.title, thumb: video.hasThumb });
    }
    // warm the next episode's first bytes so it starts instantly
    if (prefetchSrc && !prefetched.current && v.duration && v.currentTime / v.duration > 0.8) {
      prefetched.current = true;
      fetch(prefetchSrc, { headers: { Range: 'bytes=0-3000000' }, credentials: 'same-origin' }).then((r) => r.arrayBuffer()).catch(() => {});
    }
  };

  const onEnd = () => {
    clearProgress(video._id);
    setPlaying(false); setEnded(true); setShow(true);
    if (upNext) setCount(5);
  };

  // ---- seek bar ----
  const pctAt = (x) => { const r = bar.current.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1); };
  const onBarDown = (e) => { if (!dur) return; e.currentTarget.setPointerCapture(e.pointerId); setScrub(pctAt(e.clientX) * dur); };
  const onBarMove = (e) => {
    if (!dur) return;
    const p = pctAt(e.clientX);
    setHover({ x: p, t: p * dur });
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) setScrub(p * dur);
  };
  const onBarUp = () => {
    if (scrub === null) return;
    vref.current.currentTime = scrub;
    setCur(scrub); setScrub(null); setEnded(false); setCount(null);
  };

  // ---- click / double-click / double-tap on the picture ----
  const onSurfaceClick = (e) => {
    if (menu) { setMenu(false); return; }
    const now = Date.now();
    const r = box.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const t = tap.current;
    if (now - t.t < 300) {
      clearTimeout(t.timer); t.t = 0;
      if (t.type !== 'mouse') { if (x < 0.35) seekBy(-10); else if (x > 0.65) seekBy(10); else toggleFull(); }
      else toggleFull();
      return;
    }
    t.t = now;
    t.timer = setTimeout(() => {
      if (t.type !== 'mouse' && !showRef.current) poke();
      else toggle();
    }, 270);
  };

  const isFull = full || pseudo;
  const shown = scrub ?? cur;
  const pct = dur ? (shown / dur) * 100 : 0;
  const ui = show || !playing || menu || scrub !== null;
  const volIcon = muted || vol === 0 ? 'mute' : vol < 0.5 ? 'volumeLow' : 'volume';

  return (
    <div ref={box} className={`player${ui ? ' ui' : ''}${isFull ? ' full' : ''}${pseudo ? ' pseudo' : ''}${fit !== 'fit' ? ' fit-' + fit : ''}`} onMouseMove={poke} onMouseLeave={() => playing && setShow(false)}>
      <video
        ref={vref}
        src={src}
        preload="auto"
        playsInline
        onLoadedMetadata={onLoadedMeta}
        onDurationChange={() => setDur(isFinite(vref.current.duration) ? vref.current.duration : 0)}
        onTimeUpdate={onTime}
        onProgress={readBuffered}
        onPlay={() => { setPlaying(true); setEnded(false); setCount(null); poke(); }}
        onPause={() => { setPlaying(false); setShow(true); }}
        onWaiting={() => setWait(true)}
        onPlaying={() => { setWait(false); setErr(false); }}
        onCanPlay={() => setWait(false)}
        onSeeked={() => setWait(false)}
        onError={() => { setErr(true); setWait(false); }}
        onEnded={onEnd}
        onVolumeChange={() => { const v = vref.current; setVol(v.volume); setMuted(v.muted); setPrefs({ volume: v.volume, muted: v.muted }); }}
        onRateChange={() => { const r = vref.current.playbackRate; setRate(r); setPrefs({ rate: r }); }}
      />
      <div className="p-surface" onPointerDown={(e) => { tap.current.type = e.pointerType; }} onClick={onSurfaceClick} />

      {wait && !err && <div className="p-spinner" aria-label="Loading" />}

      {flash && (
        <div className={`p-flash ${flash.type}`} key={flash.k}>
          {flash.type === 'play' && <Icon name="play" size={40} />}
          {flash.type === 'pause' && <Icon name="pause" size={40} />}
          {flash.type === 'fwd' && <><Icon name="fwd10" size={34} /><span>{flash.label}</span></>}
          {flash.type === 'back' && <><Icon name="back10" size={34} /><span>{flash.label}</span></>}
          {flash.type === 'vol' && <span className="big">{flash.label}</span>}
        </div>
      )}

      {!playing && !wait && !ended && !err && (
        <button className="p-big" onClick={toggle} aria-label="Play"><Icon name="play" size={56} /></button>
      )}

      {err && (
        <div className="p-err">
          <h3>This file won’t play in your browser</h3>
          <p>Browsers play MP4 (H.264 video + AAC audio) best. Run <code>deploy/optimize.sh</code> on the folder to convert it, then scan the library from Admin.</p>
          <button className="btn" onClick={() => { setErr(false); setWait(true); vref.current.load(); }}>Try again</button>
        </div>
      )}

      {ended && (
        <div className="p-end" onClick={(e) => e.stopPropagation()}>
          <div className="p-end-card">
            {upNext ? (
              <>
                <small>Up next</small>
                <h3>{upNext.title}</h3>
                {count !== null && <p>Starting in {count}s</p>}
              </>
            ) : <h3>Finished</h3>}
            <div className="p-end-btns">
              {upNext && <button className="btn accent" onClick={() => { setCount(null); onPlayUpNext(); }}><Icon name="play" size={18} /> Play next</button>}
              {onRandom && hasFolder && <button className="btn glass" onClick={() => { setCount(null); onRandom('folder'); }}><Icon name="shuffle" size={18} /> Random from folder</button>}
              {onRandom && <button className="btn glass" onClick={() => { setCount(null); onRandom('all'); }}><Icon name="shuffle" size={18} /> Random from all</button>}
              <button className="btn glass" onClick={() => { setCount(null); vref.current.currentTime = 0; vref.current.play(); }}><Icon name="replay" size={18} /> Replay</button>
              {count !== null && <button className="btn" onClick={() => setCount(null)}>Stay here</button>}
            </div>
          </div>
        </div>
      )}

      <div className="p-top">
        {onBack && <button className="p-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>}
        <span className="p-title">{video.title}</span>
      </div>

      <div className="p-bottom">
        <div
          ref={bar}
          className={`seek${scrub !== null ? ' drag' : ''}`}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={() => setScrub(null)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="seek-track">
            {dur > 0 && bufs.map(([a, b], i) => <div key={i} className="seek-buf" style={{ left: (a / dur) * 100 + '%', width: ((b - a) / dur) * 100 + '%' }} />)}
            <div className="seek-play" style={{ width: pct + '%' }} />
            <div className="seek-knob" style={{ left: pct + '%' }} />
          </div>
          {hover && <div className="seek-tip" style={{ left: hover.x * 100 + '%' }}>{fmt(hover.t)}</div>}
        </div>

        <div className="p-row">
          <button className="p-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={30} /></button>
          {onPrev && <button className="p-btn" onClick={onPrev} aria-label="Previous"><Icon name="prev" /></button>}
          <button className="p-btn" onClick={() => seekBy(-10)} aria-label="Back 10 seconds"><Icon name="back10" size={28} /></button>
          <button className="p-btn" onClick={() => seekBy(10)} aria-label="Forward 10 seconds"><Icon name="fwd10" size={28} /></button>
          {onNext && <button className="p-btn" onClick={onNext} aria-label="Next"><Icon name="next" /></button>}

          <div className="vol">
            <button className="p-btn" onClick={() => { vref.current.muted = !vref.current.muted; }} aria-label="Mute"><Icon name={volIcon} /></button>
            <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : vol} aria-label="Volume"
              onChange={(e) => { const v = vref.current; v.volume = +e.target.value; v.muted = +e.target.value === 0; }}
              onPointerUp={(e) => e.currentTarget.blur()} />
          </div>

          <span className="p-time">{fmt(shown)} <i>/</i> {fmt(dur)}</span>
          <span className="grow" />

          <div className="menu-wrap">
            <button className="p-btn" onClick={() => setMenu((m) => !m)} aria-label="Settings"><Icon name="settings" size={24} />{rate !== 1 && <em className="rate-badge">{rate}×</em>}</button>
            {menu && (
              <div className="p-menu">
                <h4>Playback speed</h4>
                {SPEEDS.map((s) => (
                  <button key={s} className={s === rate ? 'on' : ''} onClick={() => { applyRate(s); setMenu(false); }}>{s === 1 ? 'Normal' : s + '×'}</button>
                ))}
              </div>
            )}
          </div>
          {document.pictureInPictureEnabled && <button className="p-btn" onClick={pip} aria-label="Picture in picture"><Icon name="pip" size={24} /></button>}
          <button className="p-btn p-fit" onClick={cycleFit} aria-label="Stretch video" title="Fit / Fill / Stretch"><Icon name="stretch" size={24} />{fit !== 'fit' && <em className="fit-badge">{FIT_LABEL[fit].toUpperCase()}</em>}</button>
          <button className="p-btn" onClick={toggleFull} aria-label="Fullscreen"><Icon name={isFull ? 'fullExit' : 'full'} size={26} /></button>
        </div>
      </div>
    </div>
  );
}
