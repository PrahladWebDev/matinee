import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import ThemeSwitcher from '../components/ThemeSwitcher';
import Player from '../components/Player';
import { cleanTitle } from '../format';
import { fmt } from '../progress';
import '../sharefolder.css';

// Public page for a shared folder: its videos and sub-folders, no login, nothing outside the folder.
export default function ShareFolder() {
  const { token } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const sub = sp.get('f') || '';
  const vid = sp.get('v') || '';
  const [d, setD] = useState(null);
  const [gone, setGone] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
    api.shareFolderInfo(token, sub)
      .then((x) => { setD(x); document.title = x.root.name + ' · Matinee'; })
      .catch((e) => { if (e.status === 404 && sub && d) setMissing(true); else { setGone(true); document.title = 'Link unavailable · Matinee'; } });
  }, [token, sub]); // eslint-disable-line

  useEffect(() => { if (vid) window.scrollTo(0, 0); }, [vid]);

  const base = `/sf/${token}`;
  const here = d && String(d.folder._id) !== String(d.root._id) ? d.folder._id : '';
  const linkTo = (o) => {
    const q = new URLSearchParams();
    if (o.f) q.set('f', o.f);
    if (o.v) q.set('v', o.v);
    const s = q.toString();
    return base + (s ? '?' + s : '');
  };

  const videos = d?.videos || [];
  const i = useMemo(() => videos.findIndex((v) => String(v._id) === vid), [videos, vid]);
  const cur = i >= 0 ? videos[i] : null;
  const prev = i > 0 ? videos[i - 1] : null;
  const next = i >= 0 && i < videos.length - 1 ? videos[i + 1] : null;
  const go = (v) => v && nav(linkTo({ f: here, v: v._id }));

  return (
    <div className="share-page">
      <header className="share-top">
        <span className="logo"><img className="logo-img" src="/logo-nav-v2.png" alt="Matinee" /></span>
        <ThemeSwitcher />
        <span className="share-tag"><Icon name="link" size={15} /> Shared with you</span>
      </header>

      {gone && (
        <div className="share-gone">
          <h1>This link isn’t available</h1>
          <p className="muted">It may have expired, or the person who shared it turned it off. Ask them to send you a new one.</p>
        </div>
      )}

      {!gone && !d && <div className="share-main"><div className="sk" style={{ aspectRatio: '16/9', borderRadius: 16 }} /></div>}

      {d && (
        <main className="share-main sf-main">
          {cur && (
            <section className="sf-player">
              <Player
                video={{ _id: 'sharef-' + cur._id, title: cur.title, hasThumb: false }}
                src={`/api/sharef/${token}/v/${cur._id}/stream`}
                onNext={next ? () => go(next) : undefined}
                onPrev={prev ? () => go(prev) : undefined}
                upNext={next ? { title: cleanTitle(next.title) } : undefined}
                onPlayUpNext={() => go(next)}
              />
              <div className="share-info">
                <h1>{cur.title}</h1>
                <p className="muted">{cur.duration > 0 && <>{fmt(cur.duration)} · </>}{d.folder.name}</p>
              </div>
            </section>
          )}

          <nav className="crumbs sf-crumbs">
            {d.breadcrumbs.map((c, n) => (
              <span key={c._id}>{n > 0 && '/ '}{n === d.breadcrumbs.length - 1 && !cur ? c.name : <Link to={linkTo({ f: n === 0 ? '' : c._id })}>{c.name}</Link>}</span>
            ))}
          </nav>
          {!cur && (
            <div className="sf-head">
              <h1>{d.folder.name}</h1>
              <p className="muted">
                {d.total} {d.total === 1 ? 'video' : 'videos'}
                {d.expiresAt && ` · Link valid until ${new Date(d.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </p>
              {videos[0] && <Link className="btn accent" to={linkTo({ f: here, v: videos[0]._id })}><Icon name="play" size={20} /> Play from start</Link>}
            </div>
          )}
          {missing && <div className="error">That folder isn’t part of this link.</div>}

          {d.folders.length > 0 && (
            <>
              <h2 className="sec-title">Folders</h2>
              <div className="grid">
                {d.folders.map((f, n) => (
                  <Link key={f._id} to={linkTo({ f: f._id })} className="vcard fcard" style={{ '--i': Math.min(n, 14) }}>
                    <div className="thumb">
                      {f.cover ? <img loading="lazy" src={`/api/sharef/${token}/v/${f.cover}/thumb`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <div className="ph"><Icon name="folder" size={34} /></div>}
                      <div className="fshade" />
                      <span className="fname">{f.name}</span>
                      <span className="fcount"><Icon name="folder" size={13} /> {f.videoCount} {f.videoCount === 1 ? 'video' : 'videos'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {videos.length > 0 && (
            <>
              <h2 className="sec-title">Videos</h2>
              <div className="grid">
                {videos.map((v, n) => (
                  <Link key={v._id} to={linkTo({ f: here, v: v._id })} className={`vcard${String(v._id) === vid ? ' sf-on' : ''}`} style={{ '--i': Math.min(n, 14) }}>
                    <div className="thumb">
                      {v.hasThumb ? <img loading="lazy" src={`/api/sharef/${token}/v/${v._id}/thumb`} alt="" /> : <div className="ph"><Icon name="play" size={30} /></div>}
                      {v.duration > 0 && <span className="dur">{fmt(v.duration)}</span>}
                      <div className="t-info"><span className="round"><Icon name="play" size={18} /></span></div>
                    </div>
                    <p title={v.title}>{cleanTitle(v.title)}</p>
                  </Link>
                ))}
              </div>
            </>
          )}

          {!d.folders.length && !videos.length && <div className="empty"><p>This folder is empty.</p></div>}
        </main>
      )}
    </div>
  );
}
