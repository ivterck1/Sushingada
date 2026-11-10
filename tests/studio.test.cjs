const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const ExcelJS = require('exceljs');
const {templateRows, loadBaseline} = require('../tools/catalog-preview.cjs');
const {synchronizeSite} = require('../tools/business-html.cjs');
const {synchronizeMenu} = require('../tools/generate-menu-html.cjs');
const {serializeCatalog} = require('../tools/import-menu.cjs');
const {runStudio} = require('../tools/studio-session.cjs');
const {loadBusiness} = require('../tools/site-business-adapter.cjs');
const {publicFiles, review} = require('../tools/candidate-plan.cjs');
const {prepareCandidates} = require('../tools/generate-candidates.cjs');
const {apply, restore, listBackups} = require('../tools/menu-transaction.cjs');
const {createOperations} = require('../tools/studio.cjs');

const root = path.resolve(__dirname, '..');
async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-test-'));
  t.after(() => fs.rm(folder, {recursive:true,force:true}));
  const siteRoot = path.join(folder, 'sitio');
  const privateRoot = path.join(folder, 'privado');
  const options = {siteRoot, privateRoot};
  const config = {};
  config.projectId = 'prueba-aislada';
  config.business = {name:'Restaurante de prueba', shortName:'Prueba', description:'Catálogo ficticio'};
  config.contact = {};
  config.hero = {eyebrow:'Demostración', title:'Menú ficticio', highlight:'Prueba', description:'Ejemplo aislado'};
  config.seo = {title:'Restaurante de prueba', description:'Catálogo ficticio', robots:'noindex,follow', locale:'es_MX', canonicalUrl:''};
  config.whatsapp = {number:'', enabled:false};
  config.order = {pricesApproved:false, currency:'MXN', locale:'es-MX', deliveryModes:[]};
  const image = 'assets/images/products/placeholder.svg';
  config.images = {logo:image, hero:image, productPlaceholder:image};
  const items = [1,2,3].map(n => ({
    id:`demo-${n}`, nombre:`Ejemplo ${n}`, descripcion:'Producto ficticio',
    precio:n * 10, categoria:'Pruebas', imagen:image, disponible:true, destacado:false
  }));
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const synced = synchronizeMenu(synchronizeSite(html, config), items, image, config.order);
  // El adaptador actualiza estos dos valores canónicos en el código generado.
  const configSource = `const siteConfig = {
  projectId: "${config.projectId}",
  business: ${JSON.stringify(config.business)},
  contact: {},
  hero: ${JSON.stringify(config.hero)},
  seo: ${JSON.stringify(config.seo)},
  whatsapp: { number: "", enabled: false },
  images: ${JSON.stringify(config.images)},
  order: {
    pricesApproved: false,
    currency: "MXN",
    locale: "es-MX",
    deliveryModes: []
  }
};\n`;
  for (const [file, contents] of Object.entries({
    'index.html':synced, 'js/config.js':configSource, 'js/menu-data.js':serializeCatalog(items),
    [image]:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
  })) {
    const target = path.join(siteRoot, file);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.writeFile(target, contents);
  }
  const git = (...args) => execFileSync('git', args, {cwd:siteRoot, stdio:'pipe'});
  git('init', '-q');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture aislada');
  const originals = Object.fromEntries(await Promise.all(publicFiles.map(async file =>
    [file, await fs.readFile(path.join(siteRoot, file))])));
  return {folder, siteRoot, options, originals, operations:createOperations(options)};
}

async function excel(f, edit) {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(templateRows(loadBaseline(f.originals['js/menu-data.js']), loadBusiness(f.siteRoot)))) {
    workbook.addWorksheet(name).addRows(rows);
  }
  edit(workbook);
  const file = path.join(f.folder, 'operativo.xlsx');
  await workbook.xlsx.writeFile(file);
  return file;
}

async function candidate(f, file, commercial = false) {
  const preview = await f.operations.preview(file);
  assert.deepEqual(preview.report.errores, []);
  const bundle = await f.operations.generate(file, preview, commercial);
  const validated = await f.operations.validate(file, preview, bundle);
  return {excel:file, plan:preview.file, directory:bundle.directory, approval:validated.aprobacionSha256, ...f.options};
}

async function unchanged(f) {
  for (const file of publicFiles) assert.deepEqual(await fs.readFile(path.join(f.siteRoot, file)), f.originals[file]);
}

test('Studio bloquea altas y bajas y detecta un plan o candidato alterado', async t => {
  const f = await fixture(t);
  for (const [type, edit] of [
    ['alta propuesta', sheet => {
      const row = sheet.getRow(2).values.slice(1);
      row[1] = 'Ejemplo adicional';
      row[8] = 'alta:ejemplo-adicional';
      sheet.addRow(row);
    }],
    ['baja propuesta', sheet => sheet.spliceRows(2, 1)]
  ]) {
    const file = await excel(f, book => edit(book.getWorksheet('MENU')));
    const preview = await f.operations.preview(file);
    assert.ok(preview.report.cambios.some(change => change.tipo === type));
    await assert.rejects(() => f.operations.generate(file, preview), /altas o bajas/);
  }
  const file = await excel(f, book => { book.getWorksheet('MENU').getCell('G2').value = 'NO'; });
  const bytes = await fs.readFile(file);
  const {report} = await review(bytes, f.siteRoot);
  await assert.rejects(() => prepareCandidates(bytes, {...report, estado:'alterado'}, f.siteRoot), /obsoleta/);
  const args = await candidate(f, file);
  await fs.appendFile(path.join(args.directory, 'sitio', 'index.html'), '<!-- alterado -->');
  await assert.rejects(() => apply(args), /Candidato alterado/);
  await unchanged(f);
});

test('Studio desactiva, reactiva y restaura un producto con el mismo ID', async t => {
  const f = await fixture(t);
  const deactivate = await excel(f, book => { book.getWorksheet('MENU').getCell('G2').value = 'NO'; });
  const args = await candidate(f, deactivate);
  const first = path.basename(await apply(args));
  const changed = await fs.readFile(path.join(f.siteRoot, 'js/menu-data.js'));
  assert.equal(loadBaseline(changed).products[0].disponible, false);
  assert.equal(loadBaseline(changed).products[0].id, loadBaseline(f.originals['js/menu-data.js']).products[0].id);
  assert.doesNotMatch(await fs.readFile(path.join(f.siteRoot, 'index.html'), 'utf8'), /data-menu-product-id="demo-1"/);

  const reactivate = await excel({...f, originals:{...f.originals, 'js/menu-data.js':changed}},
    book => { book.getWorksheet('MENU').getCell('G2').value = 'SI'; });
  const second = path.basename(await apply(await candidate(f, reactivate)));
  assert.equal(loadBaseline(await fs.readFile(path.join(f.siteRoot, 'js/menu-data.js'))).products[0].disponible, true);
  await restore({id:second, ...f.options});
  await restore({id:first, ...f.options});
  await unchanged(f);
});

test('Studio exige autorización independiente y recupera una aplicación interrumpida', async t => {
  const f = await fixture(t);
  const file = await excel(f, book => {
    const sheet = book.getWorksheet('DATOS_NEGOCIO');
    sheet.eachRow(row => {
      const values = {mostrar_precios:'SI', whatsapp_activo:'SI', whatsapp:'12025550123'};
      const value = values[row.getCell(1).value];
      if (value) row.getCell(2).value = value;
    });
  });
  const args = await candidate(f, file, true);
  await assert.rejects(() => apply(args), /autorización comercial independiente/);
  await unchanged(f);
  let checkedLock = false;
  await assert.rejects(() => apply({...args, authorize:async ({frase}) => {
    await assert.rejects(() => apply(args), /en ejecución/);
    checkedLock = true;
    return frase;
  }, afterWrite() { throw new Error('interrupción simulada'); }}), /interrupción simulada/);
  assert.ok(checkedLock);
  const [backup] = await listBackups(f.options);
  assert.equal(backup.estado, 'aplicando');
  await restore({id:backup.id, recover:true, ...f.options});
  await unchanged(f);
});

test('la sesión de Studio permite cancelar, aplicar y restaurar desde el menú', async t => {
  const f = await fixture(t);
  await excel(f, book => { book.getWorksheet('MENU').getCell('G2').value = 'NO'; });
  const answers = ['1','1','2','4','5','CANCELAR','5','APLICAR','7','1','RESTAURAR','0'];
  const output = [];
  await runStudio({
    config:{name:'Studio', version:'prueba', client:'Demo', excelDirectory:f.folder},
    operations:f.operations, ask:async () => answers.shift(), write:line => output.push(line)
  });
  assert.match(output.join('\n'), /Aplicación cancelada/);
  assert.match(output.join('\n'), /Aplicación verificada/);
  assert.match(output.join('\n'), /Restauración verificada/);
  await unchanged(f);
});
