import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { cleanTitle } from '../format';

export const shareUrl = (token) => `${window.location.origin}/s/${token}`;

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    t.remove();
    return ok;
  }
}

const EXPIRY = [['never', 'Never expires'], ['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days']];
const fmtDate = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Create / copy / stop a public link for one video. video = { _id, title } */
export default function ShareDialog({ video, onClose }) {
  const [st, setSt] = useState(null);
  const [exp, setExp] = useState('never');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getShare(video._id).then((s) => { setSt(s); setExp(s.shared ? 'keep' : 'never'); }).catch((e) => setErr(e.message));
  }, [video._id]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const create = (regenerate = false) => act(async () => {
    setSt(await api.createShare(video._id, { expires: exp === 'keep' ? undefined : exp, regenerate }));
    if (exp === 'keep') setExp('keep');
  });
  const stop = () => act(async () => { await api.revokeShare(video._id); setSt({ shared: false }); setExp('never'); });

  const url = st?.shared ? shareUrl(st.token) : '';
  const copy = async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600); } };
  const nativeShare = () => navigator.share?.({ title: cleanTitle(video.title), text: cleanTitle(video.title), url }).catch(() => {});
  const wa = `https://wa.me/?text=${encodeURIComponent(`${cleanTitle(video.title)}\n${url}`)}`;
  const expired = st?.expiresAt && new Date(st.expiresAt) < new Date();

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Share video" onKeyDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Share this video</h2>
            <p className="muted modal-sub" title={video.title}>{cleanTitle(video.title)}</p>
          </div>
          <button className="round-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>

        {!st && !err && <div className="sk" style={{ height: 90 }} />}

        {st && !st.shared && (
          <>
            <p className="muted">Anyone with the link can watch <b>only this video</b>, without logging in. They can’t see the rest of your library.</p>
            <label>Link expires
              <select value={exp} onChange={(e) => setExp(e.target.value)}>
                {EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <button className="btn accent" disabled={busy} onClick={() => create(false)}><Icon name="link" size={18} /> {busy ? 'Creating…' : 'Create share link'}</button>
          </>
        )}

        {st?.shared && (
          <>
            <div className="linkbox">
              <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Share link" />
              <button className={`btn accent${copied ? ' done' : ''}`} onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={18} /> {copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div className="share-actions">
              <a className="btn" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
              {navigator.share && <button className="btn" onClick={nativeShare}><Icon name="share" size={18} /> Share…</button>}
            </div>
            <p className={`share-meta${expired ? ' error-text' : ' muted'}`}>
              {expired ? 'This link has expired. Choose a new expiry and update it below.'
                : st.expiresAt ? `Expires ${fmtDate(st.expiresAt)}` : 'Never expires'}
              {' · '}{st.views} {st.views === 1 ? 'view' : 'views'}
            </p>
            <label>Change expiry
              <select value={exp} onChange={(e) => setExp(e.target.value)}>
                <option value="keep">Keep as it is</option>
                {EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}{v !== 'never' ? ' from now' : ''}</option>)}
              </select>
            </label>
            <div className="share-actions">
              <button className="btn" disabled={busy || exp === 'keep'} onClick={() => create(false)}>Update expiry</button>
              <button className="btn" disabled={busy} onClick={() => confirm('Make a new link? The old link will stop working.') && create(true)}>New link</button>
              <span className="grow" />
              <button className="btn danger" disabled={busy} onClick={stop}>Stop sharing</button>
            </div>
          </>
        )}

        {err && <div className="error">{err}</div>}
      </div>
    </div>
  );
}
