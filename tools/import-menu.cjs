const fs = require('node:fs/promises');
const path = require('node:path');
const XLSX = require('xlsx');
const {root: ROOT, paths} = require('./studio-project.cjs');
const HEADERS = {
  MENU: ['categoria', 'nombre', 'descripcion', 'precio', 'imagen', 'destacado', 'disponible', 'orden'],
  CATEGORIAS: ['categoria', 'orden']
};
const text = value => typeof value === 'string' ? value.trim() : '';
const slug = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const PERSISTENT_HEADERS = {
  MENU: [...HEADERS.MENU, 'id', 'categoria_id'],
  CATEGORIAS: [...HEADERS.CATEGORIAS, 'id']
};

async function readCatalog(source, {root = ROOT, preview = false} = {}) {
  const book = XLSX.read(source, {
    sheets: preview ? [...Object.keys(HEADERS), 'DATOS_NEGOCIO'] : Object.keys(HEADERS), cellDates: true, cellFormula: true,
    cellHTML: false, cellText: false, bookVBA: false, sheetStubs: true
  });
  const errors = [], warnings = [];
  const hasFormula = cell => cell.f != null || cell.F != null;
  const persistent = preview && Object.keys(HEADERS).some(name =>
    Object.keys(book.Sheets[name] || {}).some(address =>
      /^[A-Z]+1$/.test(address) && ['id', 'categoria_id'].includes(book.Sheets[name][address].v)));
  const schema = persistent ? PERSISTENT_HEADERS : HEADERS;
  const businessSheet = book.Sheets.DATOS_NEGOCIO;
  function rows(name) {
    const sheet = book.Sheets[name];
    if (!sheet) { errors.push(`Falta la hoja ${name}.`); return []; }
    const headers = schema[name];
    const populatedRows = new Map();
    let extraColumn = false;
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!') || (!hasFormula(cell) && (cell.v == null || cell.v === ''))) continue;
      const {r, c} = XLSX.utils.decode_cell(address);
      if (c >= headers.length) { extraColumn = true; continue; }
      if (!populatedRows.has(r)) populatedRows.set(r, []);
      populatedRows.get(r)[c] = cell;
    }
    const header = populatedRows.get(0) || [];
    if (extraColumn || headers.some((h, i) => !header[i] || hasFormula(header[i]) || header[i].t !== 's' || header[i].v !== h)) {
      errors.push(`${name}: columnas incorrectas; usa ${headers.join(', ')}.`); return [];
    }
    const result = [];
    for (const [r, cells] of [...populatedRows].sort(([a], [b]) => a - b)) {
      if (r === 0) continue;
      const n = r + 1;
      const values = headers.map((h, i) => {
        const cell = cells[i];
        if (!cell) return null;
        if (hasFormula(cell)) {
          errors.push(`${name} fila ${n}: ${h} no admite fórmulas.`);
          return null;
        }
        if (cell.t === 's') return cell.v.trim();
        if (cell.t === 'n' && Number.isFinite(cell.v)) return cell.v;
        return null;
      });
      const item = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
      item.row = n;
      for (const h of headers) if (item[h] == null || text(item[h]) === '' && typeof item[h] !== 'number') errors.push(`${name} fila ${n}: ${h} vacío o no es un valor simple.`);
      result.push(item);
    }
    return result;
  }
  const categories = rows('CATEGORIAS');
  const products = rows('MENU');
  if (!categories.length) errors.push('CATEGORIAS: agrega al menos una categoría.');
  if (!products.length) errors.push('MENU: agrega al menos un producto.');
  const names = new Map(), ids = new Set(), productKeys = new Set();
  const categoryIds = new Map();
  const imageDirectory = path.join(root, paths.photos);
  const images = preview ? new Set((await fs.readdir(imageDirectory, {withFileTypes:true})).filter(entry => entry.isFile()).map(entry => entry.name)) : null;
  function checkId(item, seen, fail) {
    const raw = text(item.id);
    item.alta = raw.startsWith('alta:');
    item.id = item.alta ? raw.slice(5) : raw;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) fail('ID inválido');
    else if (seen.has(item.id)) fail(`ID duplicado "${item.id}"`);
  }
  function order(item, sheet) {
    if (typeof item.orden !== 'number' || !Number.isSafeInteger(item.orden) || item.orden <= 0) errors.push(`${sheet} fila ${item.row}: orden inválido; debe ser entero positivo.`);
  }
  for (const c of categories) {
    c.categoria = text(c.categoria);
    if (preview && !c.categoria) errors.push(`CATEGORIAS fila ${c.row}: categoria debe ser texto.`);
    if (names.has(c.categoria)) errors.push(`CATEGORIAS fila ${c.row}: categoría duplicada "${c.categoria}".`);
    names.set(c.categoria, c);
    if (persistent) {
      checkId(c, categoryIds, message => errors.push(`CATEGORIAS fila ${c.row}: ${message}.`));
      categoryIds.set(c.id, c);
    }
    order(c, 'CATEGORIAS');
  }
  for (const p of products) {
    const fail = message => errors.push(`MENU fila ${p.row}: ${message}.`);
    p.nombre = text(p.nombre); p.categoria = text(p.categoria); p.descripcion = text(p.descripcion); p.imagen = text(p.imagen);
    if (preview && !p.nombre) fail('nombre debe ser texto');
    if (preview && !p.descripcion) fail('descripcion debe ser texto');
    const categorySlug = slug(p.categoria);
    const nameSlug = slug(p.nombre);
    if (persistent) checkId(p, ids, fail);
    else p.id = `${categorySlug}-${nameSlug}`;
    if (!preview && (!categorySlug || !nameSlug)) fail('categoría o nombre no genera un ID seguro');
    else {
      const key = JSON.stringify([p.categoria, p.nombre]);
      if (productKeys.has(key)) fail(`producto duplicado dentro de la categoría "${p.categoria}": "${p.nombre}"`);
      else if (!preview && ids.has(p.id)) fail(`ID duplicado "${p.id}" tras normalizar categoría y nombre`);
      productKeys.add(key);
      ids.add(p.id);
    }
    if (!names.has(p.categoria)) fail(`categoría "${p.categoria}" no existe`);
    if (persistent && categoryIds.get(p.categoria_id) !== names.get(p.categoria)) fail('categoria_id no coincide con categoria');
    if (typeof p.precio === 'string' && /^\d+(\.\d+)?$/.test(p.precio.trim())) p.precio = Number(p.precio.trim());
    if (typeof p.precio !== 'number' || !Number.isFinite(p.precio) || p.precio < 0) fail('precio inválido; usa un número no negativo');
    for (const key of ['destacado', 'disponible']) {
      const value = text(p[key]);
      if (!['SI', 'NO'].includes(value)) fail(`${key} debe ser SI o NO`);
      p[key] = value === 'SI';
    }
    order(p, 'MENU');
    if (!/^[a-z0-9][a-z0-9_-]*\.(webp|png|jpe?g|svg)$/.test(p.imagen) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(p.imagen)) fail('nombre de imagen problemático; usa minúsculas, números, guiones y extensión válida, sin rutas');
    else if (preview) {
      if (!images.has(p.imagen)) fail(`imagen inexistente o nombre con mayúsculas incorrectas: ${p.imagen}`);
    } else {
      try { if (!(await fs.stat(path.join(imageDirectory, p.imagen))).isFile()) throw new Error(); }
      catch { warnings.push(`Imagen pendiente: ${p.imagen}`); }
    }
    if (p.descripcion.length > 140) warnings.push(`MENU fila ${p.row}: descripción mayor a 140 caracteres.`);
    if (p.destacado && !p.disponible) warnings.push(`MENU fila ${p.row}: destacado no disponible; no aparecerá en especialidades.`);
  }
  if (errors.length) return {errors, warnings, categories, products, persistent, businessSheet};
  categories.sort((a, b) => a.orden - b.orden || a.row - b.row);
  const rank = new Map(categories.map((c, i) => [c.categoria, i]));
  products.sort((a, b) => rank.get(a.categoria) - rank.get(b.categoria) || a.orden - b.orden || a.row - b.row);
  for (const c of categories) if (!products.some(p => p.categoria === c.categoria)) warnings.push(`Categoría sin productos: ${c.categoria}; el motor no mostrará su filtro.`);
  return {errors, warnings, categories, products, persistent, businessSheet};
}

async function generate(input = path.join(ROOT, 'templates/menu-cliente.xlsx'), {write = false, root = ROOT} = {}) {
  const {errors, warnings, products} = await readCatalog(await fs.readFile(input), {root});
  if (errors.length) throw new Error(errors.join('\n'));
  const items = catalogItems(products);
  const code = serializeCatalog(items);
  const output = path.join(root, write ? paths.catalog : path.join(paths.temporary, 'menu-data.generated.js'));
  await fs.mkdir(path.dirname(output), {recursive:true});
  await fs.writeFile(output, code, 'utf8');
  return {output, warnings, items};
}

function catalogItems(products) {
  return products.map(p => ({id:p.id, nombre:p.nombre, descripcion:p.descripcion, precio:p.precio,
    categoria:p.categoria, imagen:`${paths.photos}/${p.imagen}`, disponible:p.disponible, destacado:p.destacado,
    ...(p.categoria_id ? {categoria_id:p.categoria_id} : {})}));
}

function serializeCatalog(items) {
  return '// Generado desde Excel. Categorías y productos ordenados; destacado selecciona especialidades.\nconst menuItems = ' + JSON.stringify(items, null, 2) + ';\n';
}

async function main(args) {
  if (args.includes('--help')) { console.log('node tools/import-menu.cjs [archivo.xlsx] [--write]'); return; }
  const files = args.filter(a => !a.startsWith('--'));
  if (files.length > 1 || args.some(a => a.startsWith('--') && a !== '--write')) throw new Error('Argumentos inválidos. Usa [archivo.xlsx] [--write].');
  const result = await generate(files[0] ? path.resolve(files[0]) : undefined, {write:args.includes('--write')});
  result.warnings.forEach(w => console.warn(w));
  console.log(`Menú generado: ${result.output} (${result.items.length} productos). DATOS_NEGOCIO se aplica manualmente en config.js.`);
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {generate, readCatalog, PERSISTENT_HEADERS, catalogItems, serializeCatalog};
