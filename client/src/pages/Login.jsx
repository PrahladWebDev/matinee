import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import ThemeSwitcher from '../components/ThemeSwitcher';
import Logo from '../components/Logo';
import '../login-video.css';

export default function Login() {
  const auth = useAuth();
  const nav = useNavigate();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.login(u, p); await auth.refresh(); nav('/'); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="login has-video">
      <video className="login-video" src="/login-bg.mp4" poster="/login-bg-poster.jpg" autoPlay muted loop playsInline preload="auto" />
      <div className="login-video-shade" />
      <div className="theme-fab"><ThemeSwitcher /></div>
      <form onSubmit={submit} className="login-card">
        <Logo variant="full" />
        <p className="muted">Your own screening room. Sign in to start watching.</p>
        <label>Username<input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus /></label>
        <label>Password<input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn accent wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
