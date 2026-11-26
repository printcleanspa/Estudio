'use strict';
/* Video, audio, voz y marketing. FFmpeg es REAL; Ollama y Piper son simulados (no hay modelos ni voces en el entorno de pruebas). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const { createApp } = require('../server/app');

let hasFfmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }

let server, base, cookie = '', stub, dir, lastChat, brandId, imgIds = [];
async function api(method, url, body, raw = false, headers = {}) {
  const h = { cookie, ...headers }; let payload = body;
  if (body && !(body instanceof FormData)) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + url, { method, headers: h, body: payload });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  if (raw) return r;
  const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const png = (c) => sharp({ create: { width: 600, height: 800, channels: 4, background: c } }).png().toBuffer();
const form = (buf, name, type, fields) => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); for (const [k, v] of Object.entries(fields)) f.append(k, String(v)); return f; };
async function waitJob(id, ms = 90000) { const t0 = Date.now(); for (;;) { const r = await api('GET', `/api/videos/jobs/${id}`); if (r.data.status !== 'running') return r.data; if (Date.now() - t0 > ms) throw new Error('timeout del trabajo'); await new Promise((x) => setTimeout(x, 300)); } }
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-media-'));
  // Piper simulado: lee el texto por stdin y genera 2 s de tono con ffmpeg en --output_file
  const fake = path.join(dir, 'piper-falso.sh');
  fs.writeFileSync(fake, '#!/bin/sh\ncat >/dev/null\nffmpeg -y -loglevel error -f lavfi -i sine=frequency=300:duration=2 "$4"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'voz.onnx'), 'x');
  // Ollama simulado, sensible al esquema pedido
  stub = http.createServer(async (req, res) => {
    const c = []; for await (const x of req) c.push(x); let body = {}; try { body = JSON.parse(Buffer.concat(c).toString()); } catch { /* */ }
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'llama-test:latest', size: 1 }] }));
    if (req.url === '/api/chat') {
      lastChat = body; const key = Object.keys(body.format?.properties || {})[0]; let out = {};
      if (key === 'opciones') out = { opciones: [
        { texto: 'Papel para su oficina', hashtags: ['oficina', '#papel', 'despacho a empresas'], llamado_a_la_accion: 'Escríbanos por WhatsApp' },
        { texto: 'Tóner original al mejor precio', hashtags: ['#toner'], llamado_a_la_accion: 'Cotice' },        // «original» → descartar
        { texto: 'Oferta: 30% de descuento', hashtags: ['#oferta'], llamado_a_la_accion: 'Compre' }] };         // cifra inventada → descartar
      if (key === 'variantes') out = { variantes: [
        { titulo: 'Tóner compatible', descripcion: 'Cotice su tóner compatible hoy', cta: 'Cotizar' },
        { titulo: 'Este título es demasiado largo para Google Ads', descripcion: 'x', cta: 'Ver' },              // >30 → descartar
        { titulo: 'Papel para oficina', descripcion: 'd'.repeat(120), cta: 'Ver' }] };                           // descripción >90 → descartar
      if (key === 'titulo') out = { titulo: 'Tóner compatible', escenas: [{ texto_en_pantalla: 'Tóner compatible', locucion: 'Tenemos tóner compatible.', segundos: 99 }, { texto_en_pantalla: 'Pida por WhatsApp', locucion: 'Escríbanos.', segundos: 1 }] };
      if (key === 'dias') out = { dias: [{ dia: 'Lunes', formato: 'reel', idea: 'Producto destacado', texto: 'Conozca nuestro tóner compatible.' }, { dia: 'Martes', formato: 'Podcast', idea: 'Consejo', texto: 'Cuide su impresora.' }] };
      if (key === 'ideas') out = { ideas: [{ nombre: 'Semana de la oficina', objetivo: 'Generar consultas', publico: 'Empresas', mensaje: 'Suministros para su oficina' }] };
      return res.end(JSON.stringify({ message: { content: JSON.stringify(out) } }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => stub.listen(0, r));
  const env = { OLLAMA_HOST: `http://127.0.0.1:${stub.address().port}`, PIPER_PATH: fake, PIPER_MODEL: path.join(dir, 'voz.onnx') };
  server = http.createServer(createApp({ dataDir: path.join(dir, 'data'), env })); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  await api('POST', '/api/auth/register', { email: 'a@b.cl', password: 'clavesegura123' });
  brandId = (await api('GET', '/api/brands')).data[0].id;
  for (const c of ['#00aa00', '#aa0000', '#0000aa']) imgIds.push((await api('POST', '/api/assets', form(await png(c), 'p.png', 'image/png', { kind: 'product', brand_id: brandId }))).data.id);
});
test.after(() => { server.close(); stub.close(); fs.rmSync(dir, { recursive: true, force: true }); });

let musicId;
test('audio: exige licencia comercial, valida que sea audio real y guarda duración', { skip: !hasFfmpeg && 'sin ffmpeg' }, async () => {
  const wav = path.join(dir, 'm.wav'); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', wav]);
  const buf = fs.readFileSync(wav);
  assert.equal((await api('POST', '/api/assets', form(buf, 'm.wav', 'audio/wav', { kind: 'audio' }))).status, 400);                 // sin licencia
  const bad = await api('POST', '/api/assets', form(await png('#fff'), 'x.mp3', 'audio/mpeg', { kind: 'audio', license_confirmed: 1 }));
  assert.equal(bad.status, 400); assert.match(bad.data.error, /audio|válido/i);                                                      // una imagen no es audio
  const ok = await api('POST', '/api/assets', form(buf, 'm.wav', 'audio/wav', { kind: 'audio', license_confirmed: 1, license_note: 'pista propia', brand_id: brandId }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.kind, 'audio'); assert.equal(ok.data.mime, 'audio/wav');
  assert.ok(Math.abs(ok.data.meta.duration - 3) < 0.3); assert.equal(ok.data.meta.license_confirmed, true);
  musicId = ok.data.id;
});

let previewId, finalId;
test('video: vista previa y versión final con transición, movimiento y música (FFmpeg real)', { skip: !hasFfmpeg && 'sin ffmpeg', timeout: 120000 }, async () => {
  const scenes = [{ asset_id: imgIds[0], seconds: 2, caption: 'Tóner compatible' }, { asset_id: imgIds[1], seconds: 2, caption: '' }, { asset_id: imgIds[2], seconds: 2, caption: 'Pida por WhatsApp' }];
  const start = await api('POST', '/api/videos', { brand_id: brandId, format: 'reel', scenes, transition: 'fade', transition_seconds: 0.5, motion: true, music_asset_id: musicId, use_whatsapp: true, draft: true });
  assert.equal(start.status, 202, JSON.stringify(start.data));
  const job = await waitJob(start.data.job_id); assert.equal(job.status, 'done', job.error);
  const a = job.asset; previewId = a.id;
  assert.equal(a.kind, 'video'); assert.equal(a.mime, 'video/mp4'); assert.equal(a.status, 'pending'); assert.equal(a.meta.draft, true); assert.equal(a.meta.whatsapp, true);
  assert.ok(a.thumb_url, 'tiene miniatura');
  const f = path.join(dir, 'prev.mp4'); fs.writeFileSync(f, Buffer.from(await (await api('GET', `/files/${a.id}`, null, true)).arrayBuffer()));
  const pr = probe(f); const v = pr.streams.find((s) => s.codec_type === 'video'), au = pr.streams.find((s) => s.codec_type === 'audio');
  assert.equal(v.codec_name, 'h264'); assert.equal(v.width, 540); assert.equal(v.height, 960); assert.ok(au, 'tiene audio (música)');
  assert.ok(Math.abs(Number(pr.format.duration) - 5) < 0.15, `duración ${pr.format.duration} (6 s − 2 transiciones de 0,5 s = 5 s)`);
  assert.equal((await api('PATCH', `/api/assets/${a.id}`, { status: 'approved' })).status, 400);       // una vista previa no se aprueba
  // final cuadrado, sin transición ni movimiento, silencioso
  const s2 = await api('POST', '/api/videos', { brand_id: brandId, format: 'square', scenes: scenes.slice(0, 2), transition: 'none', motion: false });
  const j2 = await waitJob(s2.data.job_id); assert.equal(j2.status, 'done', j2.error); finalId = j2.asset.id;
  const f2 = path.join(dir, 'fin.mp4'); fs.writeFileSync(f2, Buffer.from(await (await api('GET', `/files/${finalId}`, null, true)).arrayBuffer()));
  const p2 = probe(f2); assert.equal(p2.streams.find((s) => s.codec_type === 'video').width, 1080); assert.ok(Math.abs(Number(p2.format.duration) - 4) < 0.15);
  assert.ok(p2.streams.some((s) => s.codec_type === 'audio'), 'pista de audio silenciosa por compatibilidad');
  assert.equal((await api('PATCH', `/api/assets/${finalId}`, { status: 'approved' })).data.status, 'approved');
});

test('video: se puede reproducir por partes (Range) y se descarga como MP4', { skip: !hasFfmpeg && 'sin ffmpeg' }, async () => {
  const r = await api('GET', `/files/${finalId}`, null, true, { range: 'bytes=0-99' });
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-type'), 'video/mp4');
  const d = await api('GET', `/api/assets/${finalId}/download`, null, true);
  assert.match(d.headers.get('content-disposition'), /\.mp4/);
});

test('video: validaciones claras (escenas, duración, imagen inválida, audio inválido)', { skip: !hasFfmpeg && 'sin ffmpeg' }, async () => {
  assert.equal((await api('POST', '/api/videos', { format: 'nada', scenes: [{ asset_id: imgIds[0], seconds: 2 }] })).status, 400);
  assert.equal((await api('POST', '/api/videos', { format: 'reel', scenes: [] })).status, 400);
  assert.equal((await api('POST', '/api/videos', { format: 'reel', scenes: [{ asset_id: musicId, seconds: 2 }] })).status, 400);       // un audio no es imagen
  assert.equal((await api('POST', '/api/videos', { format: 'reel', scenes: [{ asset_id: imgIds[0], seconds: 2 }], music_asset_id: imgIds[0] })).status, 400);
  const long = await api('POST', '/api/videos', { format: 'reel', scenes: [{ asset_id: imgIds[0], seconds: 99 }] });
  const jb = await waitJob(long.data.job_id); assert.equal(jb.status, 'error'); assert.match(jb.error, /entre 1 y 15/);
  assert.equal((await api('GET', '/api/videos/jobs/inexistente')).status, 404);
});

test('voz: sin configuración da guía; con Piper (simulado) crea un audio; respeta palabras prohibidas', { skip: !hasFfmpeg && 'sin ffmpeg' }, async () => {
  const bad = await api('POST', '/api/voice', { text: 'Tóner original', brand_id: brandId });
  assert.equal(bad.status, 400); assert.match(bad.data.error, /prohibida/);
  assert.equal((await api('POST', '/api/voice', { text: '' })).status, 400);
  const ok = await api('POST', '/api/voice', { text: 'Tóner compatible para su oficina.', brand_id: brandId });
  assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.kind, 'audio'); assert.equal(ok.data.meta.voice, true); assert.ok(ok.data.meta.duration > 1.5);
  assert.equal(ok.data.meta.license_confirmed, false);
  const c = await api('POST', `/api/assets/${ok.data.id}/confirm-license`, { license_note: 'voz verificada' });
  assert.equal(c.data.meta.license_confirmed, true);
  // video con locución + música
  const s = await api('POST', '/api/videos', { format: 'square', draft: true, scenes: [{ asset_id: imgIds[0], seconds: 3 }], voice_asset_id: ok.data.id, music_asset_id: musicId });
  const j = await waitJob(s.data.job_id); assert.equal(j.status, 'done', j.error);
});

test('marketing: cada tipo respeta reglas y límites; descarta lo que no cumple', async () => {
  const m = (extra) => api('POST', '/api/ai/marketing', { brand_id: brandId, model: 'llama-test:latest', notes: 'Resmas de papel y tóner compatible', ...extra });
  const cap = await m({ kind: 'captions', line: 'suministros', audience: 'oficinas' });
  assert.equal(cap.status, 200, JSON.stringify(cap.data)); assert.equal(cap.data.items.length, 1); assert.equal(cap.data.discarded, 2);
  assert.deepEqual(cap.data.items[0].hashtags, ['#oficina', '#papel', '#despachoaempresas']);
  assert.match(lastChat.messages[1].content, /NO menciones artículos de aseo/); assert.match(lastChat.messages[1].content, /@printcleansuministros/);
  assert.match(lastChat.messages[1].content, /nunca «original»/);
  const aseo = await m({ kind: 'captions', line: 'aseo' }); assert.match(lastChat.messages[1].content, /NO menciones tóner ni tintas/); assert.equal(aseo.status, 200);
  const ad = await m({ kind: 'ad_variants' });
  assert.equal(ad.data.items.length, 1); assert.equal(ad.data.discarded, 2); assert.ok(ad.data.items[0].titulo.length <= 30);
  const rs = await m({ kind: 'reel_script' });
  assert.equal(rs.data.items[0].escenas.length, 2); assert.equal(rs.data.items[0].escenas[0].segundos, 6); assert.equal(rs.data.items[0].escenas[1].segundos, 2);   // segundos acotados a 2–6
  const cal = await m({ kind: 'calendar' });
  assert.equal(cal.data.items[0].dias[0].formato, 'Reel'); assert.equal(cal.data.items[0].dias[1].formato, 'Post');
  const ide = await m({ kind: 'campaign_ideas' }); assert.equal(ide.data.items.length, 1);
  assert.equal((await m({ kind: 'nada' })).status, 400);
  assert.equal((await api('POST', '/api/ai/marketing', { kind: 'captions' })).status, 400);        // sin modelo
  assert.ok(Object.keys((await api('GET', '/api/ai/marketing-kinds')).data).length === 5);
});

test('panel y conectores reflejan video, FFmpeg y Piper', { skip: !hasFfmpeg && 'sin ffmpeg' }, async () => {
  const d = (await api('GET', '/api/dashboard')).data; assert.ok(d.counts.videos >= 2); assert.ok(d.recent_videos.length >= 1);
  const c = (await api('GET', '/api/connectors')).data.active;
  assert.equal(c.find((x) => x.id === 'ffmpeg').configured, true); assert.equal(c.find((x) => x.id === 'piper').configured, true);
  assert.ok(c.every((x) => x.paid === false));
});
