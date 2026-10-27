import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Icon from './Icon';

/** Full-page lock screen for private folders. Nothing from the folder is loaded until the PIN is right. */
export default function PinGate({ onUnlocked }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const nav = useNavigate();

  useEffect(() => { input.current?.focus(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true); setErr('');
    try { await api.unlockPrivate(pin); onUnlocked(); }
    catch (x) { setErr(x.message); setPin(''); input.current?.focus(); }
    setBusy(false);
  };

  return (
    <div className="page pin-page">
      <form className="pin-card" onSubmit={submit}>
        <span className="pin-ico"><Icon name="lock" size={30} /></span>
        <h1>Private folder</h1>
        <p className="muted">Enter your PIN to open it. Until then, its videos and pictures stay hidden.</p>
        <input ref={input} className="pin-input" type="password" inputMode="text" autoComplete="off" maxLength={32}
          placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" />
        {err && <div className="error">{err}</div>}
        <button className="btn accent wide" disabled={busy || !pin}>{busy ? 'Checking…' : 'Unlock'}</button>
        <button type="button" className="link" onClick={() => nav('/')}>Back to Home</button>
      </form>
    </div>
  );
}
