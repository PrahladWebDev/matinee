import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import VideoCard from './VideoCard';

export default function Row({ title, to, videos, onRandom }) {
  const box = useRef(null);
  const scroller = useRef(null);
  const [seen, setSeen] = useState(false);
  const [edge, setEdge] = useState({ l: false, r: true });

  // reveal the row (and stagger its cards) when it scrolls into view
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 0px -6% 0px' });
    io.observe(box.current);
    return () => io.disconnect();
  }, []);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdge({ l: el.scrollLeft > 8, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update, videos]);

  const go = (d) => scroller.current.scrollBy({ left: d * scroller.current.clientWidth * 0.85, behavior: 'smooth' });

  return (
    <section ref={box} className={`row${seen ? ' in' : ''}`}>
      <div className="row-h">
        {to ? (
          <Link to={to} className="row-title"><h2>{title}</h2><span className="row-more">Explore all <Icon name="chevR" size={16} /></span></Link>
        ) : <div className="row-title"><h2>{title}</h2></div>}
        {onRandom && (
          <button className="chip" onClick={onRandom} title="Play a random video from here">
            <Icon name="shuffle" size={14} /> Random
          </button>
        )}
      </div>
      <div className="row-body">
        <button className={`arrow l${edge.l ? ' show' : ''}`} onClick={() => go(-1)} aria-label="Scroll left"><Icon name="chevL" size={38} /></button>
        <div className="row-scroll" ref={scroller} onScroll={update}>
          {videos.map((v, i) => <VideoCard key={v._id} v={v} i={i} />)}
        </div>
        <button className={`arrow r${edge.r ? ' show' : ''}`} onClick={() => go(1)} aria-label="Scroll right"><Icon name="chevR" size={38} /></button>
      </div>
    </section>
  );
}
