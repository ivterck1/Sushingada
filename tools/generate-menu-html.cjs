const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./sync-seo.cjs');

const root = path.resolve(__dirname, '..');
const start = '<!-- MENU:START (generado por npm run menu:html:sync) -->';
const end = '<!-- MENU:END -->';
const indent = '              ';
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function readMenu(source) {
  const match = source.match(/^\s*(?:\/\/[^\r\n]*\s*)*const menuItems\s*=\s*([\s\S]+);\s*$/);
  if (!match) throw new Error('Formato de menu-data.js inválido.');
  return JSON.parse(match[1]);
}

function relativeImage(source) {
  if (!/^(?:[\w-]+\/)+[\w.-]+\.(?:webp|png|jpe?g|svg)(?:\?v=[\w.-]+)?$/i.test(source)) {
    throw new Error(`Ruta de imagen inválida: ${source}`);
  }
  return escape(source);
}

function renderMenuHtml(items, fallback, order) {
  if (!Array.isArray(items)) throw new Error('El catálogo debe ser un arreglo.');
  const groups = new Map();
  const ids = new Set();
  const anchors = new Set();
  const fallbackSrc = relativeImage(fallback);
  const formatter = order?.pricesApproved === true ? new Intl.NumberFormat(order.locale, {
    style:'currency', currency:order.currency
  }) : null;
  for (const item of items) {
    if (typeof item.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) {
      throw new Error(`ID inválido o duplicado: ${item.id}`);
    }
    ids.add(item.id);
    const category = item.categoria.trim();
    if (!category) throw new Error(`Categoría vacía: ${item.id}`);
    if (!groups.has(category)) {
      const slug = category.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const anchor = `menu-categoria-${slug || 'grupo'}`;
      let unique = anchor;
      for (let n = 2; anchors.has(unique); n++) unique = `${anchor}-${n}`;
      anchors.add(unique);
      groups.set(category, { id: unique, items: [] });
    }
    if (item.disponible) groups.get(category).items.push(item);
  }
  const lines = [];
  if (!groups.size) return '<p class="menu-empty">No hay productos disponibles.</p>';
  lines.push('<nav class="menu-category-index" aria-label="Índice de categorías">', '  <ul>');
  for (const [name, group] of groups) lines.push(`    <li><a href="#${group.id}">${escape(name)}</a></li>`);
  lines.push('  </ul>', '</nav>');
  for (const [name, group] of groups) {
    lines.push(`<section id="${group.id}" class="menu-category" data-menu-category="${escape(name)}" aria-labelledby="${group.id}-titulo">`,
      `  <h3 id="${group.id}-titulo">${escape(name)}</h3>`, '  <div class="menu-category-cards">');
    if (!group.items.length) lines.push('    <p class="menu-empty">No hay productos disponibles en esta categoría.</p>');
    for (const item of group.items) {
      const name = escape(item.nombre);
      const photo = item.imagen?.trim();
      const src = photo ? relativeImage(photo) : fallbackSrc;
      lines.push(`    <article class="menu-card" data-menu-product-id="${item.id}">`,
        `      <div class="dish-image"><img src="${src}" alt="${name}" loading="lazy" width="640" height="480"${src === fallbackSrc ? ' data-image-state="fallback"' : ''}></div>`,
        '      <div class="dish-content">',
        `        <h4>${name}</h4>`,
        `        <p>${escape(item.descripcion)}</p>`,
        `        <div class="dish-footer"><p class="price">${formatter ? escape(formatter.format(item.precio)) : 'Precio pendiente'}</p></div>`,
        '      </div>', '    </article>');
    }
    lines.push('  </div>', '</section>');
  }
  return lines.join('\n');
}

function synchronizeMenu(html, items, fallback, order) {
  const first = html.indexOf(start);
  const last = html.indexOf(end);
  if (first < 0 || last <= first || html.split(start).length !== 2 || html.split(end).length !== 2) {
    throw new Error('Bloque de catálogo ausente o duplicado.');
  }
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const block = renderMenuHtml(items, fallback, order).split('\n').map(line => indent + line).join(eol);
  return html.slice(0, first + start.length) + eol + block + eol + indent + html.slice(last);
}

if (require.main === module) {
  try {
    const mode = process.argv[2] || '--check';
    if (!['--check', '--write'].includes(mode) || process.argv.length > 3) throw new Error('Usar --check o --write.');
    const file = path.join(root, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const items = readMenu(fs.readFileSync(path.join(root, 'js/menu-data.js'), 'utf8'));
    const config = loadConfig();
    const next = synchronizeMenu(html, items, config.images.productPlaceholder, config.order);
    if (next !== html) {
      if (mode === '--check') throw new Error('Catálogo HTML desactualizado. Ejecuta npm run menu:html:sync.');
      fs.writeFileSync(file, next);
    }
    console.log('Catálogo HTML sincronizado.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { readMenu, renderMenuHtml, synchronizeMenu };
