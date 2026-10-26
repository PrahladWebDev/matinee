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
  const hideTabs = pathname.startsWith('/watch');

  // phones get a bottom tab bar (hidden while watching); reserve room for it
  useEffect(() => {
    document.body.classList.toggle('has-tabbar', !hideTabs);
    return () => document.body.classList.remove('has-tabbar');
  }, [hideTabs]);

  // icon-only navigation, shared by the desktop header and the mobile tab bar
  const icons = (
    <>
      <Link to="/" className={`ico${pathname === '/' ? ' on' : ''}`} aria-label="Home" title="Home"><Icon name="home" size={26} /></Link>
      <button className="ico" onClick={surprise} aria-label="Surprise me" title="Surprise me"><Icon name="shuffle" size={26} /></button>
      {auth.authenticated && <Link to="/admin" className={`ico${pathname === '/admin' ? ' on' : ''}`} aria-label="Admin" title="Admin"><Icon name="dashboard" size={25} /></Link>}
      {auth.authenticated
        ? <button className="ico" onClick={logout} aria-label="Log out" title="Log out"><Icon name="logout" size={25} /></button>
        : <Link to="/login" className="ico" aria-label="Log in" title="Log in"><Icon name="login" size={26} /></Link>}
    </>
  );

  return (
    <>
      <header className={`nav${solid ? ' solid' : ''}`}>
        <Link to="/" className="logo" aria-label="Matinee"><img className="logo-img" src="/logo-nav.png" alt="Matinee" /></Link>
        <span className="grow" />

        <div className={`search${expanded ? ' open' : ''}`}>
          <button className="search-ic" aria-label="Search" onClick={() => { setFocus(true); input.current?.focus(); }}><Icon name="search" size={24} /></button>
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

        <div className="nav-icons">{icons}</div>
      </header>

      {!hideTabs && <nav className="tabbar" aria-label="Main">{icons}</nav>}
    </>
  );
}
