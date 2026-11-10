const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {inventory, build} = require('../tools/build-site.cjs');
const {renderSeo, loadConfig} = require('../tools/sync-seo.cjs');
const {renderMenuHtml} = require('../tools/generate-menu-html.cjs');

test('SEO exige canonical HTTPS para indexar y escapa textos', () => {
  const config = loadConfig();
  config.seo.title = 'Ejemplo <etiqueta>';
  assert.match(renderSeo(config), /Ejemplo &lt;etiqueta&gt;/);
  assert.doesNotMatch(renderSeo(config), /rel="canonical"/);
  config.seo.robots = 'index,follow';
  assert.throws(() => renderSeo(config), /confirmar/);
  config.seo.canonicalUrl = 'http://example.invalid/';
  assert.throws(() => renderSeo(config), /HTTPS/);
  config.seo.canonicalUrl = 'https://example.invalid/demo/';
  assert.match(renderSeo(config), /rel="canonical" href="https:\/\/example\.invalid\/demo\/"/);
});

test('catálogo escapa contenido y omite productos agotados', () => {
  const images = 'assets/images/products/placeholder.svg';
  const dish = {id:'ejemplo',categoria:'Demo',nombre:'<Ejemplo>',descripcion:'A & B',precio:42,imagen:images,disponible:true};
  const html = renderMenuHtml([dish,{...dish,id:'agotado',disponible:false}], images, {pricesApproved:false});
  assert.match(html, /&lt;Ejemplo&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /Precio pendiente/);
  assert.doesNotMatch(html, /data-menu-product-id="agotado"/);
});

test('el artefacto coincide con el inventario, byte por byte', t => {
  const {site, files} = inventory();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'public-test-'));
  t.after(() => fs.rmSync(folder, {recursive:true,force:true}));
  const output = path.join(folder, 'web');
  assert.deepEqual(build(output), [...files].sort());
  for (const file of files) assert.deepEqual(fs.readFileSync(path.join(output, file)), fs.readFileSync(path.join(site, file)));
  for (const file of ['.git', '.github', 'tools', 'tests', 'templates', 'client-input', 'tmp', 'backups', 'package.json']) {
    assert.ok(!fs.existsSync(path.join(output, file)));
  }
  assert.throws(() => build(path.join(site, 'publicacion')), /fuera del repositorio/);
  assert.throws(() => build(output), {code:'EEXIST'});
});

test('el inventario rechaza recursos privados y referencias locales sin aprobar', t => {
  const {site, files} = inventory();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-test-'));
  t.after(() => fs.rmSync(fixture, {recursive:true,force:true}));
  for (const file of files) {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.copyFileSync(path.join(site, file), target);
  }
  const manifest = path.join(fixture, 'public-files.txt');
  fs.writeFileSync(manifest, [...files, 'client-input/privado.xlsx'].join('\n'));
  assert.throws(() => inventory(fixture), /fuera del alcance público/);
  fs.writeFileSync(manifest, files.filter(file => file !== loadConfig(site).images.productPlaceholder.split('?')[0]).join('\n'));
  assert.throws(() => inventory(fixture), /fuera del inventario/);
});
