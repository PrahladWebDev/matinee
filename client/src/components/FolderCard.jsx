import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

export default function FolderCard({ f }) {
  const [bad, setBad] = useState(false);
  return (
    <Link to={`/folder/${f._id}`} className="vcard fcard">
      <div className="thumb">
        {f.cover && !bad ? <img loading="lazy" src={`/api/thumb/${f.cover}`} alt="" onError={() => setBad(true)} /> : <div className="ph"><Icon name="folder" size={34} /></div>}
        <div className="fshade" />
        <span className="fcount">{f.videoCount} {f.videoCount === 1 ? 'video' : 'videos'}</span>
      </div>
      <p title={f.name}>{f.name}</p>
    </Link>
  );
}
