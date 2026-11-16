import { useEffect } from 'react';
import '../bgvideo.css';

export default function BgVideo() {
  useEffect(() => {
    document.body.classList.add('has-bgvideo');
    return () => document.body.classList.remove('has-bgvideo');
  }, []);
  return (
    <>
      <video className="bg-video" src="/login-bg.mp4" poster="/login-bg-poster.jpg" autoPlay muted loop playsInline preload="auto" />
      <div className="bg-video-shade" />
    </>
  );
}
