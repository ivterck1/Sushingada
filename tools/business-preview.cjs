const XLSX = require('xlsx');

const sheetName = 'DATOS_NEGOCIO';
const clear = '[BORRAR]';
const headers = ['campo', 'valor'];
const schema = {
  nombre: {required:true},
  nombre_corto: {required:true},
  descripcion: {required:true},
  telefono: {pattern:/^(?:\+[1-9]\d{6,14}|\d{7,15})$/, expected:'teléfono de 7 a 15 dígitos, con + internacional opcional'},
  whatsapp: {pattern:/^[1-9]\d{7,14}$/, expected:'número internacional de 8 a 15 dígitos sin + ni separadores'},
  whatsapp_activo: {required:true, pattern:/^(SI|NO)$/, expected:'SI o NO', requestOnly:true},
  horario: {},
  direccion: {},
  cobertura: {},
  instagram: {hosts:['instagram.com', 'www.instagram.com']},
  facebook: {hosts:['facebook.com', 'www.facebook.com', 'm.facebook.com']},
  tiktok: {hosts:['tiktok.com', 'www.tiktok.com']},
  moneda: {required:true, intl:'currency'},
  locale: {required:true, intl:'locale'},
  mostrar_precios: {required:true, pattern:/^(SI|NO)$/, expected:'SI o NO', requestOnly:true}
};
const currencies = new Set(Intl.supportedValuesOf('currency'));
const formula = cell => cell?.f != null || cell?.F != null;
const cellText = cell => !formula(cell) && cell?.t === 's' ? cell.v.trim() : null;

function businessRows(values, fields = schema) {
  return [[...headers], ...Object.keys(fields).map(field => [field, values[field] ?? ''])];
}

function socialLink(field, value, hosts) {
  const handle = /^[a-z0-9_][a-z0-9_.-]{0,99}$/i;
  const reserved = /^(?:accounts|about|business|community|embed|explore|help|l\.php|login|logout|oauth|p|privacy|profile\.php|reel|reels|redirect|search|share|sharer\.php|stories|terms|watch)$/i;
  const validHandle = name => handle.test(name) && !reserved.test(name) && !name.endsWith('.') && !name.includes('..');
  const name = value.replace(/^@/, '');
  if (validHandle(name)) {
    return {url:`https://${hosts[1]}/${field === 'tiktok' ? '@' : ''}${name}`, fromHandle:true};
  }
  if (!/^https:\/\//i.test(value) || /[\s\\\x00-\x1f\x7f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!hosts.includes(url.hostname) || url.username || url.password || url.port || url.hash) return null;
    if (field === 'facebook' && url.pathname === '/profile.php' && /^\?id=\d+$/.test(url.search)) return {url:url.href};
    const segment = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if (!segment || url.search || (field === 'tiktok' ? !segment.startsWith('@') || !validHandle(segment.slice(1)) : !validHandle(segment))) return null;
    return {url:url.href};
  } catch {
    return null;
  }
}

function previewBusiness(sheet, previous, fields = schema) {
  const result = {errores:[], advertencias:[], cambios:[], solicitudes:[]};
  const issue = (list, fila, campo, mensaje) => result[list].push({hoja:sheetName, fila, campo, mensaje});
  const rows = new Set();
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!') || !formula(cell) && (cell.v == null || cell.v === '')) continue;
    const {r, c} = XLSX.utils.decode_cell(address);
    if (c > 1) issue('errores', r + 1, null, 'Solo se admiten las columnas campo y valor.');
    else if (r > 0) rows.add(r + 1);
  }
  if (cellText(sheet.A1) !== headers[0] || cellText(sheet.B1) !== headers[1]) {
    issue('errores', 1, null, 'Encabezados requeridos: campo y valor.');
    return result;
  }
  const seen = new Set();
  for (const fila of [...rows].sort((a, b) => a - b)) {
    const key = sheet[`A${fila}`], cell = sheet[`B${fila}`];
    const campo = cellText(key);
    const error = mensaje => issue('errores', fila, campo, mensaje);
    const warn = mensaje => issue('advertencias', fila, campo, mensaje);
    if (formula(key) || formula(cell)) { error('No se admiten fórmulas.'); continue; }
    if (!campo || !Object.hasOwn(fields, campo)) { error('Campo desconocido o vacío.'); continue; }
    if (seen.has(campo)) { error('Campo duplicado.'); continue; }
    seen.add(campo);
    const rule = fields[campo];
    let value = cellText(cell);
    if (value === null && cell?.v != null && cell.v !== '') { error('El valor debe ser texto.'); continue; }
    if (!value) {
      if (rule.required) error('El valor es obligatorio.');
      continue;
    }
    const anterior = previous[campo] ?? '';
    const location = {hoja:sheetName, fila, campo};
    if (value === clear) {
      if (rule.required) error('No se puede borrar un campo obligatorio.');
      else if (anterior) result.cambios.push({...location, tipo:'borrado propuesto', anterior, nuevo:''});
      else warn('El campo ya está vacío.');
      continue;
    }
    if (rule.pattern && !rule.pattern.test(value)) { error(`Formato requerido: ${rule.expected}.`); continue; }
    if (rule.intl === 'currency' && !currencies.has(value)) { error('Usa un código de moneda ISO de tres letras admitido.'); continue; }
    if (rule.intl === 'locale') {
      try {
        if (!Intl.NumberFormat.supportedLocalesOf(value).length) throw new Error();
      } catch { error('Usa una configuración regional válida y admitida, como es-MX.'); continue; }
    }
    if (rule.hosts) {
      const link = socialLink(campo, value, rule.hosts);
      if (!link) { error('Usa una URL HTTPS de perfil de la red o un usuario válido.'); continue; }
      if (link.fromHandle) warn(`Enlace construido desde el usuario: ${link.url}. No se comprobó la existencia del perfil.`);
      value = link.url;
    }
    if (rule.requestOnly) {
      if (value === 'SI') {
        warn('Solicitud pendiente. Requiere autorización comercial separada.');
        result.solicitudes.push({...location, tipo:'activación solicitada', anterior, nuevo:value});
      } else if (value !== anterior) {
        result.solicitudes.push({...location, tipo:'desactivación solicitada', anterior, nuevo:value});
      }
      continue;
    }
    if (value !== anterior) result.cambios.push({...location, tipo:'modificación', anterior, nuevo:value});
  }
  for (const [campo, rule] of Object.entries(fields)) {
    if (rule.required && !seen.has(campo)) issue('errores', null, campo, 'Falta el campo obligatorio.');
  }
  return result;
}

function validSocialUrl(field, value) {
  const hosts = Object.hasOwn(schema, field) && schema[field].hosts;
  const link = hosts && typeof value === 'string' && socialLink(field, value, hosts);
  return Boolean(link && !link.fromHandle);
}

function validPhone(value) {
  return typeof value === 'string' && schema.telefono.pattern.test(value);
}

module.exports = {businessRows, previewBusiness, sheetName, validSocialUrl, validPhone};
