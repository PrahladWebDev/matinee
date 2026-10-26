import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Player from './Player';
import { store, usePlayerStore } from '../playerStore';

/**
 * The ONE player for the whole app. It never unmounts while you browse, so playback
 * continues. On a Watch page it sits exactly over the page's placeholder; anywhere
 * else it becomes a floating mini-player (YouTube style).
 */
export default function PlayerHost() {
  const { session, slot } = usePlayerStore();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [rect, setRect] = useState(null);

  // no mini-player on the login page or public share pages
  useEffect(() => {
    if (pathname.startsWith('/login') || pathname.startsWith('/s/')) store.set({ session: null, slot: null });
  }, [pathname]);

  // follow the Watch page placeholder (document coordinates, so it scrolls with the page)
  useLayoutEffect(() => {
    if (!slot) { setRect(null); return undefined; }
    const upd = () => {
      const r = slot.getBoundingClientRect();
      const n = { top: Math.round(r.top + window.scrollY), left: Math.round(r.left + window.scrollX), width: Math.round(r.width), height: Math.round(r.height) };
      setRect((p) => (p && p.top === n.top && p.left === n.left && p.width === n.width && p.height === n.height ? p : n));
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(slot);
    ro.observe(document.body);
    window.addEventListener('resize', upd);
    const iv = setInterval(upd, 400);
    return () => { ro.disconnect(); window.removeEventListener('resize', upd); clearInterval(iv); };
  }, [slot]);

  if (!session) return null;
  const docked = !!slot;

  return (
    <div className={`player-host ${docked ? 'docked' : 'mini'}${docked && !rect ? ' hidden' : ''}`} style={docked && rect ? rect : undefined}>
      <Player
        {...session}
        mini={!docked}
        onExpand={() => nav('/watch/' + session.video._id)}
        onClose={() => store.set({ session: null })}
      />
    </div>
  );
}
