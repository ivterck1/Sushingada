const fs = require('node:fs');
const path = require('node:path');
const {escape, loadConfig, synchronize} = require('./sync-seo.cjs');
const {validPhone, validSocialUrl} = require('./business-preview.cjs');

const socialIcons = {
  instagram: {
    label:'Instagram',
    shape:'<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1"/>'
  },
  facebook: {
    label:'Facebook',
    shape:'<path d="M14 21v-8h3l.5-3H14V8c0-1 .3-1.5 1.7-1.5H18V3.8a19 19 0 0 0-2.6-.2C12.8 3.6 11 5.2 11 8v2H8v3h3v8z"/>'
  },
  tiktok: {
    label:'TikTok',
    shape:'<path d="M14 3h3a5 5 0 0 0 4 4v3a8 8 0 0 1-4-1.4V16a5.5 5.5 0 1 1-5.5-5.5h.5v3a2.5 2.5 0 1 0 2 2.5z"/>'
  }
};

function replaceBlock(html, label, lines, indent) {
  const start = `<!-- ${label}:START -->`;
  const end = `<!-- ${label}:END -->`;
  const first = html.indexOf(start);
  const last = html.indexOf(end);
  if (first < 0 || last <= first || html.split(start).length !== 2 || html.split(end).length !== 2) {
    throw new Error(`Bloque ${label} ausente o duplicado.`);
  }
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  return html.slice(0, first + start.length) + eol +
    [...lines.map(line => indent + line), indent].join(eol) + html.slice(last);
}

function synchronizeBusiness(html, {business, contact, images, hero}) {
  html = html.replace(/(<(?:p|span|strong)\b[^>]*\bdata-config="hero\.(eyebrow|title|highlight|description)"[^>]*>)[^<]*(?=<\/)/g,
    (_, open, field) => open + escape(hero[field]));
  html = html.replace(/(<a class="brand"[^>]*\baria-label=")[^"]*(")/,
    (_, start, end) => start + escape(`Inicio de ${business.shortName}`) + end);
  html = html.replace(/(<a class="brand"[^>]*>\s*<img\s+src=")[^"]*("\s+alt=")[^"]*(")/,
    (_, start, separator, end) => start + escape(images.logo) + separator + escape(business.name) + end);
  const lines = [
    '<div>',
    `  <p>${escape(business.name)}</p>`,
    '  <div id="business-contact" role="group" aria-label="Datos de contacto">'
  ];
  for (const field of ['hours', 'address', 'coverage']) {
    if (contact[field]?.trim()) lines.push(`    <p>${escape(contact[field])}</p>`);
  }
  if (validPhone(contact.phone)) {
    lines.push(`    <p><a class="contact-phone" href="tel:${escape(contact.phone)}">${escape(contact.phone)}</a></p>`);
  }

  const links = Object.entries(socialIcons)
    .filter(([field]) => validSocialUrl(field, contact[field]))
    .map(([field, {label, shape}]) => `      <a href="${escape(contact[field])}" target="_blank" rel="noopener noreferrer" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">${shape}</svg></a>`);
  if (links.length) lines.push('    <nav class="footer-social" aria-label="Redes sociales">', ...links, '    </nav>');
  lines.push('  </div>', '</div>',
    `<img class="footer-logo" src="${escape(images.logo)}" alt="" width="230" height="96">`);
  const story = replaceBlock(html, 'BUSINESS-STORY', [`<p>${escape(business.description)}</p>`], '            ');
  return replaceBlock(story, 'BUSINESS-FOOTER', lines, '        ');
}

function synchronizeSite(html, config) {
  return synchronizeBusiness(synchronize(html, config), config);
}

if (require.main === module) {
  try {
    const mode = process.argv[2];
    if (!['--check', '--write'].includes(mode) || process.argv.length !== 3) throw new Error('Usar --check o --write.');
    const file = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(file, 'utf8');
    const next = synchronizeSite(html, loadConfig());
    if (next !== html) {
      if (mode === '--check') throw new Error('HTML comercial desactualizado. Ejecuta npm run menu:business:sync.');
      fs.writeFileSync(file, next);
    }
    console.log('HTML comercial y SEO sincronizados.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {synchronizeBusiness, synchronizeSite};
