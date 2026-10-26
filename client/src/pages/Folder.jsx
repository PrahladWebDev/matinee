import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import FolderCard from '../components/FolderCard';
import VideoCard from '../components/VideoCard';

export default function Folder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null); setErr('');
    window.scrollTo(0, 0);
    api.folder(id).then((d) => { setData(d); document.title = d.folder.name + ' · Matinee'; }).catch((e) => setErr(e.message));
  }, [id]);

  const surprise = async () => {
    try { const v = await api.random(id); nav('/watch/' + v._id); } catch (e) { alert(e.message); }
  };

  if (err) return <div className="page"><div className="error">{err}</div></div>;
  if (!data) return <div className="page"><div className="sk sk-title" /><div className="grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="thumb sk" />)}</div></div>;

  const cover = data.videos.find((v) => v.hasThumb)?._id || data.folders.find((f) => f.cover)?.cover;
  const total = data.videos.length + data.folders.reduce((n, f) => n + f.videoCount, 0);

  return (
    <div className="folder-page">
      <header className="fhero">
        {cover && <img className="fhero-bg" src={`/api/poster/${cover}`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        <div className="fhero-shade" />
        <div className="fhero-copy">
          <nav className="crumbs">
            <Link to="/">Library</Link>
            {data.breadcrumbs.map((c, i) => (
              <span key={c._id}>/ {i === data.breadcrumbs.length - 1 ? c.name : <Link to={`/folder/${c._id}`}>{c.name}</Link>}</span>
            ))}
          </nav>
          <h1>{data.folder.name}</h1>
          {data.folder.isPrivate && <p className="private-note"><Icon name="lock" size={14} /> Private folder — hidden from Home, search and random shuffle. Videos play only from here.</p>}
          <p className="muted">{total} {total === 1 ? 'video' : 'videos'}{data.folders.length > 0 && ` · ${data.folders.length} ${data.folders.length === 1 ? 'folder' : 'folders'}`}</p>
          <div className="hero-actions">
            {(data.videos[0] || total > 0) && (
              data.videos[0]
                ? <Link className="btn accent big" to={`/watch/${data.videos[0]._id}`}><Icon name="play" size={22} /> Play from start</Link>
                : null
            )}
            <button className="btn glass big" onClick={surprise} disabled={!total}><Icon name="shuffle" size={20} /> Random from here</button>
          </div>
        </div>
      </header>

      <div className="page inner">
        {data.folders.length > 0 && (
          <>
            <h2 className="sec-title">Folders</h2>
            <div className="grid">{data.folders.map((f, i) => <FolderCard key={f._id} f={f} i={i} />)}</div>
          </>
        )}
        {data.videos.length > 0 && (
          <>
            <h2 className="sec-title">Videos</h2>
            <div className="grid">{data.videos.map((v, i) => <VideoCard key={v._id} v={v} i={i} />)}</div>
          </>
        )}
        {!data.folders.length && !data.videos.length && <div className="empty"><p>This folder is empty.</p></div>}
      </div>
    </div>
  );
}
