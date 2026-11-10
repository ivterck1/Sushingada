const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {analyze, loadBaseline} = require('./catalog-preview.cjs');
const {loadBusiness} = require('./site-business-adapter.cjs');
const {catalogItems} = require('./import-menu.cjs');
const {commercialPreview} = require('./commercial-plan.cjs');
const {root, paths, projectId} = require('./studio-project.cjs');

const publicFiles = [paths.html, paths.catalog, paths.config];
const tools = [
  'package-lock.json', 'js/app.js', 'tools/business-html.cjs', 'tools/business-preview.cjs', 'tools/candidate-plan.cjs', 'tools/menu-transaction.cjs',
  'tools/catalog-preview.cjs', 'tools/commercial-plan.cjs', 'tools/generate-candidates.cjs',
  'tools/generate-menu-html.cjs', 'tools/import-menu.cjs', 'tools/site-business-adapter.cjs', 'tools/studio-project.cjs',
  'tools/sync-seo.cjs', 'tools/studio.cjs', 'tools/studio-session.cjs'
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function currentCheckout(siteRoot = root) {
  return execFileSync('git', ['-c', `safe.directory=${siteRoot.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'],
    {cwd:siteRoot, encoding:'utf8'}).trim();
}

async function review(source, siteRoot = root) {
  const checkout = currentCheckout(siteRoot);
  const originals = Object.fromEntries(await Promise.all(publicFiles.map(async file => [file, await fs.readFile(path.join(siteRoot, file))])));
  const business = loadBusiness(siteRoot, originals[paths.config]);
  const base = loadBaseline(originals[paths.catalog]);
  const {report, items} = await analyze(source, base, business, siteRoot);
  if (report.negocio) report.comercial = commercialPreview(items, catalogItems(base.products), business.config, report);
  const images = new Set([
    ...base.products.map(product => `assets/images/products/${product.imagen}`),
    ...items.map(item => item.imagen).filter(file => /^assets\/images\/products\/[a-z0-9][a-z0-9_-]*\.(?:webp|png|jpe?g|svg)$/.test(file))
  ]);
  const fallback = business.config.images.productPlaceholder;
  if (!/^(?:[\w-]+\/)+[\w.-]+\.(?:webp|png|jpe?g|svg)(?:\?v=[\w.-]+)?$/.test(fallback)) {
    throw new Error('Referencia de respaldo inválida.');
  }
  images.add(fallback.split('?')[0]);
  const dependencies = await Promise.all([...images].sort().map(async file => {
    try {
      const target = path.join(siteRoot, file);
      if (!(await fs.lstat(target)).isFile()) throw new Error(`Recurso no regular: ${file}`);
      return [file, hash(await fs.readFile(target))];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [file, null];
    }
  }));
  dependencies.push(...Object.entries(originals).map(([file, bytes]) => [file, hash(bytes)]));
  dependencies.push(...await Promise.all(tools.map(async file => [file, hash(await fs.readFile(path.join(root, file)))])));
  for (const [file, digest] of dependencies) {
    if (digest === null) report.errores.push(`Falta el recurso requerido: ${file}.`);
  }
  if (report.errores.length) report.estado = 'bloqueado';
  report.plan = {version:1, proyecto:projectId(siteRoot), checkout, dependenciasSha256:Object.fromEntries(dependencies)};
  return {report, items, business, originals};
}

module.exports = {review, hash, root, publicFiles, currentCheckout};
