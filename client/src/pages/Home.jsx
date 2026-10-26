import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import Icon from '../components/Icon';
import Row from '../components/Row';
import { continueList } from '../progress';

export default function Home() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const auth = useAuth();
  const resume = continueList();

  useEffect(() => { api.home().then(setData).catch((e) => setErr(e.message)); document.title = 'Matinee'; }, []);

  const surprise = async (folder) => {
    try { const v = await api.random(folder); nav('/watch/' + v._id); } catch (e) { alert(e.message); }
  };

  if (err) return <div className="page"><div className="error">{err}</div></div>;
  if (!data) return <div className="page muted">Loading…</div>;

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>What are we watching tonight?</h1>
          <p className="muted">{data.total} {data.total === 1 ? 'video' : 'videos'} in your library.</p>
        </div>
        <div className="hero-actions">
          <button className="btn accent big" onClick={() => surprise()} disabled={!data.total}><Icon name="shuffle" size={20} /> Play something random</button>
          {resume[0] && <Link className="btn big" to={`/watch/${resume[0].id}`}><Icon name="play" size={20} /> Resume “{resume[0].title.length > 28 ? resume[0].title.slice(0, 28) + '…' : resume[0].title}”</Link>}
        </div>
      </section>

      {!data.total && (
        <div className="empty">
          <h2>Nothing here yet</h2>
          <p>{auth.authenticated ? <>Open <Link to="/admin">Admin</Link> to create a folder and upload your first video.</> : 'Log in to add videos.'}</p>
        </div>
      )}

      {resume.length > 0 && (
        <Row title="Continue watching" videos={resume.map((p) => ({ _id: p.id, title: p.title, duration: p.d, hasThumb: p.thumb }))} />
      )}
      {data.recent.length > 0 && <Row title="Recently added" videos={data.recent} />}
      {data.rows.map((r) => (
        <Row key={r.folder._id} title={r.folder.name} to={`/folder/${r.folder._id}`} videos={r.videos} onRandom={() => surprise(r.folder._id)} />
      ))}
      {data.loose.length > 0 && <Row title="More videos" videos={data.loose} />}
    </div>
  );
}
