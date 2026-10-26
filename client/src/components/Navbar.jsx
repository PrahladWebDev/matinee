import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import Icon from './Icon';

export default function Navbar() {
  const auth = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes([]); return; }
    timer.current = setTimeout(() => api.search(q.trim()).then((r) => { setRes(r.slice(0, 8)); setOpen(true); }).catch(() => {}), 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  const surprise = async () => {
    try { const v = await api.random(); nav('/watch/' + v._id); }
    catch (e) { alert(e.message); }
  };
  const logout = async () => { await api.logout(); await auth.refresh(); nav('/login'); };

  return (
    <header className="nav">
      <Link to="/" className="logo"><span className="logo-mark"><Icon name="play" size={16} /></span>Matinee</Link>
      <div className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search videos" value={q} onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && res.length > 0 && (
          <div className="search-res">
            {res.map((v) => (
              <Link key={v._id} to={`/watch/${v._id}`} onClick={() => { setOpen(false); setQ(''); }}>{v.title}</Link>
            ))}
          </div>
        )}
      </div>
      <button className="btn accent" onClick={surprise}><Icon name="shuffle" size={18} /> Surprise me</button>
      {auth.authenticated && <Link to="/admin" className="navlink">Admin</Link>}
      {auth.authenticated ? <button className="navlink" onClick={logout}>Log out</button> : <Link to="/login" className="navlink">Log in</Link>}
    </header>
  );
}
