export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Puts title + preview image into the SPA's index.html so WhatsApp/Telegram/etc. show a card.
export function injectOg(html, { title, url, image }) {
  const t = escapeHtml(title);
  const tags = [
    `<meta property="og:type" content="video.other" />`,
    `<meta property="og:site_name" content="Matinee" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="Shared with you on Matinee" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="robots" content="noindex, nofollow" />`,
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t} · Matinee</title>`)
    .replace('</head>', `    ${tags}\n  </head>`);
}
