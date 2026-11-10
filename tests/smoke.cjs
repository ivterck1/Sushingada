const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {loadConfig} = require('../tools/sync-seo.cjs');
const {readMenu} = require('../tools/generate-menu-html.cjs');
const {synchronizePromotions} = require('../tools/promotions-html.cjs');

const root = process.env.SITE_ARTIFACT ? path.resolve(process.env.SITE_ARTIFACT) : path.resolve(__dirname, '..');
const origin = 'https://restaurant.test';
const config = loadConfig(root);
const catalog = readMenu(readFileSync(path.join(root, 'js/menu-data.js'), 'utf8'));
const firstDish = catalog.find(product => product.disponible);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css'], ['.js', 'text/javascript'],
  ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.ico', 'image/x-icon'], ['.woff2', 'font/woff2']
]);

async function visit(browser, {width = 1200, prefix = '/', javaScriptEnabled = true, approved = false, broken = false, promotions, reducedMotion = 'reduce'} = {}) {
  const page = await browser.newPage({viewport:{width,height:900}, javaScriptEnabled, reducedMotion});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const name = url.pathname.slice(prefix.length) || 'index.html';
    const contentType = types.get(path.extname(name));
    if (url.origin !== origin || !url.pathname.startsWith(prefix) || !contentType ||
        !/^(?:index\.html|(?:assets|css|js)\/[\w./-]+)$/.test(name) || name.split('/').includes('..')) return route.abort();
    let body;
    try { body = await fs.readFile(path.join(root, name)); }
    catch (error) { if (error.code === 'ENOENT') return route.abort(); throw error; }
    if (name === 'js/config.js') {
      const checkout = {pricesApproved:approved, deliveryModes:[
        {id:'recoger',label:'Recogida de prueba',requiresAddress:false},
        {id:'domicilio',label:'Domicilio de prueba',requiresAddress:true}
      ]};
      const whatsapp = {enabled:approved, number:approved ? '12025550123' : ''};
      body = body.toString() + `\nObject.assign(siteConfig.order, ${JSON.stringify(checkout)}); siteConfig.whatsapp = ${JSON.stringify(whatsapp)};`;
    }
    if (broken && name === 'index.html') {
      body = body.toString().replace(/(<article class="menu-card"[^>]*>[\s\S]*?<img )([^>]+)/,
        (_, open, attrs) => open + attrs.replace(/src="[^"]+"/, 'src="assets/images/products/ausente.webp"')
          .replace(' data-image-state="fallback"', ''));
    }
    if (promotions && name === 'index.html') body = synchronizePromotions(body.toString(), promotions);
    return route.fulfill({body, contentType});
  });
  await page.goto(origin + prefix);
  return {page, errors};
}

test('catálogo y SEO iniciales funcionan sin JavaScript en raíz y subdirectorio', async t => {
  const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  t.after(() => browser.close());
  for (const prefix of ['/', '/demo/']) {
    const {page} = await visit(browser, {prefix, javaScriptEnabled:false});
    assert.equal(await page.title(), config.seo.title);
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), config.seo.robots);
    const canonical = page.locator('link[rel=canonical]');
    assert.equal(await canonical.count(), config.seo.canonicalUrl ? 1 : 0);
    const category = page.locator('.menu-category-index a').last();
    const anchor = await category.getAttribute('href');
    await category.click();
    assert.equal(new URL(page.url()).hash, anchor);
    assert.ok(await page.locator(anchor).isVisible());
    assert.ok(await page.locator('.menu-card').first().isVisible());
    assert.equal(await page.locator('.menu-card button').count(), 0);
    await page.close();
  }
});

test('demo protege pedidos y reemplaza una foto fallida', async t => {
  const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  t.after(() => browser.close());
  const {page, errors} = await visit(browser, {broken:true});
  const image = page.locator('.menu-card img').first();
  await page.getByRole('button', {name:firstDish.categoria, exact:true}).click();
  await image.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const image = document.querySelector('.menu-card img');
    return image.dataset.imageState === 'fallback' && image.naturalWidth > 0;
  });
  assert.equal(await image.getAttribute('src'), config.images.productPlaceholder);
  await page.locator('.menu-card:visible button').first().click();
  assert.ok(await page.locator('.whatsapp-button').isDisabled());
  assert.equal(await page.locator('#cart-total').textContent(), '—');
  assert.deepEqual(errors, []);
});

test('carrito, navegación, foco, persistencia y pedido en tres anchos', async t => {
  const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  t.after(() => browser.close());
  for (const width of [1440,390,375]) {
    const {page, errors} = await visit(browser, {width, approved:true});
    const mobile = width < 768;
    if (!mobile) {
      await page.locator('.nav-links a[href="#menu"]').click();
      await page.waitForFunction(() => document.querySelector('.nav-links a[href="#menu"]').getAttribute('aria-current') === 'location');
      assert.equal(new URL(page.url()).hash, '#menu');
    }
    const category = page.getByRole('button', {name:firstDish.categoria, exact:true});
    await category.click();
    assert.equal(await category.getAttribute('aria-pressed'), 'true');
    await page.locator('.menu-card:visible button').first().click();
    if (mobile) await page.waitForFunction(() => /añadido/i.test(document.querySelector('#cart-status').textContent));
    const opener = page.locator('#mobile-order-toggle');
    if (mobile) {
      await opener.click();
      assert.ok(await page.locator('#mobile-cart-dialog').evaluate(dialog => dialog.open));
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mobile-order-close');
      await page.keyboard.press('Shift+Tab');
      assert.ok(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)));
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mobile-order-toggle');
      await opener.click();
    }
    await page.locator('[data-action=increase]').click();
    assert.equal(await page.evaluate(() => calculateCartSubtotal()), Math.round(firstDish.precio * 100) * 2 / 100);
    await page.locator('[data-action=decrease]').click();
    await page.reload();
    assert.equal(await page.locator('#header-cart-count').textContent(), '1');
    if (mobile) await opener.click();
    await page.evaluate(() => { window.open = url => { window.testOrderUrl = url; }; });
    const send = page.locator('.whatsapp-button');
    await send.click();
    assert.match(await page.locator('#order-message').innerText(), /nombre/i);
    await page.locator('#customer-name').fill('Persona de prueba');
    await page.locator('[value=domicilio]').check();
    await send.click();
    assert.match(await page.locator('#order-message').innerText(), /dirección/i);
    await page.locator('#customer-address').fill('Domicilio ficticio');
    await send.click();
    const order = new URL(await page.evaluate(() => window.testOrderUrl));
    assert.equal(order.origin + order.pathname, 'https://wa.me/12025550123');
    assert.match(order.searchParams.get('text'), /Dirección: Domicilio ficticio/);
    await page.locator('[value=recoger]').check();
    assert.ok(await page.locator('#customer-address').isHidden());
    await send.click();
    assert.doesNotMatch(new URL(await page.evaluate(() => window.testOrderUrl)).searchParams.get('text'), /Dirección:/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('carrusel demo: navegación circular, teclado, selección y ancho estable', async t => {
  const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  t.after(() => browser.close());
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    const {page, errors} = await visit(browser, {width});
    const section = page.locator('#promociones');
    const stage = section.locator('.promotion-stage');
    const panels = section.locator('[data-campaign]');
    const counter = section.locator('.promotion-counter');
    const next = section.getByRole('button', {name:'Promoción siguiente'});
    const previous = section.getByRole('button', {name:'Promoción anterior'});
    const active = section.locator('[data-campaign][data-active]');
    assert.equal(await panels.count(), 3);
    assert.equal(await active.getAttribute('data-campaign'), 'crazy-fridays');
    assert.equal(await counter.textContent(), '01 / 03');
    assert.equal(await active.getByRole('heading').textContent(), '3×1');
    const height = (await stage.boundingBox()).height;
    await previous.click();
    assert.equal(await active.getAttribute('data-campaign'), 'combo-ngada');
    await next.click();
    assert.equal(await active.getAttribute('data-campaign'), 'crazy-fridays');
    await next.click();
    assert.equal(await active.getAttribute('data-campaign'), 'birthday-ngada');
    assert.equal(await counter.textContent(), '02 / 03');
    assert.equal(await section.getByRole('button', {name:'Mostrar Birthday Ngada'}).getAttribute('aria-current'), 'true');
    assert.match(await section.getByRole('status').textContent(), /Birthday Ngada/);
    assert.equal(await section.locator('[data-campaign][inert][aria-hidden="true"]').count(), 2);
    assert.equal(await active.locator('.promotion-photos').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await active.getAttribute('data-campaign'), 'crazy-fridays');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.ok(await next.evaluate(node => document.activeElement === node && node.matches(':focus-visible')));
    await section.getByRole('button', {name:'Mostrar Combo Ngada'}).click();
    assert.equal(await counter.textContent(), '03 / 03');
    assert.equal((await stage.boundingBox()).height, height);
    if (width === 390) {
      await stage.dispatchEvent('pointerdown', {pointerType:'touch',pointerId:1,isPrimary:true,clientX:250,clientY:80});
      await stage.dispatchEvent('pointerup', {pointerType:'touch',pointerId:1,isPrimary:true,clientX:160,clientY:85});
      assert.equal(await active.getAttribute('data-campaign'), 'crazy-fridays');
      await stage.dispatchEvent('pointerdown', {pointerType:'touch',pointerId:1,isPrimary:true,clientX:250,clientY:80});
      await stage.dispatchEvent('pointerup', {pointerType:'touch',pointerId:1,isPrimary:true,clientX:180,clientY:240});
      assert.equal(await active.getAttribute('data-campaign'), 'crazy-fridays');
    }
    assert.equal(await active.getByRole('link', {name:'Explorar menú'}).getAttribute('href'), '#menu');
    await active.getByRole('link', {name:'Explorar menú'}).click();
    await page.waitForFunction(() => location.hash === '#menu');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('carrusel demo: HTML sin JavaScript, campañas desactivadas y animación opcional', async t => {
  const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  t.after(() => browser.close());
  const offline = await visit(browser, {javaScriptEnabled:false, prefix:'/demo/'});
  assert.ok(await offline.page.getByRole('heading', {name:'3×1'}).isVisible());
  assert.equal(await offline.page.locator('.promotion-layout:visible').count(), 1);
  assert.ok(await offline.page.locator('.promotion-controls').isHidden());
  await offline.page.close();

  const single = await visit(browser, {promotions:config.promotions.map(campaign => ({
    ...campaign, enabled:campaign.id === 'birthday-ngada'
  }))});
  assert.equal(await single.page.locator('[data-campaign]').count(), 1);
  assert.equal(await single.page.locator('[data-active]').getAttribute('data-campaign'), 'birthday-ngada');
  assert.ok(await single.page.locator('.promotion-controls').isHidden());
  await single.page.close();

  const none = await visit(browser, {promotions:config.promotions.map(campaign => ({...campaign,enabled:false}))});
  assert.ok(await none.page.locator('.promotions-empty').isVisible());
  assert.ok(await none.page.locator('.promotion-controls').isHidden());
  await none.page.close();

  const animated = await visit(browser, {reducedMotion:'no-preference'});
  await animated.page.getByRole('button', {name:'Promoción siguiente'}).click();
  assert.equal(await animated.page.locator('[data-active] .promotion-photos')
    .evaluate(node => getComputedStyle(node).animationName), 'promotion-frame');
  await animated.page.close();
});
