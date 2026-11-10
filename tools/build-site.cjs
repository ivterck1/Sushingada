const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {loadConfig} = require('./sync-seo.cjs');
const {synchronizeSite} = require('./business-html.cjs');
const {readMenu, synchronizeMenu} = require('./generate-menu-html.cjs');

const {synchronizePromotions} = require('./promotions-html.cjs');

const required = ['index.html', 'css/styles.css', 'css/theme.css', 'js/app.js', 'js/config.js', 'js/menu-data.js', 'js/promotions.js'];
const allowedAsset = /^assets\/(?:fonts\/[\w.-]+\.(?:woff2|txt)|images\/(?:brand|hero|products)\/[\w.-]+\.(?:webp|png|jpe?g|ico|svg))$/;
const root = fs.realpathSync(path.resolve(__dirname, '..'));

function inventory(siteRoot = root) {
  const site = fs.realpathSync(siteRoot);
  const files = fs.readFileSync(path.join(site, 'public-files.txt'), 'utf8').trim().split(/\r?\n/);
  const approved = new Set(files);
  assert.equal(approved.size, files.length, 'El inventario contiene duplicados.');
  assert.ok(required.every(file => approved.has(file)), 'Faltan archivos esenciales en el inventario.');
  for (const file of files) {
    assert.ok(required.includes(file) || allowedAsset.test(file), `Ruta fuera del alcance público: ${file}`);
    const source = path.join(site, file);
    assert.ok(fs.lstatSync(source).isFile() && fs.realpathSync(source) === source, `Archivo público redirigido o no regular: ${file}`);
  }

  const config = loadConfig(site);
  const catalog = readMenu(fs.readFileSync(path.join(site, 'js/menu-data.js'), 'utf8'));
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  assert.ok(html === synchronizeSite(html, config), 'Ejecuta npm run menu:business:sync.');
  assert.ok(html === synchronizeMenu(html, catalog, config.images.productPlaceholder, config.order), 'Ejecuta npm run menu:html:sync.');

  assert.ok(html === synchronizePromotions(html, config.promotions), 'Ejecuta npm run promotions:sync.');

  function checkReference(reference, parent = '.') {
    if (/^(?:#|https?:\/\/|mailto:|tel:|data:)/i.test(reference)) return;
    const file = path.posix.normalize(path.posix.join(parent, reference.split(/[?#]/, 1)[0]));
    assert.ok(!reference.startsWith('/') && approved.has(file), `Recurso local fuera del inventario: ${reference}`);
  }
  for (const reference of Object.values(config.images)) checkReference(reference);
  for (const {imagen} of catalog) if (imagen) checkReference(imagen);
  for (const [, reference] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) checkReference(reference);
  for (const style of ['css/styles.css', 'css/theme.css']) {
    const css = fs.readFileSync(path.join(site, style), 'utf8');
    for (const [, reference] of css.matchAll(/\burl\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi)) checkReference(reference, 'css');
  }
  return {site, files};
}

function build(destination, siteRoot = root) {
  const {site, files} = inventory(siteRoot);
  const requested = path.resolve(destination);
  const output = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
  const relative = path.relative(site, output);
  assert.ok(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
    'El artefacto debe quedar fuera del repositorio.');
  fs.mkdirSync(output);
  const created = [];
  try {
    for (const file of files) {
      const target = path.join(output, file);
      fs.mkdirSync(path.dirname(target), {recursive:true});
      fs.copyFileSync(path.join(site, file), target, fs.constants.COPYFILE_EXCL);
      created.push(target);
    }
    const actual = fs.readdirSync(output, {recursive:true, withFileTypes:true});
    assert.ok(actual.every(entry => entry.isFile() || entry.isDirectory()), 'Entrada inesperada en el artefacto.');
    const exported = actual.filter(entry => entry.isFile()).map(entry =>
      path.relative(output, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).sort();
    assert.deepEqual(exported, [...files].sort());
    return exported;
  } catch (error) {
    for (const target of created) fs.unlinkSync(target);
    for (const entry of fs.readdirSync(output, {recursive:true, withFileTypes:true}).reverse()) {
      if (entry.isDirectory()) fs.rmdirSync(path.join(entry.parentPath, entry.name));
    }
    fs.rmdirSync(output);
    throw error;
  }
}

if (require.main === module) {
  try {
    const [arg, ...extra] = process.argv.slice(2);
    assert.ok(arg && !extra.length, 'Uso: npm run build:site -- <directorio-nuevo> o npm run public:check.');
    const files = arg === '--check' ? inventory().files : build(arg);
    console.log(`Inventario público verificado: ${files.length} archivos.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {inventory, build};
