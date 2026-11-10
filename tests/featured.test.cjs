const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function render(items) {
  const element = () => ({children: [], dataset: {}, addEventListener() {}, append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }});
  const grid = element();
  const context = vm.createContext({window: {matchMedia: () => ({matches:false})}, document: {
    querySelector: selector => selector === '#featured-grid' ? grid : null,
    querySelectorAll: () => [],
    createElement: element,
    addEventListener() {}
  }});
  vm.runInContext(fs.readFileSync('js/config.js', 'utf8'), context);
  context.menuItems = items;
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
  vm.runInContext('renderFeaturedProducts()', context);
  // Leer los títulos renderizados, no repetir el algoritmo de selección.
  const names = () => grid.children.map(card => card.children[1].children[0].textContent);
  const first = names();
  vm.runInContext('renderFeaturedProducts()', context);
  assert.deepEqual(names(), first, 'volver a renderizar no duplica tarjetas');
  assert.deepEqual(items, context.menuItems, 'no modifica el catálogo');
  return first;
}
const product = (nombre, destacado, disponible = true) => Object.freeze({nombre, destacado, disponible, precio: 10, descripcion: 'Ejemplo', imagen: 'assets/images/products/placeholder.svg'});

test('tres destacados respetan el orden del catálogo', () => {
  assert.deepEqual(render(Object.freeze([product('Normal', false), product('C', true), product('A', true), product('B', true)])), ['C', 'A', 'B']);
});
test('como máximo tres destacados', () => {
  assert.deepEqual(render([product('A', true), product('B', true), product('C', true), product('D', true)]), ['A', 'B', 'C']);
});
test('un solo destacado no se completa con otros productos', () => {
  assert.deepEqual(render([product('Normal', false), product('Único', true), product('Otro', false)]), ['Único']);
});
test('dos destacados no se completan con otros productos', () => {
  assert.deepEqual(render([product('A', true), product('Normal', false), product('B', true)]), ['A', 'B']);
});
test('destacado no disponible se excluye', () => {
  assert.deepEqual(render([product('Agotado', true, false), product('Normal', false), product('Disponible', true)]), ['Disponible']);
});
test('si todos los destacados están agotados no se sustituyen por no destacados', () => {
  assert.deepEqual(render([product('Agotado', true, false), product('Normal', false)]), []);
});
test('sin destacados usa los primeros tres disponibles, incluidos catálogos antiguos', () => {
  assert.deepEqual(render([product('Agotado', false, false), product('A', undefined), product('B', false), product('C', undefined), product('D', false)]), ['A', 'B', 'C']);
});
test('catálogo vacío no genera tarjetas', () => {
  assert.deepEqual(render([]), []);
});
