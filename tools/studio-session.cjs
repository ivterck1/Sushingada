const path = require('node:path');

const menu = [
  '1. Seleccionar Excel', '2. Crear vista previa', '3. Consultar cambios',
  '4. Generar candidatos', '5. Revisar y aplicar', '6. Consultar respaldos',
  '7. Restaurar respaldo', '8. Generar candidatos comerciales', '0. Salir'
].join('\n');

const display = value => JSON.stringify(value ?? null);
const clean = value => String(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, char =>
  '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));

function describe(change) {
  const place = [change.hoja, change.fila != null ? `fila ${change.fila}` : null, change.id, change.campo].filter(Boolean).join(' · ');
  return `${place} | ${change.tipo} | ${display(change.anterior)} → ${display(change.nuevo)}`;
}

function logSummary(log) {
  const headers = [...log.matchAll(/^(\d{4}-\d\d-\d\dT[^\s]+) \(UTC\) \| (.+)$/gm)];
  const lines = [];
  for (const [index, header] of headers.entries()) {
    const body = log.slice(header.index + header[0].length, headers[index + 1]?.index);
    let data;
    try { data = JSON.parse(body); }
    catch { continue; }
    if (!data || typeof data !== 'object') continue;
    lines.push(`${header[1]} | ${header[2]}${data.resultado ? ': ' + data.resultado : ''}`);
    for (const change of data.cambios ?? []) lines.push(describe(change));
    if (data.archivos) lines.push(`Archivos: ${data.archivos.map(file => file.ruta).join(', ')}`);
    for (const warning of data.advertencias ?? []) lines.push(`Advertencia: ${warning}`);
    if (data.error) lines.push(`Error: ${data.error}`);
  }
  return lines.join('\n') || 'Sin eventos legibles en el resumen. Consulta los detalles técnicos.';
}

async function runStudio({config, operations, ask, write}) {
  let excel, preview, candidate, ended = false;
  const print = value => write(clean(value));
  async function prompt(message) {
    const value = await ask(message);
    if (value == null) ended = true;
    return value?.trim();
  }
  function requirePreview() {
    if (!preview) throw new Error('Primero crea la vista previa del Excel seleccionado.');
  }
  function showChanges(changes, title) {
    print(`${title} (${changes.length})`);
    for (const change of changes) print(describe(change));
  }
  async function selectExcel() {
    const files = await operations.findExcel(config.excelDirectory);
    print(`Carpeta de búsqueda: ${config.excelDirectory}`);
    files.forEach((file, index) => print(`${index + 1}. ${path.basename(file)}`));
    const answer = await prompt('Número de archivo o ruta al Excel (vacío para volver): ');
    if (!answer) return;
    excel = preview = candidate = undefined;
    const choice = /^\d+$/.test(answer) ? files[Number(answer) - 1] : answer.replace(/^(["'])(.*)\1$/, '$2');
    if (!choice) throw new Error('Número de archivo inválido.');
    excel = await operations.selectExcel(choice);
    print(`Excel seleccionado: ${excel}. Crea la vista previa desde el menú.`);
  }
  async function createPreview() {
    if (!excel) throw new Error('Primero selecciona un Excel.');
    preview = candidate = undefined;
    preview = await operations.preview(excel);
    const {cambios, errores, advertencias, negocio, modo} = preview.report;
    const count = type => cambios.filter(change => change.tipo === type).length;
    print(`Vista previa (${modo}) | Altas: ${count('alta propuesta')} · Bajas: ${count('baja propuesta')} · Modificaciones: ${count('modificación')} · Retiros de campos: ${count('borrado propuesto')}\nErrores: ${errores.length} · Advertencias: ${advertencias.length} · Solicitudes: ${negocio?.solicitudes.length ?? 0}`);
    for (const [label, list] of [['Error', errores], ['Advertencia', advertencias]]) {
      list.forEach(message => print(`${label}: ${message}`));
    }
    print(preview.file);
    if (preview.report.comercial) {
      const {objetivo, preciosInvalidos, bloqueos} = preview.report.comercial;
      print(`Modo solicitado: precios ${objetivo.mostrarPrecios ? 'SI' : 'NO'}, WhatsApp ${objetivo.whatsappActivo ? 'SI' : 'NO'}. Productos sin precio autorizable: ${preciosInvalidos.length}.`);
      for (const error of bloqueos) print(`Bloqueo comercial: ${error}`);
      if (bloqueos.length && preciosInvalidos.length) {
        print(preciosInvalidos.map(({id, precio}) => `${id}: ${display(precio)}`).join(', '));
      }
    }
  }
  async function consultChanges() {
    requirePreview();
    const filters = [];
    for (const label of ['Hoja', 'ID', 'Campo']) {
      const filter = await prompt(`${label} (vacío para ver todos): `);
      if (ended) return;
      filters.push(filter.toLowerCase());
    }
    const match = change => [change.hoja, change.id, change.campo].every((value, index) =>
      !filters[index] || String(value ?? '').toLowerCase().includes(filters[index]));
    showChanges(preview.report.cambios.filter(match), 'Cambios de contenido');
    showChanges((preview.report.negocio?.solicitudes ?? []).filter(match), 'Solicitudes pendientes');
  }
  async function generate(commercial = false) {
    requirePreview();
    if (!commercial && candidate?.report.comercial.explicito &&
        await prompt('Hay un candidato comercial seleccionado. Escribe CONTENIDO para reemplazarlo: ') !== 'CONTENIDO') {
      print('Se conserva el candidato comercial.');
      return;
    }
    candidate = undefined;
    candidate = await operations.generate(excel, preview, commercial);
    print(`Candidato seleccionado: ${commercial ? 'comercial' : 'solo contenido'}\nCandidatos: ${candidate.directory}\nArchivos modificados: ${candidate.report.publicarTrasRevision.join(', ') || 'ninguno'}`);
  }
  async function authorizeCommercial({anterior, nuevo, huella, frase}) {
    const mode = state => `precios ${state.mostrarPrecios ? 'SI' : 'NO'}, WhatsApp ${state.whatsappActivo ? 'SI' : 'NO'}`;
    print(`Autorización comercial independiente | ${mode(anterior)} → ${mode(nuevo)}\nHuella: ${huella}\nNegocio: ${nuevo.negocio} · Moneda: ${nuevo.moneda} · Locale: ${nuevo.locale}\nDestinatario anterior: ${display(anterior.destinatario)} · Destinatario propuesto: ${display(nuevo.destinatario)}\nEntrega: ${display(nuevo.entrega)}`);
    for (const {id, nombre, precio, disponible, categoria} of nuevo.productos) {
      print(`${id} | ${display(nombre)} | ${display(categoria)} | ${display(precio)} | ${disponible ? 'disponible' : 'no disponible'}`);
    }
    return prompt(`Escribe ${frase} para autorizar estos datos comerciales: `);
  }
  async function apply() {
    if (!candidate) throw new Error('Primero genera los candidatos de la vista previa vigente.');
    const reviewed = await operations.validate(excel, preview, candidate);
    const {explicito, nuevo} = reviewed.comercial;
    print(`Aplicación seleccionada: ${explicito ? 'comercial' : 'solo contenido'}. Estado previsto: precios ${nuevo.mostrarPrecios ? 'SI' : 'NO'}, WhatsApp ${nuevo.whatsappActivo ? 'SI' : 'NO'}.`);
    if (!reviewed.publicarTrasRevision.length) throw new Error('El candidato no contiene archivos modificados.');
    const pending = new Set(reviewed.impactosComerciales.filter(impact => impact.estado !== 'cambio candidato').map(impact => impact.campo));
    const pendingChange = change => change.hoja === 'DATOS_NEGOCIO' && pending.has(change.campo);
    showChanges(reviewed.cambiosPropuestos.filter(change => !pendingChange(change)), 'Cambios que se aplicarán');
    const requests = preview.report.negocio?.solicitudes ?? [];
    if (reviewed.comercial.explicito) showChanges(requests, 'Modo comercial solicitado');
    showChanges([...reviewed.cambiosPropuestos.filter(pendingChange), ...(reviewed.comercial.explicito ? [] : requests)],
      'Solicitudes o propuestas pendientes de verificación');
    print(`Archivos que se reemplazarán: ${reviewed.publicarTrasRevision.join(', ')}\nParche: ${path.join(candidate.directory, 'diferencias.patch')}\nAprobación del conjunto: ${reviewed.aprobacionSha256}`);
    if (await prompt('Escribe APLICAR para confirmar este conjunto: ') !== 'APLICAR') {
      print('Aplicación cancelada.');
      return;
    }
    const folder = await operations.apply(excel, preview, candidate, reviewed.aprobacionSha256, authorizeCommercial);
    preview = candidate = undefined;
    const info = await operations.backupInfo(folder);
    print(`Aplicación verificada. Respaldo: ${info.id}\nRuta: ${info.ruta}\nFecha UTC: ${info.fecha} · Estado: ${info.estado}\nBitácora: ${path.join(folder, 'BITACORA.txt')}\nManifiesto: ${path.join(folder, 'ARCHIVOS_PARA_PUBLICAR.txt')}`);
    print(reviewed.comercial.huella ? 'Aplicación comercial completada.' : 'Aplicación de contenido completada. No se aplicaron solicitudes de activación.');
    print(`Estado efectivo: precios ${nuevo.mostrarPrecios ? 'SI' : 'NO'}, WhatsApp ${nuevo.whatsappActivo ? 'SI' : 'NO'}.`);
  }
  async function backup(restore) {
    const backups = await operations.listBackups();
    if (!backups.length) { print('No hay respaldos disponibles.'); return; }
    backups.forEach(({id, fecha, estado}, index) => print(`${index + 1}. ${id} | ${fecha} | ${estado}`));
    const answer = await prompt('Número de respaldo (vacío para volver): ');
    if (!answer) return;
    const selected = /^\d+$/.test(answer) && backups[Number(answer) - 1];
    if (!selected) throw new Error('Número de respaldo inválido.');
    print(`Ruta: ${selected.ruta}`);
    const log = await operations.readBackupLog(selected.id);
    print(logSummary(log));
    if (!restore) {
      if (await prompt('Escribe DETALLES para ver la bitácora completa (vacío para volver): ') === 'DETALLES') print(log);
      return;
    }
    const recover = ['aplicando', 'restaurando'].includes(selected.estado);
    if (!recover && selected.estado !== 'aplicado') throw new Error(`Respaldo no restaurable en estado ${selected.estado}.`);
    print(`Restaurar ${selected.id} reemplazará los archivos actuales por los del respaldo. Se verificarán sus huellas.`);
    if (await prompt('Escribe RESTAURAR para confirmar: ') !== 'RESTAURAR') {
      print('Restauración cancelada.');
      return;
    }
    const folder = await operations.restore(selected.id, recover, authorizeCommercial);
    preview = candidate = undefined;
    print(`Restauración verificada. Bitácora: ${path.join(folder, 'BITACORA.txt')}`);
  }

  const actions = {
    1:['seleccionar Excel', selectExcel], 2:['crear vista previa', createPreview], 3:['consultar cambios', consultChanges],
    4:['generar candidatos', generate], 5:['aplicar candidatos', apply],
    6:['consultar respaldos', () => backup(false)], 7:['restaurar respaldo', () => backup(true)],
    8:['generar candidatos comerciales', () => generate(true)]
  };
  print(`${config.name} v${config.version}\nCliente: ${config.client}`);
  while (!ended) {
    print(`\nExcel: ${excel || 'sin seleccionar'}\n${menu}`);
    const choice = await prompt('Opción: ');
    if (ended || choice === '0') break;
    if (!Object.hasOwn(actions, choice)) { print('Opción inválida.'); continue; }
    const [label, action] = actions[choice];
    try { await action(); }
    catch (error) { print(`No se pudo ${label}: ${error.message}`); }
  }
}

module.exports = {runStudio};
