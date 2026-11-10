const fs = require('node:fs');
const path = require('node:path');
const {paths} = require('./studio-project.cjs');
const {loadConfig} = require('./sync-seo.cjs');

const keys = {
  nombre:['business', 'name'], nombre_corto:['business', 'shortName'], descripcion:['business', 'description'],
  telefono:['contact', 'phone'], whatsapp:['whatsapp', 'number'], horario:['contact', 'hours'],
  direccion:['contact', 'address'], cobertura:['contact', 'coverage'], instagram:['contact', 'instagram'],
  facebook:['contact', 'facebook'], tiktok:['contact', 'tiktok'], moneda:['order', 'currency'], locale:['order', 'locale']
};
const surfaces = {
  nombre:['header', 'footer', 'SEO'], nombre_corto:['header', 'footer'],
  descripcion:['contacto', 'footer', 'SEO editorial'], telefono:['contacto', 'footer'],
  whatsapp:['pedidos'], horario:['contacto', 'footer'], direccion:['contacto', 'footer'],
  cobertura:['contacto', 'footer'], instagram:['redes', 'footer'], facebook:['redes', 'footer'],
  tiktok:['redes', 'footer'], moneda:['catálogo', 'carrito'], locale:['catálogo', 'carrito', 'SEO editorial'],
  whatsapp_activo:['pedidos'], mostrar_precios:['catálogo', 'carrito']
};

function loadBusiness(root, source = fs.readFileSync(path.join(root, paths.config))) {
  const config = loadConfig(root, source.toString('utf8'));
  const values = Object.fromEntries(Object.entries(keys).map(([field, [group, key]]) => [field, config[group][key]]));
  values.whatsapp_activo = config.whatsapp.enabled ? 'SI' : 'NO';
  values.mostrar_precios = config.order.pricesApproved ? 'SI' : 'NO';
  return {source, values, config};
}

function prepareBusiness(root, business, report, commercial) {
  const assignments = [];
  const impacts = [];
  for (const change of [...report.cambios, ...report.negocio.solicitudes]) {
    if (change.hoja !== 'DATOS_NEGOCIO') continue;
    const {campo, nuevo, tipo} = change;
    const pending = tipo !== 'modificación' && tipo !== 'borrado propuesto';
    impacts.push({campo, superficies:surfaces[campo], estado:pending ? 'verificación o autorización pendiente' : 'cambio candidato'});
    if (pending) continue;
    const [group, key] = keys[campo];
    if (campo === 'whatsapp') continue; // Se escribe en el bloque canónico.
    assignments.push(`siteConfig.${group}.${key} = ${JSON.stringify(nuevo)};`);
    if (campo === 'descripcion') assignments.push(`siteConfig.seo.description = ${JSON.stringify(nuevo)};`);
    if (campo === 'nombre') {
      const title = business.config.seo.title;
      const prefix = business.values.nombre + ' | ';
      if (title.startsWith(prefix)) {
        assignments.push(`siteConfig.seo.title = ${JSON.stringify(nuevo + title.slice(business.values.nombre.length))};`);
      }
    }
  }
  let source = business.source.toString('utf8');
  const {destinatario, whatsappActivo, mostrarPrecios} = commercial.nuevo;
  const overrides = /^[ \t]*siteConfig\.whatsapp\.(?:number|enabled) = (?:"(?:[^"\\\r\n]|\\.)*"|true|false);[ \t]*(?:\r?\n|$)/gm;
  const priceOverrides = /^[ \t]*siteConfig\.order\.pricesApproved = (?:true|false);[ \t]*(?:\r?\n|$)/gm;
  function replaceUnique(pattern, replacement, field) {
    if ([...source.matchAll(pattern)].length !== 1) throw new Error(`No se pudo identificar el bloque canónico de ${field}.`);
    source = source.replace(pattern, replacement);
  }
  if (destinatario !== business.config.whatsapp.number || whatsappActivo !== business.config.whatsapp.enabled ||
      [...source.matchAll(overrides)].length) {
    replaceUnique(/^(\s*whatsapp:\s*\{\s*number:\s*)"(?:[^"\\\r\n]|\\.)*"(\s*,\s*enabled:\s*)(?:true|false)(\s*\})/gm,
      (_, start, separator, end) => start + JSON.stringify(destinatario) + separator + whatsappActivo + end, 'WhatsApp');
    source = source.replace(overrides, '');
  }
  if (mostrarPrecios !== business.config.order.pricesApproved || [...source.matchAll(priceOverrides)].length) {
    replaceUnique(/^([ \t]*pricesApproved:\s*)(?:true|false)(\s*,)/gm,
      (_, start, end) => start + mostrarPrecios + end, 'precios');
    source = source.replace(priceOverrides, '');
  }
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const candidate = assignments.length ? source.trimEnd() + eol + eol +
    ['// Cambios comerciales propuestos desde Excel.', ...assignments, ''].join(eol) : source;
  const config = loadConfig(root, candidate);
  if (config.order.pricesApproved !== commercial.nuevo.mostrarPrecios ||
      config.whatsapp.enabled !== commercial.nuevo.whatsappActivo ||
      config.whatsapp.number !== commercial.nuevo.destinatario) {
    throw new Error('La configuración candidata no coincide con el plan comercial.');
  }
  return {candidate, impacts};
}

module.exports = {loadBusiness, prepareBusiness};
