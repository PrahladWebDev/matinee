import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import Icon from './Icon';
import { cleanTitle } from '../format';

export default function Navbar() {
  const auth = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const input = useRef(null);
  const timer = useRef();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 30);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes([]); return; }
    timer.current = setTimeout(
      () => api.search(q.trim()).then((r) => { setRes(r.slice(0, 8)); setOpen(true); }).catch(() => {}), 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  const surprise = async () => {
    try { const v = await api.random(); nav('/watch/' + v._id); }
    catch (e) { alert(e.message); }
  };
  const logout = async () => { await api.logout(); await auth.refresh(); nav('/login'); };

  const solid = scrolled || pathname !== '/';
  const expanded = focus || q;

  return (
    <header className={`nav${solid ? ' solid' : ''}`}>
      <Link to="/" className="logo"><span className="logo-mark"><Icon name="play" size={15} /></span><span className="logo-text">Matinee</span></Link>
      <Link to="/" className={`navlink hide-sm${pathname === '/' ? ' on' : ''}`}>Home</Link>
      {auth.authenticated && <Link to="/admin" className={`navlink hide-sm${pathname === '/admin' ? ' on' : ''}`}>Admin</Link>}
      <span className="grow" />

      <div className={`search${expanded ? ' open' : ''}`}>
        <button className="search-ic" aria-label="Search" onClick={() => { setFocus(true); input.current?.focus(); }}><Icon name="search" size={20} /></button>
        <input ref={input} type="search" placeholder="Search videos" value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { setFocus(true); setOpen(true); }}
          onBlur={() => setTimeout(() => { setFocus(false); setOpen(false); }, 160)} />
        {open && res.length > 0 && (
          <div className="search-res">
            {res.map((v) => (
              <Link key={v._id} to={`/watch/${v._id}`} onClick={() => { setOpen(false); setQ(''); }}>{cleanTitle(v.title)}</Link>
            ))}
          </div>
        )}
      </div>

      <button className="btn accent sm" onClick={surprise}><Icon name="shuffle" size={17} /> <span className="hide-xs">Surprise me</span></button>
      {auth.authenticated
        ? <button className="navlink" onClick={logout}>Log out</button>
        : <Link to="/login" className="navlink">Log in</Link>}
    </header>
  );
}
