const {createHash} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');

const validPrice = value => Number.isFinite(value) && value > 0 &&
  Number.isSafeInteger(Math.round(value * 100)) && Math.round(value * 100) / 100 === value;
const validDestination = number => typeof number === 'string' && /^[1-9]\d{7,14}$/.test(number);

function snapshot(items, config, proposed = {}) {
  return {
    mostrarPrecios:proposed.mostrarPrecios ?? config.order.pricesApproved === true,
    whatsappActivo:proposed.whatsappActivo ?? config.whatsapp.enabled === true,
    destinatario:proposed.destinatario ?? config.whatsapp.number,
    moneda:proposed.moneda ?? config.order.currency,
    locale:proposed.locale ?? config.order.locale,
    negocio:proposed.negocio ?? config.business.name,
    entrega:JSON.parse(JSON.stringify(config.order.deliveryModes)),
    productos:items.map(({id, nombre, precio, disponible, categoria}) => ({id, nombre, precio, disponible, categoria}))
  };
}

function commercialPreview(items, currentItems, config, report) {
  const value = field => report.cambios.find(change => change.hoja === 'DATOS_NEGOCIO' && change.campo === field)?.nuevo;
  const requested = field => report.negocio.solicitudes.find(change => change.campo === field)?.nuevo;
  const actual = snapshot(currentItems, config);
  const objetivo = snapshot(items, config, {
    mostrarPrecios:requested('mostrar_precios') === undefined ? actual.mostrarPrecios : requested('mostrar_precios') === 'SI',
    whatsappActivo:requested('whatsapp_activo') === undefined ? actual.whatsappActivo : requested('whatsapp_activo') === 'SI',
    destinatario:value('whatsapp'), moneda:value('moneda'), locale:value('locale'), negocio:value('nombre')
  });
  const preciosInvalidos = objetivo.productos.filter(product => product.disponible && !validPrice(product.precio));
  const bloqueos = [];
  if (objetivo.whatsappActivo && !objetivo.mostrarPrecios) bloqueos.push('WhatsApp requiere mostrar_precios=SI.');
  if (objetivo.mostrarPrecios && (preciosInvalidos.length || !objetivo.productos.some(product => product.disponible))) {
    bloqueos.push(`Hay ${preciosInvalidos.length} productos ofrecidos sin precio autorizable o no hay productos disponibles.`);
  }
  if (objetivo.whatsappActivo && !validDestination(objetivo.destinatario)) {
    bloqueos.push('El destinatario WhatsApp internacional es inválido. Incluye el código de país sin separadores.');
  }
  return {actual, objetivo, preciosInvalidos, bloqueos};
}

function selectCommercial(report, explicit) {
  const {actual, objetivo, bloqueos} = report.comercial;
  const next = explicit ? objetivo : {...objetivo, mostrarPrecios:actual.mostrarPrecios, whatsappActivo:actual.whatsappActivo};
  const wasActive = actual.mostrarPrecios || actual.whatsappActivo;
  const isActive = next.mostrarPrecios || next.whatsappActivo;
  const requiresApproval = (wasActive || isActive) && !isDeepStrictEqual(actual, next);
  if (!explicit && requiresApproval) throw new Error('Hay cambios protegidos en un sitio activo. Genera candidatos comerciales o desactiva el modo explícitamente.');
  if (explicit && bloqueos.length) throw new Error(`Activación comercial bloqueada: ${bloqueos.join(' ')}`);
  if (isActive && !explicit && (!next.mostrarPrecios ||
      !next.productos.some(product => product.disponible) ||
      next.productos.some(product => product.disponible && !validPrice(product.precio)) ||
      (next.whatsappActivo && !validDestination(next.destinatario)))) {
    throw new Error('El estado comercial vigente es inválido. Desactívalo explícitamente.');
  }
  const huella = requiresApproval ? createHash('sha256').update(JSON.stringify({report, next})).digest('hex') : null;
  return {explicito:explicit, anterior:actual, nuevo:next, huella};
}

module.exports = {commercialPreview, selectCommercial, validPrice, snapshot};
