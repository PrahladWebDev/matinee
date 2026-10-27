import { useEffect, useRef, useState } from 'react';
import { THEMES, getTheme, setTheme, subscribeTheme } from '../theme';
import Icon from './Icon';

/** Palette button + popover listing every theme. Used in the navbar, the phone tab bar, login and share pages. */
export default function ThemeSwitcher({ className = 'ico' }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(getTheme());
  const box = useRef(null);

  useEffect(() => subscribeTheme(setCur), []);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="theme-wrap" ref={box}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} aria-label="Change theme" aria-expanded={open} title="Theme">
        <Icon name="palette" size={25} />
      </button>
      {open && (
        <div className="theme-pop" role="menu">
          <h4>Theme</h4>
          {THEMES.map((t) => (
            <button key={t.id} type="button" role="menuitemradio" aria-checked={cur === t.id}
              className={`theme-opt${cur === t.id ? ' on' : ''}`} onClick={() => { setTheme(t.id); setOpen(false); }}>
              <span className="sw"><i style={{ background: t.bg }} /><b style={{ background: t.accent }} /></span>
              <span className="nm">{t.name}</span>
              {cur === t.id && <span className="tick"><Icon name="check" size={18} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
