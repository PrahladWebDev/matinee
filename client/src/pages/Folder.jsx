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
    api.folder(id).then((d) => { setData(d); document.title = d.folder.name + ' · Matinee'; }).catch((e) => setErr(e.message));
  }, [id]);

  const surprise = async () => {
    try { const v = await api.random(id); nav('/watch/' + v._id); } catch (e) { alert(e.message); }
  };

  if (err) return <div className="page"><div className="error">{err}</div></div>;
  if (!data) return <div className="page muted">Loading…</div>;

  return (
    <div className="page">
      <nav className="crumbs">
        <Link to="/">Library</Link>
        {data.breadcrumbs.map((c, i) => (
          <span key={c._id}>/ {i === data.breadcrumbs.length - 1 ? c.name : <Link to={`/folder/${c._id}`}>{c.name}</Link>}</span>
        ))}
      </nav>
      <div className="folder-head">
        <h1>{data.folder.name}</h1>
        <div className="hero-actions">
          {data.videos[0] && <Link className="btn accent" to={`/watch/${data.videos[0]._id}`}><Icon name="play" size={18} /> Play from start</Link>}
          <button className="btn" onClick={surprise}><Icon name="shuffle" size={18} /> Random from here</button>
        </div>
      </div>

      {data.folders.length > 0 && <div className="grid">{data.folders.map((f) => <FolderCard key={f._id} f={f} />)}</div>}
      {data.videos.length > 0 && <div className="grid">{data.videos.map((v) => <VideoCard key={v._id} v={v} />)}</div>}
      {!data.folders.length && !data.videos.length && <div className="empty"><p>This folder is empty.</p></div>}
    </div>
  );
}
