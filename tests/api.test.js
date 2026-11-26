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
  // Servidor falso de OpenAI (SOLO pruebas): comprueba que el conector arma bien las peticiones.
  stub = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    stubHits.push({ url: req.url, auth: req.headers.authorization, ct: req.headers['content-type'], body: Buffer.concat(chunks).toString('latin1').slice(0, 2000) });
    const img = await png(1024, 1024, '#3366cc');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ b64_json: img.toString('base64') }] }));
  });
  await new Promise((r) => stub.listen(0, r));
  const env = { OPENAI_API_KEY: 'sk-test-fake', OPENAI_BASE_URL: `http://127.0.0.1:${stub.address().port}/v1`, OPENAI_IMAGE_COST_USD: '0.04' };
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

test('OpenAI: exige confirmación de costo y luego llama a la API con la clave del servidor', async () => {
  const body = { brand_id: brand.id, provider: 'openai-images', mode: 'text2img', prompt: 'Una oficina limpia', format: 'ig-story' };
  const need = await api('POST', '/api/images/generate', body);
  assert.equal(need.status, 409); assert.equal(need.data.needs_confirmation, true); assert.equal(need.data.estimated_cost_usd, 0.04);
  assert.equal(stubHits.length, 0); // no se llamó a la API sin confirmación
  const ok = await api('POST', '/api/images/generate', { ...body, confirm_cost: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.width, 1080); assert.equal(ok.data.height, 1920);
  assert.equal(stubHits[0].url, '/v1/images/generations'); assert.equal(stubHits[0].auth, 'Bearer sk-test-fake');
  // modo edición: multipart con la imagen
  const ed = await api('POST', '/api/images/generate', { ...body, mode: 'edit', source_asset_id: productId, confirm_cost: true, format: 'ig-1x1' });
  assert.equal(ed.status, 200); assert.equal(stubHits[1].url, '/v1/images/edits'); assert.match(stubHits[1].ct, /multipart\/form-data/);
  assert.match(ed.data.meta.productModified, /posible/);
  const usage = (await api('GET', '/api/usage')).data.find((u) => u.connector === 'openai-images');
  assert.equal(usage.ops, 2); assert.ok(Math.abs(usage.known_cost_usd - 0.08) < 1e-9);
});

test('conectores: estado real según variables de entorno', async () => {
  const c = (await api('GET', '/api/connectors')).data;
  assert.equal(c.active.find((x) => x.id === 'openai-images').configured, true);
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
