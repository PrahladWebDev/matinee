export function HeroSkeleton() {
  return (
    <div className="hero2 sk-hero">
      <div className="hero2-copy">
        <div className="sk sk-line w30" />
        <div className="sk sk-title" />
        <div className="sk sk-line w60" />
        <div className="sk sk-btns" />
      </div>
    </div>
  );
}

export function RowSkeleton({ n = 8 }) {
  return (
    <div className="row in">
      <div className="sk sk-line w20" />
      <div className="row-scroll">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="vcard" style={{ opacity: 1, animation: 'none' }}><div className="thumb sk" /></div>
        ))}
      </div>
    </div>
  );
}
