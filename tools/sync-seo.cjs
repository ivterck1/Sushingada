const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const START = '<!-- SEO:START (generado desde js/config.js; npm run seo:sync) -->';
const END = '<!-- SEO:END -->';
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderSeo(config, eol = '\n') {
  const seo = config.seo;
  if (!seo?.title?.trim() || !seo.description?.trim() || !config.business?.name?.trim()) {
    throw new Error('Faltan título, descripción SEO o nombre comercial.');
  }
  if (!['noindex,follow', 'index,follow'].includes(seo.robots)) {
    throw new Error('seo.robots debe ser noindex,follow o index,follow.');
  }
  if (!/^[a-z]{2}_[A-Z]{2}$/.test(seo.locale || '')) throw new Error('Configurar seo.locale, por ejemplo es_MX.');
  const canonical = seo.canonicalUrl?.trim() || '';
  if (seo.robots === 'noindex,follow' && canonical) {
    throw new Error('La demo noindex debe conservar canonicalUrl vacío.');
  }
  if (seo.robots === 'index,follow' && !canonical) {
    throw new Error('Antes de indexar, confirmar seo.canonicalUrl del sitio comercial.');
  }
  if (canonical) {
    const url = new URL(canonical);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Canonical debe ser una URL HTTPS absoluta, sin credenciales, query ni hash.');
    }
  }
  const meta = (attribute, name, content) => `    <meta ${attribute}="${name}" content="${escape(content)}">`;
  const lines = [
    `    <title>${escape(seo.title)}</title>`,
    meta('name', 'description', seo.description),
    meta('name', 'robots', seo.robots),
    meta('property', 'og:title', seo.title),
    meta('property', 'og:description', seo.description),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', config.business.name),
    meta('property', 'og:locale', seo.locale),
    // Vista previa textual provisional, sin prometer una imagen inexistente.
    meta('name', 'twitter:card', 'summary'),
    meta('name', 'twitter:title', seo.title),
    meta('name', 'twitter:description', seo.description),
  ];
  if (canonical) lines.push(`    <link rel="canonical" href="${escape(canonical)}">`,
    meta('property', 'og:url', canonical));
  return lines.join(eol);
}

function synchronize(html, config) {
  if (html.split(START).length !== 2 || html.split(END).length !== 2
      || html.indexOf(END) < html.indexOf(START)) throw new Error('Bloque SEO ausente o duplicado.');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  return html.slice(0, html.indexOf(START) + START.length) + eol + renderSeo(config, eol)
    + eol + '    ' + html.slice(html.indexOf(END));
}

function loadConfig(root = ROOT, source = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8')) {
  return vm.runInNewContext(source + '\nsiteConfig;', {}, { timeout: 1000 });
}

if (require.main === module) {
  try {
    const mode = process.argv[2] || '--check';
    if (!['--write', '--check'].includes(mode) || process.argv.length > 3) throw new Error('Usar --check o --write.');
    const file = path.join(ROOT, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const next = synchronize(html, loadConfig());
    if (next !== html) {
      if (mode === '--check') throw new Error('HTML SEO desactualizado: ejecutar npm run seo:sync.');
      fs.writeFileSync(file, next);
    }
    console.log(mode === '--check' ? 'SEO inicial sincronizado.' : 'Bloque SEO sincronizado; resto del HTML conservado.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { renderSeo, synchronize, loadConfig, escape };
