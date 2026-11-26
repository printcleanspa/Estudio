'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { createApp } = require('../server/app');

let server, base, cookie = '', stub, stubHits = [], dataDir;

async function api(method, url, body, { raw = false } = {}) {
  const headers = { cookie };
  let payload = body;
  if (body && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + url, { method, headers, body: payload });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  if (raw) return r;
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const png = (w, h, color) => sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();
function upload(buf, fields) {
  const f = new FormData(); f.append('file', new Blob([buf], { type: 'image/png' }), 'x.png');
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return api('POST', '/api/assets', f);
}

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-test-'));
  // Servidores FALSOS de Ollama y Stable Diffusion (SOLO pruebas): replican la forma de sus APIs para verificar nuestras peticiones.
  stub = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8'); let body = {}; try { body = JSON.parse(raw); } catch { /* sin cuerpo */ }
    stubHits.push({ url: req.url, body });
    const img = (await png(1024, 1024, '#3366cc')).toString('base64');
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'llama-test:latest', size: 1 }, { name: 'x/flux-test', size: 2 }] }));
    if (req.url === '/api/chat') {
      if (body.model === 'no-existe') { res.statusCode = 404; return res.end(JSON.stringify({ error: 'model "no-existe" not found, try pulling it first' })); }
      return res.end(JSON.stringify({ message: { content: JSON.stringify({ opciones: [
        { titular: 'Tóner para su impresora', apoyo: 'Consulte disponibilidad' },
        { titular: 'Oferta $9.990 hoy', apoyo: 'Solo esta semana' },            // cifra inventada → debe descartarse
        { titular: 'Suministros para su oficina', apoyo: 'Atención a empresas' }] }) } }));
    }
    if (req.url === '/api/generate') { // NDJSON: progreso + última línea con la imagen
      return res.end(JSON.stringify({ model: body.model, response: '', done: false }) + '\n' + JSON.stringify({ model: body.model, response: '', done: true, image: img }) + '\n');
    }
    if (req.url === '/sdapi/v1/sd-models') return res.end(JSON.stringify([{ title: 'm1' }]));
    if (req.url === '/sdapi/v1/txt2img' || req.url === '/sdapi/v1/img2img') return res.end(JSON.stringify({ images: [img] }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => stub.listen(0, r));
  const u = `http://127.0.0.1:${stub.address().port}`;
  const env = { OLLAMA_HOST: u, SD_WEBUI_URL: u, SD_WEBUI_MAX_SIDE: '512' };
  const app = createApp({ dataDir, env });
  server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); stub.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('rutas protegidas exigen sesión', async () => {
  assert.equal((await api('GET', '/api/brands')).status, 401);
  assert.equal((await api('GET', '/files/1', null)).status, 401);
});

test('registro del primer usuario, cierre del registro y login', async () => {
  assert.equal((await api('GET', '/api/auth/status')).data.hasUsers, false);
  assert.equal((await api('POST', '/api/auth/register', { email: 'a@b.cl', password: 'corta' })).status, 400);
  const r = await api('POST', '/api/auth/register', { email: 'Admin@Test.cl', name: 'Michael', password: 'clavesegura123' });
  assert.equal(r.status, 200);
  assert.equal((await api('GET', '/api/auth/me')).data.role, 'admin');
  assert.equal((await api('POST', '/api/auth/register', { email: 'x@y.cl', password: 'clavesegura123' })).status, 403);
  await api('POST', '/api/auth/logout');
  cookie = '';
  assert.equal((await api('POST', '/api/auth/login', { email: 'admin@test.cl', password: 'mala' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'admin@test.cl', password: 'clavesegura123' })).status, 200);
});

let brand, productId, logoBytes;
test('marca inicial Print Clean SPA y edición de marca', async () => {
  const list = (await api('GET', '/api/brands')).data;
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Print Clean SPA');
  assert.deepEqual(list[0].colors, []); // no se inventan colores
  brand = list[0];
  const u = await api('PUT', `/api/brands/${brand.id}`, { colors: [{ name: 'Azul', hex: '#0044aa' }, { name: 'mal', hex: 'rojo' }], business: { telefono: '123' }, style: 'Limpio' });
  assert.equal(u.status, 200); assert.equal(u.data.colors.length, 1); assert.equal(u.data.business.telefono, '123');
});

test('logo oficial se guarda sin modificarse (sha256 idéntico) y queda como logo vigente', async () => {
  logoBytes = await png(300, 120, '#ff0000');
  const r = await upload(logoBytes, { kind: 'logo', brand_id: brand.id, name: 'Logo oficial' });
  assert.equal(r.status, 200); assert.equal(r.data.official, true);
  const stored = fs.readFileSync(path.join(dataDir, 'uploads', fs.readdirSync(path.join(dataDir, 'uploads')).find((f) => f.startsWith('') && !f.includes('thumb') && fs.readFileSync(path.join(dataDir, 'uploads', f)).equals(logoBytes))));
  assert.ok(stored.equals(logoBytes));
  const b = (await api('GET', `/api/brands/${brand.id}`)).data;
  assert.equal(b.logo_asset_id, r.data.id);
  // descarga devuelve los mismos bytes
  const dl = Buffer.from(await (await api('GET', `/files/${r.data.id}`, null, { raw: true })).arrayBuffer());
  assert.equal(crypto.createHash('sha256').update(dl).digest('hex'), crypto.createHash('sha256').update(logoBytes).digest('hex'));
  // eliminar logo oficial exige confirmación
  assert.equal((await api('DELETE', `/api/assets/${r.data.id}`)).status, 409);
});

test('rechaza archivos que no son imagen', async () => {
  const f = new FormData(); f.append('file', new Blob(['hola'], { type: 'text/plain' }), 'a.txt'); f.append('kind', 'photo');
  assert.equal((await api('POST', '/api/assets', f)).status, 400);
});

test('subida de producto y composición local conserva el producto y entrega el tamaño exacto', async () => {
  const prod = await upload(await png(600, 800, '#00aa00'), { kind: 'product', brand_id: brand.id, name: 'Tóner' });
  productId = prod.data.id;
  const g = await api('POST', '/api/images/generate', { brand_id: brand.id, provider: 'local-compose', source_asset_id: productId, format: 'ig-4x5', bg_type: 'gradient', bg_colors: ['#ffffff', '#cfe3ff'], headline: 'Oferta de la semana', subline: 'Consulte por mayor', use_logo: true });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.width, 1080); assert.equal(g.data.height, 1350);
  assert.equal(g.data.status, 'pending'); assert.equal(g.data.parent_id, productId);
  assert.equal(g.data.meta.productModified, false);
  // el original sigue intacto y el centro de la imagen conserva el verde del producto
  const out = await sharp(Buffer.from(await (await api('GET', `/files/${g.data.id}`, null, { raw: true })).arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(1350 / 2) * 1080 + 540) * out.info.channels;
  assert.deepEqual([...out.data.slice(i, i + 3)], [0, 170, 0]);
});

test('aprobación de imagen generada y validaciones', async () => {
  const gen = (await api('GET', '/api/assets?kind=generated')).data[0];
  assert.equal((await api('PATCH', `/api/assets/${gen.id}`, { status: 'approved' })).data.status, 'approved');
  assert.equal((await api('PATCH', `/api/assets/${productId}`, { status: 'approved' })).status, 400);
  assert.equal((await api('POST', '/api/images/generate', { provider: 'local-compose', format: 'nope', source_asset_id: productId })).status, 400);
  assert.equal((await api('POST', '/api/images/generate', { provider: 'local-compose', format: 'ig-1x1' })).status, 400);
});

test('Ollama: asistente de textos (visión incluida), descarta cifras inventadas y errores claros', async () => {
  stubHits.length = 0;
  const r = await api('POST', '/api/ai/suggest-copy', { brand_id: brand.id, model: 'llama-test:latest', notes: 'Tóner para impresoras láser', source_asset_id: productId, use_image: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.options.length, 2); assert.equal(r.data.discarded, 1);
  assert.ok(r.data.options.every((o) => !/\d/.test(o.titular + o.apoyo)));
  assert.equal(r.data.used_image, true);
  const chat = stubHits.find((h) => h.url === '/api/chat').body;
  assert.equal(chat.stream, false); assert.equal(chat.model, 'llama-test:latest');
  assert.equal(chat.messages[1].images.length, 1);        // la foto viajó en base64 (visión)
  assert.match(chat.messages[0].content, /NO inventes precios/);
  assert.ok(chat.format && chat.format.type === 'object'); // salida estructurada
  assert.equal((await api('POST', '/api/ai/suggest-copy', { notes: 'x' })).status, 400);                       // sin modelo
  const nf = await api('POST', '/api/ai/suggest-copy', { model: 'no-existe', notes: 'x' });
  assert.equal(nf.status, 400); assert.match(nf.data.error, /not found/);
});

test('Ollama y Stable Diffusion generan imagen local, gratis, al tamaño exacto y quedan pendientes de aprobación', async () => {
  stubHits.length = 0;
  const o = await api('POST', '/api/images/generate', { brand_id: brand.id, provider: 'ollama-image', model: 'x/flux-test', prompt: 'Una oficina limpia', format: 'ig-story' });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  assert.equal(o.data.width, 1080); assert.equal(o.data.height, 1920); assert.equal(o.data.status, 'pending'); assert.equal(o.data.meta.experimental, true);
  const gen = stubHits.find((h) => h.url === '/api/generate').body;
  assert.equal(gen.model, 'x/flux-test'); assert.equal(gen.stream, false); assert.equal(gen.width % 8, 0);
  const t = await api('POST', '/api/images/generate', { brand_id: brand.id, provider: 'sd-webui', prompt: 'escritorio', negative: 'borroso', format: 'ig-1x1' });
  assert.equal(t.status, 200); assert.equal(t.data.width, 1080);
  const sd = stubHits.find((h) => h.url === '/sdapi/v1/txt2img').body;
  assert.equal(sd.width, 512); assert.equal(sd.negative_prompt, 'borroso');   // límite SD_WEBUI_MAX_SIDE respetado
  const e = await api('POST', '/api/images/generate', { brand_id: brand.id, provider: 'sd-webui', mode: 'edit', source_asset_id: productId, prompt: 'fondo claro', format: 'ig-4x5' });
  assert.equal(e.status, 200); assert.ok(stubHits.some((h) => h.url === '/sdapi/v1/img2img' && h.body.init_images.length === 1));
  assert.match(e.data.meta.productModified, /posible/);
  assert.equal((await api('POST', '/api/images/generate', { provider: 'ollama-image', prompt: 'x', format: 'ig-1x1' })).status, 400); // sin modelo
  assert.equal((await api('POST', '/api/images/generate', { provider: 'openai-images', prompt: 'x', format: 'ig-1x1' })).status, 400);  // OpenAI ya no existe
  const usage = (await api('GET', '/api/usage')).data;
  assert.ok(usage.find((u) => u.connector === 'sd-webui').ops >= 2);
});

test('conectores: todos gratuitos y con estado real (conectado / no disponible)', async () => {
  const c = (await api('GET', '/api/connectors')).data;
  assert.ok(c.active.every((x) => x.paid === false));
  assert.ok(!c.active.some((x) => /openai/i.test(x.id)));
  const o = c.active.find((x) => x.id === 'ollama');
  assert.equal(o.configured, true); assert.deepEqual(o.models.map((m) => m.name), ['llama-test:latest', 'x/flux-test']);
  assert.equal(c.active.find((x) => x.id === 'sd-webui').configured, true);
  assert.ok(c.planned.length > 0 && c.planned.every((p) => p.phase >= 2));
});

let design;
test('diseños: crear, guardar versiones, aprobar, exportar solo si está aprobado', async () => {
  const c = await api('POST', '/api/designs', { name: 'Promo', format: 'ig-1x1', brand_id: brand.id });
  assert.equal(c.status, 200); design = c.data; assert.equal(design.width, 1080);
  const dataUrl = 'data:image/png;base64,' + (await png(1080, 1080, '#ffffff')).toString('base64');
  // no aprobado → bloqueado
  assert.equal((await api('POST', `/api/designs/${design.id}/export`, { format: 'png', version: 1, dataUrl })).status, 403);
  const s = await api('PUT', `/api/designs/${design.id}`, { json: { version: '5.3.0', objects: [{ type: 'rect' }] }, preview: dataUrl });
  assert.equal(s.data.version, 2); assert.ok(s.data.preview_url);
  assert.equal((await api('GET', `/api/designs/${design.id}/versions`)).data.length, 1);
  await api('PATCH', `/api/designs/${design.id}/status`, { status: 'approved' });
  // versión desactualizada → conflicto
  assert.equal((await api('POST', `/api/designs/${design.id}/export`, { format: 'png', version: 1, dataUrl })).status, 409);
  // medidas incorrectas
  const bad = 'data:image/png;base64,' + (await png(100, 100, '#fff')).toString('base64');
  assert.equal((await api('POST', `/api/designs/${design.id}/export`, { format: 'png', version: 2, dataUrl: bad })).status, 400);
  for (const [fmt, sig] of [['png', '89504e47'], ['jpg', 'ffd8ff'], ['pdf', '25504446']]) {
    const e = await api('POST', `/api/designs/${design.id}/export`, { format: fmt, version: 2, dataUrl });
    assert.equal(e.status, 200, JSON.stringify(e.data));
    const bytes = Buffer.from(await (await api('GET', `/api/assets/${e.data.id}/download`, null, { raw: true })).arrayBuffer());
    assert.equal(bytes.subarray(0, sig.length / 2).toString('hex'), sig, `firma de archivo ${fmt}`);
  }
  // editar tras aprobar revierte la aprobación
  const s2 = await api('PUT', `/api/designs/${design.id}`, { json: { version: '5.3.0', objects: [] } });
  assert.equal(s2.data.status, 'draft'); assert.equal(s2.data.version, 3);
  // restaurar versión
  const rs = await api('POST', `/api/designs/${design.id}/restore/2`);
  assert.equal(rs.data.json.objects.length, 1);
});

test('plantillas y duplicados', async () => {
  const t = await api('POST', `/api/designs/${design.id}/template`, { name: 'Plantilla promo' });
  assert.equal(t.data.is_template, true);
  assert.equal((await api('GET', '/api/designs?template=1')).data.length, 1);
  const copy = await api('POST', '/api/designs', { name: 'Desde plantilla', from_design_id: t.data.id, brand_id: brand.id });
  assert.equal(copy.data.width, 1080); assert.equal(copy.data.is_template, false);
});

test('panel de inicio, usuarios y respaldo', async () => {
  const d = (await api('GET', '/api/dashboard')).data;
  assert.ok(d.counts.designs >= 2); assert.ok(d.counts.images >= 3); assert.equal(d.counts.exports, 3);
  assert.ok(d.connectors_active.length >= 2);
  const u = await api('POST', '/api/users', { email: 'otro@test.cl', password: 'otraclave1234', name: 'Otro' });
  assert.equal(u.status, 200);
  assert.equal((await api('POST', '/api/users', { email: 'otro@test.cl', password: 'otraclave1234' })).status, 409);
  const b = await api('POST', '/api/backup');
  assert.equal(b.status, 200); assert.ok(fs.existsSync(path.join(dataDir, 'backups', b.data.file)));
});

test('sin Ollama ni Stable Diffusion: la plataforma sigue funcionando y los errores son claros', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-noai-'));
  const app2 = http.createServer(createApp({ dataDir: dir, env: { OLLAMA_HOST: '127.0.0.1:1' } })); await new Promise((r) => app2.listen(0, r));
  const b2 = `http://127.0.0.1:${app2.address().port}`; let ck = '';
  const call = async (m, u, body) => { const r = await fetch(b2 + u, { method: m, headers: { cookie: ck, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return { status: r.status, data: await r.json() }; };
  await call('POST', '/api/auth/register', { email: 'a@b.cl', password: 'clavesegura123' });
  const c = (await call('GET', '/api/connectors')).data.active;
  assert.equal(c.find((x) => x.id === 'local-compose').configured, true);
  const o = c.find((x) => x.id === 'ollama'); assert.equal(o.configured, false); assert.match(o.note, /No se pudo conectar con Ollama/);
  assert.equal(c.find((x) => x.id === 'sd-webui').configured, false);
  const r = await call('POST', '/api/ai/suggest-copy', { model: 'x', notes: 'y' });
  assert.equal(r.status, 503); assert.match(r.data.error, /Ollama/);
  assert.equal((await call('GET', '/api/dashboard')).status, 200);
  app2.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('comprobador npm run check:ollama: éxito con Ollama simulado y guía de instalación si no está', async () => {
  const { execFile } = require('node:child_process');
  const run = (envv) => new Promise((resolve) => execFile(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'scripts', 'check-ollama.js')], { env: { PATH: process.env.PATH, ...envv }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr })));
  const u = `http://127.0.0.1:${stub.address().port}`;
  const ok = await run({ OLLAMA_HOST: u, OLLAMA_TEXT_MODEL: 'llama-test:latest' });
  assert.equal(ok.code, 0, ok.out); assert.match(ok.out, /Ollama responde/); assert.match(ok.out, /Respondió en/); assert.match(ok.out, /Todo listo/);
  const noModel = await run({ OLLAMA_HOST: u, OLLAMA_TEXT_MODEL: 'otro-modelo' });
  assert.equal(noModel.code, 1); assert.match(noModel.out, /ollama pull otro-modelo/);
  const down = await run({ OLLAMA_HOST: '127.0.0.1:1' });
  assert.equal(down.code, 1); assert.match(down.out, /install\.ps1/); assert.match(down.out, /install\.sh/);
});

test('el estado de Ollama expone el modelo por defecto configurado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-def-'));
  const u = `http://127.0.0.1:${stub.address().port}`;
  const s3 = http.createServer(createApp({ dataDir: dir, env: { OLLAMA_HOST: u, OLLAMA_TEXT_MODEL: 'llama-test:latest' } })); await new Promise((r) => s3.listen(0, r));
  const h3 = `http://127.0.0.1:${s3.address().port}`; let ck = '';
  const call = async (m, p, b) => { const r = await fetch(h3 + p, { method: m, headers: { cookie: ck, 'content-type': 'application/json' }, body: b && JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return r.json(); };
  await call('POST', '/api/auth/register', { email: 'a@b.cl', password: 'clavesegura123' });
  const o = (await call('GET', '/api/connectors')).active.find((x) => x.id === 'ollama');
  assert.equal(o.defaults.text, 'llama-test:latest');
  s3.close(); fs.rmSync(dir, { recursive: true, force: true });
});
