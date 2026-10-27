import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

export default function FolderCard({ f, i = 0 }) {
  const [bad, setBad] = useState(false);
  return (
    <Link to={`/folder/${f._id}`} className="vcard fcard" style={{ '--i': Math.min(i, 14) }}>
      <div className="thumb">
        {f.cover && !bad && !f.locked ? <img loading="lazy" src={`/api/thumb/${f.cover}`} alt="" onError={() => setBad(true)} /> : <div className="ph"><Icon name={f.locked ? 'lock' : 'folder'} size={34} /></div>}
        <div className="fshade" />
        {f.isPrivate && <span className="lockbadge" title={f.locked ? 'Locked: PIN needed' : 'Private folder'}><Icon name="lock" size={13} /> {f.locked ? 'Locked' : 'Private'}</span>}
        <span className="fname">{f.name}</span>
        <span className="fcount"><Icon name={f.locked ? 'lock' : 'folder'} size={13} /> {f.locked ? 'Enter PIN to open' : `${f.videoCount} ${f.videoCount === 1 ? 'video' : 'videos'}`}</span>
      </div>
    </Link>
  );
}
