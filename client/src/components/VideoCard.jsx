import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { fmt, getProgress } from '../progress';

export default function VideoCard({ v }) {
  const [bad, setBad] = useState(false);
  const p = getProgress(v._id);
  const pct = p && p.d ? Math.min(100, (p.t / p.d) * 100) : 0;
  return (
    <Link to={`/watch/${v._id}`} className="vcard">
      <div className="thumb">
        {v.hasThumb && !bad ? (
          <img loading="lazy" src={`/api/thumb/${v._id}`} alt="" onError={() => setBad(true)} />
        ) : (
          <div className="ph"><Icon name="play" size={30} /></div>
        )}
        {v.duration > 0 && <span className="dur">{fmt(v.duration)}</span>}
        {pct > 1 && pct < 95 && <i className="prog"><b style={{ width: pct + '%' }} /></i>}
        <div className="hover"><Icon name="play" size={44} /></div>
      </div>
      <p title={v.title}>{v.title}</p>
    </Link>
  );
}
