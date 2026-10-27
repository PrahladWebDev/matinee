// Theme registry + persistence. The <html data-theme="…"> attribute drives every colour in styles.css.
export const THEMES = [
  { id: 'cinema',  name: 'Cinema',  bg: '#0e1514', accent: '#dcaa4a', meta: '#0e1514' },
  { id: 'light',   name: 'Light',   bg: '#f4f5f3', accent: '#0f766e', meta: '#f4f5f3' },
  { id: 'nord',    name: 'Nord',    bg: '#2e3440', accent: '#88c0d0', meta: '#2e3440' },
  { id: 'cream',   name: 'Cream',   bg: '#f6eddb', accent: '#b4701f', meta: '#f6eddb' },
  { id: 'vampire', name: 'Vampire', bg: '#1d1e29', accent: '#bd93f9', meta: '#1d1e29' },
  { id: 'forest',  name: 'Forest',  bg: '#0f1a14', accent: '#6fcf8e', meta: '#0f1a14' },
  { id: 'ocean',   name: 'Ocean',   bg: '#0b1622', accent: '#4fb3e8', meta: '#0b1622' },
  { id: 'mocha',   name: 'Mocha',   bg: '#1b1511', accent: '#d9a066', meta: '#1b1511' },
];

const KEY = 'matinee-theme';
const DEFAULT = 'cinema';
const listeners = new Set();

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (THEMES.some((x) => x.id === t)) return t;
  } catch { /* storage blocked */ }
  return DEFAULT;
}

export function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.documentElement.setAttribute('data-theme', t.id);
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = t.meta;
  return t.id;
}

export function setTheme(id) {
  const applied = applyTheme(id);
  try { localStorage.setItem(KEY, applied); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(applied));
}

export function subscribeTheme(fn) { listeners.add(fn); return () => listeners.delete(fn); }
