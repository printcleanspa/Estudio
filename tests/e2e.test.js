'use strict';
/* Prueba de extremo a extremo con navegador real (Playwright). Se omite si Playwright/Chromium no está disponible. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const sharp = require('sharp');
const { createApp } = require('../server/app');

let chromium;
try { ({ chromium } = require('playwright')); } catch { /* no disponible */ }

test('flujo completo en el navegador: marca → logo → foto → imagen → aprobar → editor → exportar', { skip: !chromium && 'Playwright no instalado', timeout: 120000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-e2e-'));
  const shots = process.env.SHOTS_DIR;
  const server = http.createServer(createApp({ dataDir, env: {} })); await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const logoPath = path.join(dataDir, 'logo.png'), prodPath = path.join(dataDir, 'toner.png');
  await sharp({ create: { width: 400, height: 160, channels: 4, background: '#0a4d9c' } }).png().toFile(logoPath);
  await sharp({ create: { width: 500, height: 700, channels: 4, background: '#222222' } }).png().toFile(prodPath);
  const browser = await chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 860 } });
  const page = await ctx.newPage(); const errors = [];
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/api/auth/me')) errors.push(r.status() + ' ' + r.url()); }); page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = (n) => shots && page.screenshot({ path: path.join(shots, `${n}.png`) });
  try {
    await page.goto(url);
    await page.fill('#l-name', 'Michael'); await page.fill('#l-email', 'm@test.cl'); await page.fill('#l-pass', 'clavesegura123'); await page.click('#l-go');
    await page.waitForSelector('text=Hola, Michael'); await shot('01-inicio');

    // Identidad: logo + color
    await page.click('a[href="#/identity"]');
    await page.waitForSelector('#logo-file'); await page.setInputFiles('#logo-file', logoPath); await page.click('#logo-up');
    await page.waitForSelector('text=Vigente');
    await page.click('text=＋ Color'); await page.click('#brand-save'); await page.waitForSelector('text=Marca guardada'); await shot('02-identidad');

    // Biblioteca: subir producto
    await page.click('a[href="#/library"]'); await page.waitForSelector('#up-file');
    await page.selectOption('#up-kind', 'product'); await page.setInputFiles('#up-file', prodPath); await page.click('#up-go');
    await page.waitForSelector('text=toner.png'); await shot('03-biblioteca');

    // Generar imagen local
    await page.click('a[href="#/images"]'); await page.click('#pick-src'); await page.click('.picker img >> nth=0');
    await page.selectOption('#fmt', 'ig-4x5'); await page.fill('#headline', 'Tóner para su impresora'); await page.fill('#subline', 'Consulte por mayor');
    await page.click('#gen'); await page.waitForSelector('#result-img'); await shot('04-generador');
    assert.ok(await page.isDisabled('text=Abrir en el editor'), 'no se puede usar sin aprobar');
    await page.click('#approve-img'); await page.waitForSelector('text=Imagen aprobada');
    await page.click('text=Abrir en el editor'); await page.waitForSelector('canvas.upper-canvas');
    await page.waitForFunction(() => window.__editor && window.__editor.canvas.getObjects().length === 1);

    // Editor: agregar texto, guardar, aprobar, exportar
    await page.click('text=＋ Texto'); await page.click('text=★ Logo de la marca');
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 3);
    assert.ok(await page.isDisabled('[data-exp="png"]'), 'exportar bloqueado antes de aprobar');
    await page.click('button:text-is("Guardar")'); await page.waitForSelector('text=Diseño guardado');
    await page.click('button:text-is("Aprobar")'); await page.waitForSelector('text=Diseño aprobado'); await shot('05-editor');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-exp="png"]')]);
    const f = path.join(dataDir, 'descarga.png'); await dl.saveAs(f);
    const md = await sharp(f).metadata(); assert.equal(md.width, 1080); assert.equal(md.height, 1350);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-exp="pdf"]')]);
    const pf = path.join(dataDir, 'descarga.pdf'); await dl2.saveAs(pf); assert.equal(fs.readFileSync(pf).subarray(0, 4).toString(), '%PDF');

    // Editar tras aprobar bloquea la exportación otra vez
    await page.click('text=Rectángulo');
    await page.waitForFunction(() => document.querySelector('[data-exp="png"]').disabled);

    // Inicio refleja la actividad
    await page.click('a[href="#/home"]'); await page.waitForSelector('text=Archivos exportados'); await shot('06-inicio-final');
    // Conectores
    await page.click('a[href="#/connectors"]'); await page.waitForSelector('text=No configurado'); await shot('07-conectores');
    // Móvil
    const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true }); const mp = await m.newPage();
    await mp.goto(url); await mp.fill('#l-email', 'm@test.cl'); await mp.fill('#l-pass', 'clavesegura123'); await mp.click('#l-go'); await mp.waitForSelector('text=Hola, Michael');
    assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sin scroll horizontal en móvil');
    if (shots) await mp.screenshot({ path: path.join(shots, '08-movil.png') });
    await m.close();
    assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), [], 'sin errores en consola');
  } finally { await browser.close(); server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
