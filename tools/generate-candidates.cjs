const fs = require('node:fs/promises');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');
const {review, hash, root, publicFiles} = require('./candidate-plan.cjs');
const {synchronizeMenu} = require('./generate-menu-html.cjs');
const {serializeCatalog} = require('./import-menu.cjs');
const {prepareBusiness} = require('./site-business-adapter.cjs');
const {synchronizeSite} = require('./business-html.cjs');
const {loadConfig} = require('./sync-seo.cjs');
const {paths, temporaryDirectory} = require('./studio-project.cjs');
const {selectCommercial} = require('./commercial-plan.cjs');

function bumpScript(html, file) {
  const key = file.replaceAll('.', '\\.');
  const pattern = new RegExp(`(src="${key}\\?v=\\d+\\.\\d+\\.)(\\d+)(")`, 'g');
  if ([...html.matchAll(pattern)].length !== 1) throw new Error(`Referencia versionada inválida: ${file}.`);
  return html.replace(pattern, (_, prefix, patch, suffix) => prefix + (Number(patch) + 1) + suffix);
}

async function prepareCandidates(excel, approvedPreview, siteRoot = root, {commercial = false} = {}) {
  const {report, items, business, originals} = await review(excel, siteRoot);
  if (!isDeepStrictEqual(approvedPreview, report)) throw new Error('Vista previa obsoleta o modificada. Genera una nueva.');
  if (report.errores.length || !report.negocio || report.modo !== 'ids-persistentes') {
    throw new Error('La vista previa debe ser válida y contener las tres hojas.');
  }
  if (report.cambios.some(change => ['alta propuesta', 'baja propuesta'].includes(change.tipo))) {
    throw new Error('El plan incluye altas o bajas. Studio aún no permite aplicarlas.');
  }
  const commercialPlan = selectCommercial(report, commercial);
  const {candidate:config, impacts} = prepareBusiness(siteRoot, business, report, commercialPlan);
  const siteConfig = loadConfig(siteRoot, config);
  const originalMenu = originals[paths.catalog].toString('utf8');
  const nextMenu = !report.cambios.some(change => ['MENU', 'CATEGORIAS'].includes(change.hoja)) ? originalMenu : serializeCatalog(items);
  let html = synchronizeMenu(originals[paths.html].toString('utf8'), items, siteConfig.images.productPlaceholder, siteConfig.order);
  html = synchronizeSite(html, siteConfig);
  if (nextMenu !== originalMenu) html = bumpScript(html, paths.catalog);
  if (config !== originals[paths.config].toString('utf8')) html = bumpScript(html, paths.config);
  return {
    originals, files:{[paths.html]:html, [paths.catalog]:nextMenu, [paths.config]:config},
    report:{revisionBase:report.revisionBase, vistaPreviaSha256:hash(JSON.stringify(report)),
      impactosComerciales:impacts, cambiosPropuestos:report.cambios, comercial:commercialPlan,
      estado:'candidatos privados para revisión',
      privados:['vista previa', 'reporte-diferencias.json', 'diferencias.patch', 'Excel y herramientas']}
  };
}

async function writeCandidates(prepared, siteRoot = root) {
  const privateRoot = await temporaryDirectory(siteRoot);
  const output = await fs.mkdtemp(path.join(privateRoot, 'candidatos-'));
  async function removePrivateDirectory(directory) {
    const resolved = await fs.realpath(directory).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!resolved) return;
    const relative = path.relative(await fs.realpath(privateRoot), resolved);
    if (!/^candidatos-[a-z0-9]+(?:[\\/]original)?$/i.test(relative)) throw new Error('Directorio temporal fuera del alcance.');
    await fs.rm(resolved, {recursive:true, force:true});
  }
  try {
    const diff = [];
    const files = [];
    const originalDir = path.join(output, 'original');
    for (const file of publicFiles) {
      const bytes = Buffer.from(prepared.files[file]);
      const original = prepared.originals[file];
      const changed = !original.equals(bytes);
      const candidatePath = path.join(output, 'sitio', file);
      await fs.mkdir(path.dirname(candidatePath), {recursive:true});
      await fs.writeFile(candidatePath, bytes, {flag:'wx'});
      files.push({ruta:file, cambiado:changed, sha256Original:hash(original), sha256Candidato:hash(bytes)});
      if (!changed) continue;
      const originalPath = path.join(originalDir, file);
      await fs.mkdir(path.dirname(originalPath), {recursive:true});
      await fs.writeFile(originalPath, original, {flag:'wx'});
      const patch = spawnSync('git', ['--no-pager', 'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color',
        '--', `original/${file}`, `sitio/${file}`], {cwd:output, encoding:'utf8', maxBuffer:8 * 1024 * 1024});
      if (patch.status !== 1) throw new Error(`No se pudo comparar ${file}: ${patch.error?.message || patch.stderr}`);
      diff.push(patch.stdout);
    }
    await removePrivateDirectory(originalDir);
    const patch = diff.join('');
    const report = candidateReport(prepared, patch, files);
    await fs.writeFile(path.join(output, 'diferencias.patch'), patch, {flag:'wx'});
    await fs.writeFile(path.join(output, 'reporte-diferencias.json'), JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
    return output;
  } catch (error) {
    await removePrivateDirectory(output);
    throw error;
  }
}

function candidateReport(prepared, patch, files = publicFiles.map(ruta => {
  const original = prepared.originals[ruta];
  const candidate = Buffer.from(prepared.files[ruta]);
  return {ruta, cambiado:!original.equals(candidate), sha256Original:hash(original), sha256Candidato:hash(candidate)};
})) {
  const report = {...prepared.report, archivos:files, parcheSha256:hash(patch),
    publicarTrasRevision:files.filter(file => file.cambiado).map(file => file.ruta)};
  return {...report, aprobacionSha256:hash(JSON.stringify(report))};
}

async function main() {
  const [excel, plan, mode, ...rest] = process.argv.slice(2);
  if (!excel || !plan || (mode !== undefined && mode !== '--commercial') || rest.length || path.extname(excel).toLowerCase() !== '.xlsx' || path.extname(plan).toLowerCase() !== '.json') {
    throw new Error('Uso: npm run menu:candidates -- archivo.xlsx vista-previa.json [--commercial]');
  }
  const prepared = await prepareCandidates(await fs.readFile(excel), JSON.parse(await fs.readFile(plan, 'utf8')), root, {commercial:mode === '--commercial'});
  console.log(await writeCandidates(prepared));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {prepareCandidates, writeCandidates, candidateReport};
