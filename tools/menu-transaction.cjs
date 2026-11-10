const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const {randomUUID} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {root, hash, publicFiles, currentCheckout} = require('./candidate-plan.cjs');
const {prepareCandidates, candidateReport} = require('./generate-candidates.cjs');
const {loadConfig} = require('./sync-seo.cjs');
const {synchronizeSite} = require('./business-html.cjs');
const {paths, projectId, backupDirectory} = require('./studio-project.cjs');
const {readMenu} = require('./generate-menu-html.cjs');
const {snapshot} = require('./commercial-plan.cjs');

const writeOrder = [paths.catalog, paths.config, paths.html];
const digest = /^[a-f0-9]{64}$/;
const transactionId = /^respaldo-[a-z0-9]+$/i;
const json = value => JSON.stringify(value, null, 2) + '\n';
const changed = file => file.sha256Original !== file.sha256Candidato;

async function durableWrite(file, data, flags = 'wx') {
  const handle = await fs.open(file, flags, 0o600);
  try { await handle.writeFile(data); await handle.sync(); }
  finally { await handle.close(); }
}

async function log(folder, event, details = {}) {
  await durableWrite(path.join(folder, 'BITACORA.txt'),
    `${new Date().toISOString()} (UTC) | ${event}\n${json(details)}\n`, 'a');
}

async function state(folder, value) {
  const temp = path.join(folder, `estado-${randomUUID()}.tmp`);
  await durableWrite(temp, value + '\n');
  await fs.rename(temp, path.join(folder, 'estado'));
}

async function regular(file) {
  if (!(await fs.lstat(file)).isFile()) throw new Error(`Archivo no regular: ${file}`);
  return fs.readFile(file);
}

async function within(folder, relative) {
  const file = path.join(folder, relative);
  if (path.relative(folder, await fs.realpath(file)) !== relative.split('/').join(path.sep)) {
    throw new Error(`Ruta redirigida o fuera del alcance: ${relative}.`);
  }
  return file;
}

async function locked(siteRoot, privateRoot, action) {
  const site = await fs.realpath(siteRoot);
  const key = hash(process.platform === 'win32' ? site.toLowerCase() : site);
  const vault = vaultPath(site, privateRoot);
  const server = net.createServer(socket => socket.destroy());
  const address = process.platform === 'win32' ? '\\\\.\\pipe\\nodagrama-menu-' + key :
    {host:'127.0.0.1', port:20000 + parseInt(key.slice(0, 4), 16) % 30000, exclusive:true};
  try {
    await new Promise((resolve, reject) => server.once('error', reject).listen(address, resolve));
  } catch (error) {
    if (error.code === 'EADDRINUSE') throw new Error('Hay otra operación de menú en ejecución.');
    throw error;
  }
  try { return await action(site, vault); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function vaultPath(site, privateRoot) {
  const vault = path.resolve(privateRoot || backupDirectory(site));
  const relative = path.relative(site, vault);
  if (!relative || !path.isAbsolute(relative) && !relative.startsWith('..' + path.sep) && relative !== '..') {
    throw new Error('El respaldo debe estar fuera de la raíz del sitio.');
  }
  return vault;
}

async function availableVaults(site, privateRoot) {
  const vault = vaultPath(site, privateRoot);
  try { await checkVault(vault); return [vault]; }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function findBackup(site, privateRoot, id) {
  if (!transactionId.test(id)) throw new Error('Identificador de respaldo inválido. Usa el ID respaldo-…, sin ruta.');
  const matches = [];
  for (const vault of await availableVaults(site, privateRoot)) {
    try { matches.push(await within(vault, id)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (matches.length !== 1) throw new Error(matches.length ? 'ID de respaldo ambiguo.' : `No se encontró el respaldo ${id}.`);
  return matches[0];
}

async function checkVault(vault) {
  if (path.relative(vault, await fs.realpath(vault))) throw new Error('El directorio privado no puede estar redirigido.');
}

async function liveFiles(site) {
  return Object.fromEntries(await Promise.all(publicFiles.map(async file => [file, await regular(await within(site, file))])));
}

async function validateDirectory(folder, expected) {
  const entries = (await fs.readdir(folder)).sort();
  if (!isDeepStrictEqual(entries, [...expected].sort())) throw new Error('El conjunto candidato contiene rutas fuera de la lista permitida o faltantes.');
}

async function validateBundle(directory, prepared) {
  const folder = await fs.realpath(directory);
  await validateDirectory(folder, ['sitio', 'diferencias.patch', 'reporte-diferencias.json']);
  await validateDirectory(await within(folder, 'sitio'), ['index.html', 'js']);
  await validateDirectory(await within(folder, 'sitio/js'), ['config.js', 'menu-data.js']);
  const report = candidateReport(prepared, await regular(await within(folder, 'diferencias.patch')));
  const recorded = JSON.parse(await regular(await within(folder, 'reporte-diferencias.json')));
  if (!isDeepStrictEqual(recorded, report)) throw new Error('Reporte candidato alterado u obsoleto.');
  for (const file of report.archivos) {
    const bytes = await regular(await within(folder, 'sitio/' + file.ruta));
    if (hash(bytes) !== file.sha256Candidato) throw new Error(`Candidato alterado: ${file.ruta}.`);
  }
  return report;
}

function manifest(meta) {
  return [
    'ARCHIVOS PARA PUBLICAR | pendiente de revisión y publicación manual',
    `Revisión Git: ${meta.checkout}`, `Aprobación local SHA-256: ${meta.aprobacion}`,
    '', 'MODIFICADOS (ruta | SHA-256):',
    ...meta.archivos.filter(changed).map(file => `${file.ruta} | ${file.sha256Candidato}`),
    '', 'NUEVOS:', '(ninguno)', '', 'ELIMINACIONES AUTORIZADAS:', '(ninguna)',
    '', 'NO PUBLICAR:', 'Excel, vistas previas, tmp/, respaldos, bitácoras, manifiesto, parches, herramientas y referencias locales.', ''
  ].join('\n');
}

async function replaceFiles(site, folder, files, contents, expected, afterWrite) {
  for (const ruta of writeOrder) {
    const file = files.find(entry => entry.ruta === ruta);
    const target = await within(site, ruta);
    const before = await regular(target);
    if (hash(before) !== expected[ruta]) throw new Error(`Cambio concurrente: ${ruta}.`);
    if (before.equals(contents[ruta])) continue;
    const temp = path.join(folder, `escritura-${randomUUID()}.tmp`);
    await durableWrite(temp, contents[ruta]);
    if ((await fs.stat(temp)).dev !== (await fs.stat(target)).dev) {
      throw new Error('El respaldo privado y los archivos del sitio deben compartir volumen.');
    }
    if (hash(await regular(target)) !== expected[ruta]) throw new Error(`Cambio concurrente: ${ruta}.`);
    await fs.rename(temp, target);
    if (hash(await regular(target)) !== hash(contents[ruta])) throw new Error(`Error al verificar ${ruta}.`);
    if (afterWrite) await afterWrite(file.ruta);
  }
  const final = await liveFiles(site);
  for (const ruta of publicFiles) {
    if (!final[ruta].equals(contents[ruta])) throw new Error(`Resultado inesperado: ${ruta}.`);
  }
}

async function pendingTransactions(vault) {
  for (const entry of await fs.readdir(vault, {withFileTypes:true})) {
    if (!entry.isDirectory() || !transactionId.test(entry.name)) continue;
    const status = await readState(path.join(vault, entry.name));
    if (['aplicando', 'restaurando'].includes(status)) throw new Error(`Recupera primero el respaldo ${entry.name}.`);
  }
}

async function readState(folder) {
  try { return (await regular(path.join(folder, 'estado'))).toString().trim(); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function listBackups({siteRoot = root, privateRoot} = {}) {
  const backups = [];
  const site = await fs.realpath(siteRoot);
  for (const vault of await availableVaults(site, privateRoot)) {
    for (const entry of await fs.readdir(vault, {withFileTypes:true})) {
      if (entry.isDirectory() && transactionId.test(entry.name)) backups.push(await backupInfo(await within(vault, entry.name)));
    }
  }
  return backups.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
}

async function backupInfo(folder) {
  return {id:path.basename(folder), ruta:folder, fecha:(await fs.stat(folder)).birthtime.toISOString(),
    estado:await readState(folder) || 'sin escritura iniciada'};
}

async function readBackupLog({id, siteRoot = root, privateRoot}) {
  const folder = await findBackup(await fs.realpath(siteRoot), privateRoot, id);
  return (await regular(await within(folder, 'BITACORA.txt'))).toString('utf8');
}

async function verifyOriginals(folder, meta) {
  const contents = {};
  for (const {ruta, sha256Original} of meta.archivos) {
    contents[ruta] = await regular(await within(folder, 'original/' + ruta));
    if (hash(contents[ruta]) !== sha256Original) throw new Error(`Respaldo alterado: ${ruta}.`);
  }
  return contents;
}

async function approveCommercial(commercial, authorize) {
  if (!commercial.huella) return null;
  if (!authorize) throw new Error('Falta autorización comercial independiente.');
  const frase = `AUTORIZAR ${commercial.huella.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
  if (await authorize({...commercial, frase}) !== frase) throw new Error('Autorización comercial incorrecta o cancelada.');
  let operador = null;
  try { operador = os.userInfo().username; } catch { /* Entorno sin usuario disponible. */ }
  return {...commercial, operador, fechaUtc:new Date().toISOString()};
}

async function apply({excel, plan, directory, approval, authorize, siteRoot = root, privateRoot, afterWrite}) {
  return locked(siteRoot, privateRoot, async (site, vault) => {
    let folder;
    await fs.mkdir(vault, {recursive:true, mode:0o700});
    await checkVault(vault);
    try {
      for (const directory of await availableVaults(site, privateRoot)) await pendingTransactions(directory);
      const workbook = await regular(excel);
      const preview = JSON.parse(await regular(plan));
      const candidateMode = JSON.parse(await regular(path.join(await fs.realpath(directory), 'reporte-diferencias.json'))).comercial?.explicito === true;
      const generation = {commercial:candidateMode};
      const prepared = await prepareCandidates(workbook, preview, site, generation);
      const report = await validateBundle(directory, prepared);
      if (!digest.test(approval) || approval !== report.aprobacionSha256) throw new Error('Aprobación SHA-256 incorrecta o ausente.');
      if (!report.publicarTrasRevision.length) throw new Error('El conjunto candidato no contiene cambios aplicables.');
      const config = loadConfig(site, prepared.files[paths.config]);
      if (synchronizeSite(prepared.files[paths.html], config) !== prepared.files[paths.html]) {
        throw new Error('El HTML comercial y SEO candidato requieren sincronización antes de aplicar.');
      }
      const autorizacionComercial = await approveCommercial(report.comercial, authorize);
      folder = await fs.mkdtemp(path.join(vault, 'respaldo-'));
      const meta = {version:1, proyecto:projectId(site), sitio:site, excel:path.basename(excel), excelSha256:hash(workbook),
        revisionBase:report.revisionBase, checkout:preview.plan.checkout, vistaPreviaSha256:report.vistaPreviaSha256,
        aprobacion:approval, archivos:report.archivos, autorizacionComercial};
      for (const file of report.archivos) {
        const target = path.join(folder, 'original', file.ruta);
        await fs.mkdir(path.dirname(target), {recursive:true});
        await durableWrite(target, prepared.originals[file.ruta]);
        if (hash(await regular(target)) !== file.sha256Original) throw new Error(`Respaldo inválido: ${file.ruta}.`);
        if ((await fs.stat(target)).dev !== (await fs.stat(await within(site, file.ruta))).dev) {
          throw new Error('El respaldo privado y los archivos del sitio deben compartir volumen.');
        }
      }
      await durableWrite(path.join(folder, 'respaldo.json'), json(meta));
      await log(folder, 'Aplicación autorizada', {...meta, cambios:preview.cambios,
        solicitudesPendientes:report.comercial.explicito ? [] : preview.negocio.solicitudes,
        solicitudesResueltas:report.comercial.explicito ? preview.negocio.solicitudes : [],
        advertencias:preview.advertencias, errores:preview.errores, validaciones:'plan, dependencias, candidatos, SEO y bloqueos comerciales'});
      if (!Buffer.from(workbook).equals(await regular(excel)) ||
          !isDeepStrictEqual(preview, JSON.parse(await regular(plan)))) throw new Error('Excel o plan cambiado durante el respaldo.');
      await validateBundle(directory, await prepareCandidates(workbook, preview, site, generation));
      await verifyOriginals(folder, meta);
      await state(folder, 'aplicando');
      const contents = Object.fromEntries(publicFiles.map(file => [file, Buffer.from(prepared.files[file])]));
      const expected = Object.fromEntries(meta.archivos.map(file => [file.ruta, file.sha256Original]));
      await replaceFiles(site, folder, meta.archivos, contents, expected, afterWrite);
      await verifyOriginals(folder, meta);
      const listing = manifest(meta);
      const manifestPath = path.join(folder, 'ARCHIVOS_PARA_PUBLICAR.txt');
      await durableWrite(manifestPath, listing);
      if ((await regular(manifestPath)).toString() !== listing) throw new Error('Manifiesto inconsistente.');
      const effective = loadConfig(site);
      await log(folder, 'Aplicación verificada', {
        resultado:'aplicado', tipoCandidato:report.comercial.explicito ? 'comercial' : 'solo contenido',
        autorizacionComercialAplicada:Boolean(autorizacionComercial),
        estadoFinal:{mostrarPrecios:effective.order.pricesApproved, whatsappActivo:effective.whatsapp.enabled,
          destinatario:effective.whatsapp.number}, manifiestoSha256:hash(listing)
      });
      await state(folder, 'aplicado');
      return folder;
    } catch (error) {
      await log(folder || vault, 'Aplicación rechazada o interrumpida', {
        excel:path.basename(excel), plan:path.basename(plan), aprobacion:approval, error:error.message
      });
      if (folder) error.message += ` Respaldo: ${path.basename(folder)}.`;
      throw error;
    }
  });
}

async function restore({id, recover = false, authorize, siteRoot = root, privateRoot, afterWrite}) {
  return locked(siteRoot, privateRoot, async (site, vault) => {
    let folder;
    try {
      folder = await findBackup(site, privateRoot, id);
      const status = await readState(folder);
      if (recover ? !['aplicando', 'restaurando'].includes(status) : status !== 'aplicado') {
        throw new Error(`Estado de respaldo incompatible: ${status || 'sin escritura iniciada'}.`);
      }
      const meta = JSON.parse(await regular(await within(folder, 'respaldo.json')));
      if (meta.version !== 1 || meta.proyecto !== projectId(site) || meta.sitio !== site || meta.checkout !== currentCheckout(site) ||
          !isDeepStrictEqual(meta.archivos.map(file => file.ruta), publicFiles)) throw new Error('Respaldo incompatible con el sitio o la revisión actual.');
      const live = await liveFiles(site);
      const contents = await verifyOriginals(folder, meta), expected = {};
      for (const file of meta.archivos) {
        const {ruta, sha256Original, sha256Candidato} = file;
        expected[ruta] = hash(live[ruta]);
        if (expected[ruta] !== sha256Candidato && !(recover && expected[ruta] === sha256Original)) {
          throw new Error(`Cambio posterior o inesperado: ${ruta}.`);
        }
      }
      const stateOf = files => snapshot(readMenu(files[paths.catalog].toString('utf8')),
        loadConfig(site, files[paths.config].toString('utf8')));
      const anterior = stateOf(live), nuevo = stateOf(contents);
      const needsApproval = (nuevo.mostrarPrecios || nuevo.whatsappActivo) && !isDeepStrictEqual(anterior, nuevo);
      const huella = needsApproval ? hash(JSON.stringify({id, archivos:meta.archivos, anterior, nuevo})) : null;
      const autorizacionComercial = await approveCommercial({anterior, nuevo, huella}, authorize);
      await log(folder, recover ? 'Recuperación solicitada' : 'Reversión solicitada',
        {...meta, estadoComercialAnterior:anterior, estadoComercialRestaurado:nuevo, autorizacionComercialRestauracion:autorizacionComercial});
      await state(folder, 'restaurando');
      await replaceFiles(site, folder, meta.archivos, contents, expected, afterWrite);
      await verifyOriginals(folder, meta);
      const listing = path.join(folder, 'ARCHIVOS_PARA_PUBLICAR.txt');
      try {
        await regular(listing);
        await fs.rename(listing, path.join(folder, 'ARCHIVOS_PARA_PUBLICAR.anulado.txt'));
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await log(folder, 'Restauración verificada', {resultado:'restaurado', hashes:meta.archivos.map(file => [file.ruta, file.sha256Original])});
      await state(folder, 'restaurado');
      return folder;
    } catch (error) {
      if (folder) await log(folder, 'Restauración rechazada o interrumpida', {id, error:error.message});
      throw error;
    }
  });
}

async function main([command, ...args]) {
  if (command === 'apply' && args.length === 5 && args[3] === '--approve') {
    const [excel, plan, directory, , approval] = args;
    console.log(await apply({excel, plan, directory, approval}));
  } else if (command === 'restore' && (args.length === 1 || args.length === 2 && args[1] === '--recover')) {
    console.log(await restore({id:args[0], recover:args[1] === '--recover'}));
  } else {
    throw new Error('Usa apply <Excel> <vista-previa> <directorio-candidato> --approve <SHA-256> o npm run menu:restore -- <ID respaldo-…> [--recover]. Indica el ID, no una ruta.');
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {apply, restore, validateBundle, listBackups, readBackupLog, backupInfo};
