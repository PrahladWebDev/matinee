import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import ThemeSwitcher from '../components/ThemeSwitcher';
import Player from '../components/Player';
import { fmt } from '../progress';

// Public page for a shared link: one video, no login, no navigation into the library.
export default function Share() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    api.shareInfo(token)
      .then((x) => { setD(x); document.title = x.title + ' · Matinee'; })
      .catch(() => { setGone(true); document.title = 'Link unavailable · Matinee'; });
  }, [token]);

  return (
    <div className="share-page">
      <header className="share-top">
        <span className="logo"><img className="logo-img" src="/logo-nav.png" alt="Matinee" /></span>
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
        <main className="share-main">
          <Player video={{ _id: 'share-' + token.slice(0, 12), title: d.title, hasThumb: false }} src={`/api/share/${token}/stream`} />
          <div className="share-info">
            <h1>{d.title}</h1>
            <p className="muted">
              {d.duration > 0 && <>{fmt(d.duration)} · </>}
              {d.expiresAt ? `Link valid until ${new Date(d.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Shared privately'}
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
