const fs = require('node:fs');
const path = require('node:path');
const {escape, loadConfig} = require('./sync-seo.cjs');

function synchronizePromotions(html, promotions) {
  const ids = new Set();
  for (const {id, order, enabled, link} of promotions) {
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id) || !Number.isFinite(order) ||
        typeof enabled !== 'boolean' || link !== '#menu') {
      throw new Error('Configuración inválida de campaña: ' + id);
    }
    ids.add(id);
  }
  const active = promotions.filter(campaign => campaign.enabled).sort((a, b) => a.order - b.order);
  const photo = ({src, alt}, className) =>
    `<img class="${className}" src="${escape(src)}" alt="${escape(alt)}" width="1440" height="1080" loading="lazy" decoding="async">`;
  const panels = active.map((campaign, index) => {
    const title = `campaign-${campaign.id}`;
    return [
      `<article class="promotion-layout" data-campaign="${campaign.id}" aria-labelledby="${title}" ${index === 0 ? 'data-active' : 'inert aria-hidden="true"'}>`,
      `  <div class="promotion-photos"${campaign.secondary ? ' data-pair' : ''}>`,
      '    ' + photo(campaign.image, 'promotion-photo'),
      ...(campaign.secondary ? ['    ' + photo(campaign.secondary, 'promotion-detail')] : []),
      '  </div>',
      '  <div class="promotions-copy">',
      '    <img class="promotions-art" src="assets/images/brand/faroles-sakura.webp" alt="" width="480" height="640" loading="lazy" decoding="async">',
      `    <p class="promotion-label">${escape(campaign.label)}</p>`,
      `    <p class="promotion-name">${escape(campaign.name)}</p>`,
      `    <h3 id="${title}">${campaign.headline.map(escape).join('<br>')}</h3>`,
      ...(campaign.message ? [`    <p class="promotion-message">${escape(campaign.message)}</p>`] : []),
      `    <p class="promotion-description">${escape(campaign.description)}</p>`,
      ...(campaign.status ? [`    <p class="promotion-status">${escape(campaign.status)}</p>`] : []),
      `    <a class="button promotion-link" href="${campaign.link}">Explorar menú <span aria-hidden="true">→</span></a>`,
      '  </div>',
      '</article>'
    ];
  });
  const block = /(^[ \t]*)<!-- PROMOTIONS:START -->[\s\S]*?<!-- PROMOTIONS:END -->/gm;
  if ([...html.matchAll(block)].length !== 1) throw new Error('Se requiere un bloque PROMOTIONS.');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  return html.replace(block, (_, indent) => [
    '<!-- PROMOTIONS:START -->',
    ...(panels.length ? panels.flat() : ['<p class="promotions-empty">No hay campañas demostrativas disponibles.</p>']),
    '<!-- PROMOTIONS:END -->'
  ].map(line => indent + line).join(eol));
}

if (require.main === module) {
  try {
    const mode = process.argv[2];
    if (!['--check', '--write'].includes(mode)) throw new Error('Usar --check o --write.');
    const file = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const next = synchronizePromotions(html, loadConfig().promotions);
    if (next !== html) {
      if (mode === '--check') throw new Error('Ejecuta npm run promotions:sync.');
      fs.writeFileSync(file, next);
    }
    console.log('Campañas demostrativas sincronizadas.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {synchronizePromotions};
