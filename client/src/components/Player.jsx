import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { api } from '../api';
import { clearProgress, fmt, getProgress, saveProgress } from '../progress';
import { activeCue, decodeSubs, parseSubs, subLabel } from '../subs';
import '../subs.css';

const FITS = ['fit', 'fill', 'stretch'];
const FIT_LABEL = { fit: 'Fit', fill: 'Fill', stretch: 'Stretch' };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const getPrefs = () => { try { return JSON.parse(localStorage.getItem('mt_prefs')) || {}; } catch { return {}; } };
const setPrefs = (p) => { try { localStorage.setItem('mt_prefs', JSON.stringify({ ...getPrefs(), ...p })); } catch {} };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

// subtitles: where the tracks of this video live (own library, or a shared link)
const SUB_SIZES = [0.7, 0.85, 1, 1.25, 1.5, 1.8, 2.2];
function subBaseOf(src, id) {
  if (!src) return null;
  if (src.startsWith('/api/stream/')) return `/api/subs/${id}`;
  const m = /^\/api\/share\/([^/]+)\/stream/.exec(src);
  return m ? `/api/share/${m[1]}/subs` : null;
}

// audio-language picker helpers
const defaultTrack = (t) => (t.find((x) => x.default) || t[0])?.n ?? 0;
function audLabel(t) {
  let name = '';
  if (t.lang) {
    try { name = new Intl.DisplayNames(['en'], { type: 'language' }).of(t.lang) || ''; } catch { /* unknown code */ }
    if (!name || name === t.lang) name = t.lang.toUpperCase();
  }
  const extra = [];
  if (t.title && t.title.toLowerCase() !== name.toLowerCase()) extra.push(t.title);
  if (t.channels > 2) extra.push(t.channels === 6 ? '5.1' : t.channels + 'ch');
  return [name || `Track ${t.n + 1}`, ...extra].join(' · ');
}

/**
 * Custom player. Stays mounted while you move between episodes, so
 * fullscreen survives auto-play of the next video.
 */
export default function Player({ video, src, onBack, onNext, onPrev, upNext, onPlayUpNext, onRandom, hasFolder, prefetchSrc, mini, onExpand, onClose }) {
  const vref = useRef(null);
  const aref = useRef(null);       // separate <audio> used when another language is picked
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
  const [tracks, setTracks] = useState([]);      // audio tracks found inside the video file
  const [aud, setAud] = useState(null);          // null = the video's own audio, else index of the extra track in use
  const [audBusy, setAudBusy] = useState(null);  // track being prepared on the server
  const [subs, setSubs] = useState([]);          // subtitle tracks: inside the file, next to it, or picked from the device
  const [sub, setSub] = useState(null);          // key of the track on screen (null = off)
  const [subBusy, setSubBusy] = useState(null);  // key of the track being fetched / cut out by the server
  const [cues, setCues] = useState([]);
  const [subText, setSubText] = useState('');    // what is on screen right now
  const [subSize, setSubSize] = useState(getPrefs().subSize ?? 1);
  const [subDelay, setSubDelay] = useState(0);   // seconds; positive = show later

  const subPick = useRef(0);
  const fileIn = useRef(null);
  const audOn = useRef(false);
  const volRef = useRef(1);
  const mutedRef = useRef(false);
  const pick = useRef(0);
  volRef.current = vol;
  mutedRef.current = muted;

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
    pick.current++; setTracks([]); setAud(null); setAudBusy(null);
    subPick.current++; setSubs([]); setSub(null); setSubBusy(null); setCues([]); setSubText(''); setSubDelay(0);
    prefetched.current = false;
    return () => {
      // remember where we stopped
      if (v.currentTime > 3 && v.duration) saveProgress(video._id, { t: v.currentTime, d: v.duration, title: video.title, thumb: video.hasThumb, priv: !!video.priv });
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

  // volume / mute go through these so they also steer the extra audio track when one is in use
  const setVolume = useCallback((x) => {
    x = clamp(x, 0, 1);
    const v = vref.current, a = aref.current;
    v.volume = x;
    if (audOn.current) { if (a) a.volume = x; setVol(x); setPrefs({ volume: x }); }
  }, []);
  const setMute = useCallback((m) => {
    const v = vref.current, a = aref.current;
    if (audOn.current) { if (a) a.muted = m; setMuted(m); setPrefs({ muted: m }); }
    else v.muted = m;
  }, []);

  const changeVol = useCallback((d) => {
    const v = vref.current;
    const next = clamp((audOn.current ? volRef.current : v.volume) + d, 0, 1);
    setMute(false);
    setVolume(next);
    flashIt('vol', Math.round(next * 100) + '%');
  }, [setMute, setVolume]);

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
      if (mini) return;   // shortcuts only while the full player is on screen
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
      else if (k === 'm' || k === 'M') { const nm = !(audOn.current ? mutedRef.current : v.muted); setMute(nm); flashIt('vol', nm ? 'Muted' : Math.round((audOn.current ? volRef.current : v.volume) * 100) + '%'); }
      else if ((k === 'a' || k === 'A') && live.current.cycleAudio) live.current.cycleAudio();
      else if ((k === 'c' || k === 'C') && live.current.toggleSubs) live.current.toggleSubs();
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
  }, [toggle, seekBy, changeVol, setMute, toggleFull, pip, poke, mini]);

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

  useEffect(() => { if (mini) setCount(null); }, [mini]);   // never auto-jump while browsing

  // ---- up-next countdown ----
  useEffect(() => {
    if (count === null) return;
    if (count <= 0) { setCount(null); onPlayUpNext?.(); return; }
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count]); // eslint-disable-line

  // ---- audio languages ----
  // list the tracks inside this file; with 2+ the picker appears, and the last chosen language is re-applied
  useEffect(() => {
    if (!src || !src.startsWith('/api/stream/')) return undefined;
    let alive = true;
    api.audioTracks(video._id).then((r) => {
      if (!alive) return;
      const t = r.tracks || [];
      setTracks(t);
      const want = getPrefs().audioLang;
      if (want && t.length > 1) {
        const m = t.find((x) => x.lang === want);
        if (m && m.n !== defaultTrack(t)) selectAudio(m.n, t, false);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [video._id, src]); // eslint-disable-line

  // choose a track. The video's own audio is used for its default track; any other track is cut out
  // by the server once (can take a minute for a long film), then played in sync with the muted video.
  async function selectAudio(n, list = tracks, remember = true) {
    const token = ++pick.current;
    const t = list.find((x) => x.n === n);
    if (remember) setPrefs({ audioLang: t?.lang || '' });
    if (n === defaultTrack(list)) { setAud(null); setAudBusy(null); if (remember) flashIt('vol', t ? audLabel(t) : 'Audio'); return; }
    setAudBusy(n);
    if (remember) flashIt('vol', 'Preparing audio…');
    let ready = false;
    try {
      for (let i = 0; i < 2400 && pick.current === token; i++) {
        const s = await api.audioStatus(video._id, n);
        if (s.state === 'ready') { ready = true; break; }
        if (s.state === 'error') break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch { /* treated as not ready */ }
    if (pick.current !== token) return;
    setAudBusy(null);
    if (!ready) { flashIt('vol', 'Audio unavailable'); return; }
    setAud(n);
    if (t) flashIt('vol', audLabel(t));
  }

  const cycleAudio = () => {
    if (tracks.length < 2) return;
    const cur = aud === null ? defaultTrack(tracks) : aud;
    const i = tracks.findIndex((x) => x.n === cur);
    selectAudio(tracks[(i + 1) % tracks.length].n);
  };
  live.current.cycleAudio = cycleAudio;

  // ---- subtitles ----
  // list what exists for this video; the language picked last time is switched on again
  useEffect(() => {
    const base = subBaseOf(src, video._id);
    if (!base) return undefined;
    let alive = true;
    fetch(`${base}/list`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((r) => {
        if (!alive) return;
        const list = r.subs || [];
        setSubs((prev) => [...list, ...prev.filter((x) => x.kind === 'local')]);
        const want = getPrefs().subLang;
        const m = want && want !== 'off' ? list.find((x) => x.lang === want && !x.forced) || list.find((x) => x.lang === want) : null;
        if (m) selectSub(m.key, list, false);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [video._id, src]); // eslint-disable-line

  // choose a track (null = off). Tracks inside the file are cut out by the server once, which can take
  // a little while for a long film; files next to the video come back at once.
  async function selectSub(key, list = subs, remember = true) {
    const token = ++subPick.current;
    if (key === null) {
      setSub(null); setSubBusy(null); setCues([]);
      if (remember) { setPrefs({ subLang: 'off' }); flashIt('vol', 'Subtitles off'); }
      return;
    }
    const n = list.findIndex((x) => x.key === key);
    const s = list[n];
    if (!s) return;
    if (s.kind !== 'local' && remember) setPrefs({ subLang: s.lang || '' });
    if (s.kind === 'local') { setCues(s.cues); setSub(key); setSubBusy(null); if (remember) flashIt('vol', subLabel(s, n)); return; }
    const base = subBaseOf(src, video._id);
    if (!base) return;
    setSubBusy(key);
    if (remember) flashIt('vol', 'Loading subtitles…');
    let got = null;
    try {
      for (let i = 0; i < 1200 && subPick.current === token; i++) {
        const r = await fetch(`${base}/${key}`, { credentials: 'same-origin' });
        if (!r.ok) break;
        const j = await r.json();
        if (j.state === 'ready') { got = j; break; }
        if (j.state === 'error') break;
        await new Promise((res) => setTimeout(res, 1500));
      }
    } catch { /* treated as not available */ }
    if (subPick.current !== token) return;
    setSubBusy(null);
    const parsed = got ? parseSubs(got.text, got.format) : [];
    if (!parsed.length) { if (remember) flashIt('vol', 'Subtitles unavailable'); return; }
    setCues(parsed); setSub(key);
    if (remember) flashIt('vol', subLabel(s, n));
  }

  // a subtitle file from the user's own device (srt / vtt / ass); lives only until the video changes
  const onLocalFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || f.size > 5 * 1024 * 1024) { if (f) flashIt('vol', 'File too large'); return; }
    try {
      const parsed = parseSubs(decodeSubs(await f.arrayBuffer()), f.name.split('.').pop());
      if (!parsed.length) { flashIt('vol', 'Not a subtitle file'); return; }
      const entry = { key: 'local-' + Date.now(), kind: 'local', lang: '', title: f.name.replace(/\.[^.]+$/, ''), cues: parsed };
      setSubs((p) => [...p, entry]);
      selectSub(entry.key, [...subs, entry]);
    } catch { flashIt('vol', 'Could not read that file'); }
    setMenu(false);
  };

  const toggleSubs = () => {
    if (sub !== null) { selectSub(null); return; }
    if (!subs.length) { flashIt('vol', 'No subtitles'); return; }
    const want = getPrefs().subLang;
    const m = (want && want !== 'off' && subs.find((x) => x.lang === want)) || subs.find((x) => x.default) || subs[0];
    selectSub(m.key);
  };
  live.current.toggleSubs = toggleSubs;

  const bumpSize = (d) => {
    const i = SUB_SIZES.findIndex((x) => x >= subSize - 0.001);
    const n = SUB_SIZES[clamp((i < 0 ? 2 : i) + d, 0, SUB_SIZES.length - 1)];
    setSubSize(n); setPrefs({ subSize: n });
  };

  // draw the subtitle that belongs to the current moment (frame-accurate while playing)
  useEffect(() => {
    const v = vref.current;
    if (!v || !cues.length) { setSubText(''); return undefined; }
    let raf = 0;
    const once = () => setSubText(activeCue(cues, v.currentTime - subDelay));
    const loop = () => { once(); cancelAnimationFrame(raf); if (!v.paused) raf = requestAnimationFrame(loop); };
    const evs = ['play', 'playing', 'seeked', 'pause', 'timeupdate', 'ratechange'];
    evs.forEach((e) => v.addEventListener(e, loop));
    loop();
    return () => { evs.forEach((e) => v.removeEventListener(e, loop)); cancelAnimationFrame(raf); };
  }, [cues, subDelay]);

  // keep the extra audio element locked to the video (play, pause, seek, speed, drift)
  useEffect(() => {
    const v = vref.current, a = aref.current;
    if (aud === null || !a) { audOn.current = false; if (v) v.muted = mutedRef.current; return undefined; }
    audOn.current = true;
    v.muted = true;
    a.volume = volRef.current; a.muted = mutedRef.current; a.playbackRate = v.playbackRate;
    const sync = (force) => { if (force || Math.abs(a.currentTime - v.currentTime) > 0.3) { try { a.currentTime = v.currentTime; } catch { /* not loaded yet */ } } };
    const start = () => { sync(true); if (!v.paused) a.play().catch(() => { audOn.current = false; v.muted = mutedRef.current; setAud(null); flashIt('vol', 'Browser blocked the audio'); }); };
    const onPlaying = () => { sync(); if (!v.paused) a.play().catch(() => {}); };
    const onPause = () => a.pause();
    const onSeek = () => sync(true);
    const onRate = () => { a.playbackRate = v.playbackRate; };
    const onTime = () => sync();
    a.addEventListener('loadedmetadata', start);
    v.addEventListener('playing', onPlaying); v.addEventListener('play', onPlaying);
    v.addEventListener('pause', onPause); v.addEventListener('waiting', onPause);
    v.addEventListener('seeking', onSeek); v.addEventListener('seeked', onSeek);
    v.addEventListener('ratechange', onRate); v.addEventListener('timeupdate', onTime);
    if (a.readyState >= 1) start();
    return () => {
      a.removeEventListener('loadedmetadata', start);
      v.removeEventListener('playing', onPlaying); v.removeEventListener('play', onPlaying);
      v.removeEventListener('pause', onPause); v.removeEventListener('waiting', onPause);
      v.removeEventListener('seeking', onSeek); v.removeEventListener('seeked', onSeek);
      v.removeEventListener('ratechange', onRate); v.removeEventListener('timeupdate', onTime);
      a.pause();
      audOn.current = false;
      v.muted = mutedRef.current;
    };
  }, [aud]); // eslint-disable-line

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
      saveProgress(video._id, { t: v.currentTime, d: v.duration, title: video.title, thumb: video.hasThumb, priv: !!video.priv });
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
    if (upNext && !mini) setCount(5);
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
    if (mini) { onExpand?.(); return; }
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
    <div ref={box} className={`player${ui ? ' ui' : ''}${isFull ? ' full' : ''}${pseudo ? ' pseudo' : ''}${mini ? ' mini' : ''}${fit !== 'fit' ? ' fit-' + fit : ''}`} onMouseMove={poke} onMouseLeave={() => playing && setShow(false)}>
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
        onVolumeChange={() => { if (audOn.current) return; const v = vref.current; setVol(v.volume); setMuted(v.muted); setPrefs({ volume: v.volume, muted: v.muted }); }}
        onRateChange={() => { const r = vref.current.playbackRate; setRate(r); setPrefs({ rate: r }); }}
      />
      {subText && <div className="p-subs" style={{ '--sub-scale': subSize }}><span>{subText}</span></div>}
      {aud !== null && <audio ref={aref} src={`/api/audio/${video._id}/${aud}/file`} preload="auto" />}
      <input ref={fileIn} type="file" accept=".srt,.vtt,.ass,.ssa,text/vtt,application/x-subrip" hidden onChange={onLocalFile} />
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
            <button className="p-btn" onClick={() => setMute(!muted)} aria-label="Mute"><Icon name={volIcon} /></button>
            <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : vol} aria-label="Volume"
              onChange={(e) => { const x = +e.target.value; setVolume(x); setMute(x === 0); }}
              onPointerUp={(e) => e.currentTarget.blur()} />
          </div>

          <span className="p-time">{fmt(shown)} <i>/</i> {fmt(dur)}</span>
          <span className="grow" />

          {!mini && (
            <button className="p-btn" onClick={() => setMenu((m) => !m)} aria-label="Subtitles" title="Subtitles (C)"><Icon name="cc" size={26} />{sub !== null && <em className="rate-badge">ON</em>}{subBusy !== null && sub === null && <em className="rate-badge">…</em>}</button>
          )}
          {tracks.length > 1 && (
            <button className="p-btn" onClick={() => setMenu((m) => !m)} aria-label="Audio language" title="Audio language (A)"><Icon name="audio" size={24} />{audBusy !== null && <em className="rate-badge">…</em>}</button>
          )}
          <div className="menu-wrap">
            <button className="p-btn" onClick={() => setMenu((m) => !m)} aria-label="Settings"><Icon name="settings" size={24} />{rate !== 1 && <em className="rate-badge">{rate}×</em>}</button>
            {menu && (
              <div className="p-menu">
                {tracks.length > 1 && (
                  <>
                    <h4>Audio</h4>
                    {tracks.map((t) => {
                      const sel = aud === null ? t.n === defaultTrack(tracks) : aud === t.n;
                      return <button key={t.n} className={sel ? 'on' : ''} onClick={() => { selectAudio(t.n); setMenu(false); }}>{audLabel(t)}{audBusy === t.n && ' …'}</button>;
                    })}
                  </>
                )}
                <h4>Subtitles</h4>
                <button className={sub === null ? 'on' : ''} onClick={() => { selectSub(null); setMenu(false); }}>Off</button>
                {subs.map((t, n) => (
                  <button key={t.key} className={sub === t.key ? 'on' : ''} onClick={() => { selectSub(t.key); setMenu(false); }}>{subLabel(t, n)}{subBusy === t.key && ' …'}</button>
                ))}
                <button onClick={() => fileIn.current?.click()}>Add from device…</button>
                {sub !== null && (
                  <>
                    <div className="p-adj"><span>Size</span><button onClick={() => bumpSize(-1)} aria-label="Smaller">A−</button><b>{Math.round(subSize * 100)}%</b><button onClick={() => bumpSize(1)} aria-label="Larger">A+</button></div>
                    <div className="p-adj"><span>Delay</span><button onClick={() => setSubDelay((d) => clamp(Math.round((d - 0.25) * 100) / 100, -30, 30))} aria-label="Earlier">−</button><b>{subDelay > 0 ? '+' : ''}{subDelay.toFixed(2)}s</b><button onClick={() => setSubDelay((d) => clamp(Math.round((d + 0.25) * 100) / 100, -30, 30))} aria-label="Later">+</button></div>
                  </>
                )}
                <div className="p-sep" />
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

      {mini && (
        <>
          <button className="p-mini-btn p-mini-play" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={22} /></button>
          <button className="p-mini-btn p-mini-open" onClick={(e) => { e.stopPropagation(); onExpand?.(); }} aria-label="Expand"><Icon name="full" size={20} /></button>
          <button className="p-mini-btn p-mini-close" onClick={(e) => { e.stopPropagation(); onClose?.(); }} aria-label="Close"><Icon name="close" size={20} /></button>
          <div className="p-mini-bar"><b style={{ width: pct + '%' }} /></div>
        </>
      )}
    </div>
  );
}
