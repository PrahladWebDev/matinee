/** Brand logo. Renders a light-wordmark version for dark themes and a dark-wordmark version for the light themes (CSS picks one). */
export default function Logo({ variant = 'nav' }) {
  const full = variant === 'full';
  const base = full ? 'logo-v3' : 'logo-nav-v3';
  const cls = full ? 'login-logo' : 'logo-img';
  return (
    <>
      <img className={`${cls} lg-dk`} src={`/${base}.png`} alt="Matinee" draggable="false" />
      <img className={`${cls} lg-lt`} src={`/${base}-light.png`} alt="" aria-hidden="true" loading="lazy" draggable="false" />
    </>
  );
}
