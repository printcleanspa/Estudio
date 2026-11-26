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
    await page.waitForSelector('text=Asistente de textos no disponible');
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
    await page.click('a[href="#/connectors"]'); await page.waitForSelector('text=No disponible'); await shot('07-conectores');
    // Móvil
    const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true }); const mp = await m.newPage();
    await mp.goto(url); await mp.fill('#l-email', 'm@test.cl'); await mp.fill('#l-pass', 'clavesegura123'); await mp.click('#l-go'); await mp.waitForSelector('text=Hola, Michael');
    assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sin scroll horizontal en móvil');
    if (shots) await mp.screenshot({ path: path.join(shots, '08-movil.png') });
    await m.close();
    assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), [], 'sin errores en consola');
  } finally { await browser.close(); server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('navegador: asistente de textos con Ollama (simulado) rellena el titular y no deja pasar cifras inventadas', { skip: !chromium && 'Playwright no instalado', timeout: 90000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-e2e2-'));
  const fake = http.createServer(async (req, res) => {
    for await (const c of req); res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'llama-test:latest', size: 1 }] }));
    if (req.url === '/api/chat') return res.end(JSON.stringify({ message: { content: JSON.stringify({ opciones: [{ titular: 'Papel para su oficina', apoyo: 'Consulte por mayor' }, { titular: 'Solo 50% de descuento', apoyo: 'Hoy' }] }) } }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => fake.listen(0, r));
  const server = http.createServer(createApp({ dataDir, env: { OLLAMA_HOST: `http://127.0.0.1:${fake.address().port}` } })); await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(); const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.fill('#l-email', 'm@test.cl'); await page.fill('#l-pass', 'clavesegura123'); await page.click('#l-go'); await page.waitForSelector('text=Hola');
    await page.click('a[href="#/images"]'); await page.waitForSelector('#ai-go');
    await page.fill('#ai-notes', 'Resmas de papel para oficina'); await page.click('#ai-go');
    await page.waitForSelector('text=Papel para su oficina');
    assert.equal(await page.locator('text=50% de descuento').count(), 0, 'la opción con cifra inventada no se muestra');
    await page.click('text=Usar este'); assert.equal(await page.inputValue('#headline'), 'Papel para su oficina');
    await page.click('a[href="#/connectors"]'); await page.waitForSelector('text=llama-test:latest');
    await page.screenshot({ path: path.join(os.tmpdir(), 'conectores-ollama.png') });
  } finally { await browser.close(); server.close(); fake.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('navegador: música, Reel con foto+música, vista previa, versión final, aprobación y guion de marketing', { skip: !chromium && 'Playwright no instalado', timeout: 170000 }, async () => {
  const { execFileSync } = require('node:child_process');
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { return; }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-e2e3-'));
  const fake = http.createServer(async (req, res) => {
    const c = []; for await (const x of req) c.push(x); let body = {}; try { body = JSON.parse(Buffer.concat(c).toString()); } catch { /* */ } res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'llama-test:latest', size: 1 }] }));
    if (req.url === '/api/chat') { const key = Object.keys(body.format?.properties || {})[0];
      const out = key === 'titulo' ? { titulo: 'Tóner compatible', escenas: [{ texto_en_pantalla: 'Tóner compatible', locucion: 'Tenemos tóner compatible.', segundos: 2 }, { texto_en_pantalla: 'Pida por WhatsApp', locucion: 'Escríbanos.', segundos: 2 }] }
        : { opciones: [{ texto: 'Papel para su oficina', hashtags: ['oficina'], llamado_a_la_accion: 'Escríbanos' }] };
      return res.end(JSON.stringify({ message: { content: JSON.stringify(out) } })); }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => fake.listen(0, r));
  const server = http.createServer(createApp({ dataDir, env: { OLLAMA_HOST: `http://127.0.0.1:${fake.address().port}` } })); await new Promise((r) => server.listen(0, r));
  const p1 = path.join(dataDir, 'a.png'), p2 = path.join(dataDir, 'b.png'), wav = path.join(dataDir, 'musica.wav');
  await sharp({ create: { width: 500, height: 700, channels: 4, background: '#1a7f37' } }).png().toFile(p1); await sharp({ create: { width: 500, height: 700, channels: 4, background: '#b42318' } }).png().toFile(p2);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', wav]);
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1360, height: 900 } }); const errors = [];
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/api/auth/me')) errors.push(r.status() + ' ' + r.url()); }); page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => process.env.SHOTS_DIR && page.screenshot({ path: path.join(process.env.SHOTS_DIR, `${n}.png`) });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.fill('#l-email', 'm@test.cl'); await page.fill('#l-pass', 'clavesegura123'); await page.click('#l-go'); await page.waitForSelector('text=Hola');
    // fotos
    await page.click('a[href="#/library"]'); await page.waitForSelector('#up-file'); await page.selectOption('#up-kind', 'product'); await page.setInputFiles('#up-file', [p1, p2]); await page.click('#up-go'); await page.waitForSelector('text=b.png');
    // música: sin licencia se rechaza, con licencia se guarda
    await page.click('a[href="#/music"]'); await page.waitForSelector('#au-file'); await page.setInputFiles('#au-file', wav); await page.click('#au-go'); await page.waitForSelector('text=Confirme que tiene licencia');
    await page.check('#au-lic'); await page.fill('#au-note', 'pista de prueba'); await page.click('#au-go'); await page.waitForSelector('text=Licencia comercial confirmada');
    // voz: sin Piper hay guía clara y el botón está desactivado
    await page.click('a[href="#/voice"]'); await page.waitForSelector('text=Piper no está configurado'); assert.ok(await page.isDisabled('#voice-go'));
    // Reel
    await page.click('a[href="#/reels"]'); await page.waitForSelector('#v-add');
    for (let i = 0; i < 2; i++) { await page.click('#v-add'); await page.click('.picker img >> nth=' + i); await page.waitForSelector(`.v-caption >> nth=${i}`); }
    await page.fill('.v-caption >> nth=0', 'Tóner compatible'); await page.fill('.v-secs >> nth=0', '2'); await page.fill('.v-secs >> nth=1', '2');
    await page.selectOption('#v-music', { index: 1 }); await page.check('#v-wa'); await shot('09-reels-armado');
    await page.click('#v-prev'); await page.waitForSelector('#v-player', { timeout: 90000 });
    await page.waitForFunction(() => { const v = document.querySelector('#v-player'); return v && v.readyState >= 1 && v.duration > 3; }, null, { timeout: 20000 });
    assert.ok(await page.isDisabled('#v-approve'), 'la vista previa no se aprueba');
    await page.click('#v-final'); await page.waitForFunction(() => document.querySelector('#v-approve') && !document.querySelector('#v-approve').disabled, null, { timeout: 120000 });
    await shot('10-reel-final'); await page.click('#v-approve'); await page.waitForSelector('text=Video aprobado');
    await page.click('a[href="#/home"]'); await page.waitForSelector('text=Videos creados'); await shot('11-inicio-videos');
    // marketing → guion → Reel
    await page.click('a[href="#/marketing"]'); await page.waitForSelector('#mk-go'); await page.selectOption('#mk-kind', 'reel_script'); await page.fill('#mk-notes', 'Tóner compatible'); await page.click('#mk-go');
    await page.waitForSelector('#mk-to-reel'); await shot('12-marketing'); await page.click('#mk-to-reel');
    await page.waitForSelector('text=Cargué el guion'); assert.equal(await page.inputValue('.v-caption >> nth=0'), 'Tóner compatible');
    await page.click('a[href="#/google"]'); await page.waitForSelector('text=hasta 30 caracteres');
    assert.deepEqual(errors.filter((e) => !/^400 .*\/api\/assets$/.test(e)), [], 'sin errores (salvo el rechazo esperado del audio sin licencia)');
    assert.equal(errors.filter((e) => /^400 .*\/api\/assets$/.test(e)).length, 1, 'exactamente un rechazo por falta de licencia');
  } finally { await browser.close(); server.close(); fake.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
