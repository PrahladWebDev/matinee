import { Link } from 'react-router-dom';
import Icon from './Icon';
import VideoCard from './VideoCard';

export default function Row({ title, to, videos, onRandom }) {
  return (
    <section className="row">
      <div className="row-h">
        {to ? <Link to={to}><h2>{title}</h2></Link> : <h2>{title}</h2>}
        {onRandom && (
          <button className="chip" onClick={onRandom} title="Play a random video from here">
            <Icon name="shuffle" size={15} /> Random
          </button>
        )}
      </div>
      <div className="row-scroll">
        {videos.map((v) => <VideoCard key={v._id} v={v} />)}
      </div>
    </section>
  );
}
