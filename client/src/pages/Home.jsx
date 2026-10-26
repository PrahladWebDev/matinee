import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import Hero from '../components/Hero';
import Row from '../components/Row';
import { HeroSkeleton, RowSkeleton } from '../components/Skeleton';
import { continueList } from '../progress';
import { useMyList } from '../mylist';

// pick up to 5 featured videos (prefer ones that have a thumbnail), shuffled
function pickFeatured(data) {
  const pool = [];
  data.rows.forEach((r) => r.videos.forEach((v) => pool.push({ ...v, folderId: r.folder._id, folderName: r.folder.name })));
  data.loose.forEach((v) => pool.push(v));
  const seen = new Set();
  const uniq = pool.filter((v) => (seen.has(v._id) ? false : (seen.add(v._id), true)));
  const good = uniq.filter((v) => v.hasThumb);
  const src = good.length >= 3 ? good : uniq;
  for (let i = src.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [src[i], src[j]] = [src[j], src[i]];
  }
  return src.slice(0, 5);
}

export default function Home() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const auth = useAuth();
  const resume = continueList();
  const myList = useMyList();

  useEffect(() => {
    document.title = 'Matinee';
    api.home().then(setData).catch((e) => setErr(e.message));
  }, []);

  const featured = useMemo(() => (data ? pickFeatured(data) : []), [data]);

  const surprise = async (folder) => {
    try { const v = await api.random(typeof folder === 'string' ? folder : undefined); nav('/watch/' + v._id); }
    catch (e) { alert(e.message); }
  };

  if (err) return <div className="page"><div className="error">{err}</div></div>;
  if (!data) {
    return (
      <div className="home">
        <HeroSkeleton />
        <div className="rows"><RowSkeleton /><RowSkeleton /></div>
      </div>
    );
  }

  return (
    <div className="home">
      {data.rows.length > 0 && (
        <div className="chips">
          {data.rows.map((r) => <Link key={r.folder._id} to={`/folder/${r.folder._id}`}>{r.folder.name}</Link>)}
        </div>
      )}
      {featured.length > 0 ? <Hero items={featured} onRandom={() => surprise()} /> : <div className="home-top" />}

      {!data.total && (
        <div className="empty">
          <h2>Your screen is empty</h2>
          <p>{auth.authenticated ? <>Open <Link to="/admin">Admin</Link> to create a folder and add your first video.</> : 'Log in to add videos.'}</p>
        </div>
      )}

      <div className="rows">
        {resume.length > 0 && (
          <Row title="Continue Watching" videos={resume.map((p) => ({ _id: p.id, title: p.title, duration: p.d, hasThumb: p.thumb }))} />
        )}
        {myList.length > 0 && <Row title="My List" videos={myList} />}
        {data.recent.length > 0 && <Row title="Recently added" videos={data.recent} />}
        {data.rows.map((r) => (
          <Row key={r.folder._id} title={r.folder.name} to={`/folder/${r.folder._id}`} videos={r.videos} onRandom={() => surprise(r.folder._id)} />
        ))}
        {data.loose.length > 0 && <Row title="More videos" videos={data.loose} />}
      </div>
    </div>
  );
}
