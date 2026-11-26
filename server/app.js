'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const { openDb, j } = require('./db');
const { hashPassword, verifyPassword, makeAuth } = require('./auth');
const { FORMATS } = require('./formats');
const connectors = require('./connectors');
const { suggestCopy } = require('./ai');
const { notify } = require('./notify');
const { renderVideo, VIDEO_FORMATS } = require('./video');
const marketing = require('./marketing');

const httpErr = (status, msg) => Object.assign(new Error(msg), { status });
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const MAX_UPLOAD = 25 * 1024 * 1024;

function createApp({ dataDir = path.join(process.cwd(), 'data'), env = process.env } = {}) {
  const db = openDb(dataDir);
  const uploads = path.join(dataDir, 'uploads');
  const auth = makeAuth(db, { secureCookie: env.COOKIE_SECURE === '1' });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1 } });
  const audit = (userId, action, detail = '') => db.prepare('INSERT INTO audit_log(user_id,action,detail) VALUES(?,?,?)').run(userId ?? null, action, String(detail).slice(0, 500));
  const emit = (event, data) => { notify(env, event, data); }; // aviso a n8n, sin esperar
  const logUsage = (connector, op, cost = null, units = 1) => db.prepare('INSERT INTO usage_log(connector,op,units,cost_usd) VALUES(?,?,?,?)').run(connector, op, units, cost);

  // ---------- helpers de activos ----------
  const assetOut = (a) => a && ({
    id: a.id, brand_id: a.brand_id, kind: a.kind, name: a.name, mime: a.mime, width: a.width, height: a.height, bytes: a.bytes,
    official: !!a.official, source: a.source, parent_id: a.parent_id, status: a.status, meta: j(a.meta, {}), created_at: a.created_at,
    url: `/files/${a.id}`, thumb_url: a.thumb ? `/files/${a.id}/thumb` : null,
  });
  const getAsset = (id) => db.prepare('SELECT * FROM assets WHERE id=?').get(Number(id));
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'video/mp4': 'mp4' };
  const isMedia = (m) => Boolean(m) && (m === 'application/pdf' || m.startsWith('audio/') || m.startsWith('video/'));

  async function saveAsset({ buffer, brand_id = null, kind, name, official = 0, source = 'upload', parent_id = null, status = 'none', meta = {}, mime, width: w0 = null, height: h0 = null, thumbBuffer = null }) {
    let width = w0, height = h0, thumbName = null;
    if (!isMedia(mime)) {
      let md;
      try { md = await sharp(buffer).metadata(); } catch { throw httpErr(400, 'El archivo no es una imagen válida.'); }
      const fmt = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }[md.format];
      if (!fmt) throw httpErr(400, `Formato de imagen no permitido (${md.format}). Use PNG, JPG, WEBP o SVG.`);
      mime = fmt; width = md.width; height = md.height;
    }
    const id = crypto.randomBytes(12).toString('hex');
    const file = `${id}.${EXT[mime]}`;
    fs.writeFileSync(path.join(uploads, file), buffer);
    if (!isMedia(mime)) {
      thumbName = `${id}.thumb.webp`;
      await sharp(buffer, { density: 144 }).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(uploads, thumbName));
    }
    if (mime.startsWith('video/') && thumbBuffer) {
      thumbName = `${id}.thumb.webp`;
      await sharp(thumbBuffer).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(uploads, thumbName));
    }
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const r = db.prepare(`INSERT INTO assets(brand_id,kind,name,file,thumb,mime,width,height,bytes,sha256,official,source,parent_id,status,meta)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(brand_id, kind, name, file, thumbName, mime, width, height, buffer.length, sha, official, source, parent_id, status, JSON.stringify(meta));
    return getAsset(r.lastInsertRowid);
  }
  function removeAssetFiles(a) {
    for (const f of [a.file, a.thumb]) if (f) fs.rmSync(path.join(uploads, f), { force: true });
  }
  const readAssetBuffer = (a) => fs.readFileSync(path.join(uploads, a.file));


  // Datos entregados por Michael (ficha técnica). Solo completa lo que esté vacío; nunca pisa lo que el usuario haya escrito.
  const PRINTCLEAN_DEFAULTS = {
    business: {
      actividad: 'Suministros para impresoras (tóner y tintas alternativos/compatibles) y artículos de aseo',
      whatsapp_pedidos: '+56 9 5820 5389', whatsapp_local: '+56 9 5014 6652', direccion: 'San Martín 267, Santiago Centro',
      horario: 'Lunes a viernes 9:00 a 18:30. Sábado y domingo cerrado',
      palabras_prohibidas: 'original, originales',
      nota_redaccion: 'En tóner y tintas usar «alternativo» o «compatible», nunca «original».',
    },
    socials: { instagram_suministros: '@printcleansuministros', instagram_limpieza: '@printclean_limpieza' },
    colors: [{ name: 'Azul marino Print Clean', hex: '#023473' }, { name: 'Celeste', hex: '#96dcfe' }],
    style: 'Logo B: círculo blanco con borde azul y la palabra «print clean». Nunca usar el logo de remolino de colores. No mezclar las cuentas de Instagram de suministros y de aseo.',
  };
  function seedPrintClean() {
    for (const b of db.prepare("SELECT * FROM brands WHERE name='Print Clean SPA'").all()) {
      const biz = j(b.business, {}), soc = j(b.socials, {});
      let changed = false;
      for (const [k, v] of Object.entries(PRINTCLEAN_DEFAULTS.business)) if (!biz[k]) { biz[k] = v; changed = true; }
      for (const [k, v] of Object.entries(PRINTCLEAN_DEFAULTS.socials)) if (!soc[k]) { soc[k] = v; changed = true; }
      const style = b.style || PRINTCLEAN_DEFAULTS.style;
      const hadColors = j(b.colors, []).length > 0; const colors = hadColors ? j(b.colors, []) : PRINTCLEAN_DEFAULTS.colors;
      if (changed || style !== b.style || !hadColors) db.prepare('UPDATE brands SET business=?,socials=?,style=?,colors=? WHERE id=?').run(JSON.stringify(biz), JSON.stringify(soc), style, JSON.stringify(colors), b.id);
    }
  }
  seedPrintClean();

  // ---------- app ----------
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '60mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // ---------- autenticación ----------
  app.get('/api/auth/status', (req, res) => res.json({ hasUsers: db.prepare('SELECT COUNT(*) c FROM users').get().c > 0 }));
  app.post('/api/auth/register', (req, res) => {
    if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) throw httpErr(403, 'El registro está cerrado. Pida al administrador que cree su usuario.');
    const { email, name, password } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(str(email))) throw httpErr(400, 'Correo no válido.');
    if (str(password, 200).length < 8) throw httpErr(400, 'La contraseña debe tener al menos 8 caracteres.');
    const r = db.prepare('INSERT INTO users(email,name,pass_hash,role) VALUES(?,?,?,?)').run(str(email).toLowerCase(), str(name) || 'Administrador', hashPassword(password), 'admin');
    // Marca inicial. Solo datos que el usuario ya dio: nombre y actividad. Sin colores/precios inventados.
    db.prepare('INSERT INTO brands(name,business,style) VALUES(?,?,?)').run('Print Clean SPA', '{}', '');
    seedPrintClean();
    audit(r.lastInsertRowid, 'register', email);
    auth.createSession(res, r.lastInsertRowid);
    res.json({ ok: true });
  });
  app.post('/api/auth/login', (req, res) => {
    const email = str(req.body?.email).toLowerCase();
    if (!auth.throttle(`${req.ip}|${email}`)) throw httpErr(429, 'Demasiados intentos. Espere 15 minutos.');
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!u || !verifyPassword(String(req.body?.password ?? ''), u.pass_hash)) throw httpErr(401, 'Correo o contraseña incorrectos.');
    auth.createSession(res, u.id);
    audit(u.id, 'login', email);
    res.json({ ok: true });
  });
  app.post('/api/auth/logout', (req, res) => { auth.destroySession(req, res); res.json({ ok: true }); });
  app.get('/api/auth/me', auth.requireAuth, (req, res) => res.json(req.user));

  // Todo lo demás requiere sesión
  app.use('/api', auth.requireAuth);
  app.use('/files', auth.requireAuth);

  app.get('/api/users', auth.requireAdmin, (req, res) => res.json(db.prepare('SELECT id,email,name,role,created_at FROM users ORDER BY id').all()));
  app.post('/api/users', auth.requireAdmin, (req, res) => {
    const { email, name, password, role } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(str(email))) throw httpErr(400, 'Correo no válido.');
    if (str(password, 200).length < 8) throw httpErr(400, 'La contraseña debe tener al menos 8 caracteres.');
    try {
      const r = db.prepare('INSERT INTO users(email,name,pass_hash,role) VALUES(?,?,?,?)').run(str(email).toLowerCase(), str(name) || 'Usuario', hashPassword(password), role === 'admin' ? 'admin' : 'user');
      audit(req.user.id, 'user.create', email);
      res.json({ id: Number(r.lastInsertRowid) });
    } catch (e) { if (/UNIQUE/.test(e.message)) throw httpErr(409, 'Ese correo ya existe.'); throw e; }
  });

  // ---------- marcas ----------
  const brandOut = (b) => b && ({ id: b.id, name: b.name, colors: j(b.colors, []), fonts: j(b.fonts, {}), style: b.style, socials: j(b.socials, {}), business: j(b.business, {}), logo_asset_id: b.logo_asset_id, logo: b.logo_asset_id ? assetOut(getAsset(b.logo_asset_id)) : null, created_at: b.created_at });
  const getBrand = (id) => db.prepare('SELECT * FROM brands WHERE id=?').get(Number(id));
  function brandFields(body, cur = {}) {
    const colors = Array.isArray(body.colors) ? body.colors.map((c) => ({ name: str(c.name, 40), hex: str(c.hex, 9) })).filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c.hex)).slice(0, 12) : j(cur.colors, []);
    const obj = (v, d) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [str(k, 40), str(x, 300)])) : d);
    return { colors, fonts: obj(body.fonts, j(cur.fonts, {})), socials: obj(body.socials, j(cur.socials, {})), business: obj(body.business, j(cur.business, {})), style: body.style !== undefined ? str(body.style, 1000) : cur.style };
  }
  app.get('/api/brands', (req, res) => res.json(db.prepare('SELECT * FROM brands ORDER BY id').all().map(brandOut)));
  app.post('/api/brands', (req, res) => {
    const name = str(req.body?.name, 80); if (!name) throw httpErr(400, 'La marca necesita un nombre.');
    const f = brandFields(req.body || {});
    const r = db.prepare('INSERT INTO brands(name,colors,fonts,style,socials,business) VALUES(?,?,?,?,?,?)').run(name, JSON.stringify(f.colors), JSON.stringify(f.fonts), f.style || '', JSON.stringify(f.socials), JSON.stringify(f.business));
    audit(req.user.id, 'brand.create', name);
    res.json(brandOut(getBrand(r.lastInsertRowid)));
  });
  app.get('/api/brands/:id', (req, res) => { const b = getBrand(req.params.id); if (!b) throw httpErr(404, 'Marca no encontrada.'); res.json(brandOut(b)); });
  app.put('/api/brands/:id', (req, res) => {
    const b = getBrand(req.params.id); if (!b) throw httpErr(404, 'Marca no encontrada.');
    const f = brandFields(req.body || {}, b);
    db.prepare('UPDATE brands SET name=?,colors=?,fonts=?,style=?,socials=?,business=? WHERE id=?').run(str(req.body?.name, 80) || b.name, JSON.stringify(f.colors), JSON.stringify(f.fonts), f.style ?? '', JSON.stringify(f.socials), JSON.stringify(f.business), b.id);
    audit(req.user.id, 'brand.update', b.name);
    res.json(brandOut(getBrand(b.id)));
  });
  app.delete('/api/brands/:id', auth.requireAdmin, (req, res) => {
    const b = getBrand(req.params.id); if (!b) throw httpErr(404, 'Marca no encontrada.');
    if (req.query.confirm !== '1') throw httpErr(400, 'Falta confirmación. Los archivos de la marca se conservan en la biblioteca.');
    db.prepare('UPDATE brands SET logo_asset_id=NULL WHERE id=?').run(b.id);
    db.prepare('DELETE FROM brands WHERE id=?').run(b.id);
    audit(req.user.id, 'brand.delete', b.name);
    res.json({ ok: true });
  });

  // ---------- biblioteca / archivos ----------
  const KINDS = ['logo', 'product', 'photo', 'background', 'material', 'other'];
  app.get('/api/assets', (req, res) => {
    const where = ["kind <> 'preview'"], args = [];
    if (req.query.brand_id) { where.push('brand_id=?'); args.push(Number(req.query.brand_id)); }
    if (req.query.kind) { where.push('kind=?'); args.push(str(req.query.kind, 20)); }
    if (req.query.status) { where.push('status=?'); args.push(str(req.query.status, 20)); }
    if (req.query.q) { where.push('name LIKE ?'); args.push(`%${str(req.query.q, 60)}%`); }
    res.json(db.prepare(`SELECT * FROM assets WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 500`).all(...args).map(assetOut));
  });
  // Audio: se valida con ffprobe y exige confirmar licencia de uso comercial (no se usa música protegida sin autorización).
  async function saveAudioUpload(req) {
    if (req.body.license_confirmed !== '1') throw httpErr(400, 'Confirme que tiene licencia de uso comercial de este audio (música libre de derechos, su propia grabación, etc.).');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-audio-'));
    const tmp = path.join(tmpDir, 'in.bin'); fs.writeFileSync(tmp, req.file.buffer);
    try {
      const info = await connectors.get('ffmpeg').probe(tmp, env);
      if (!info.hasAudio || info.hasVideo) throw httpErr(400, 'El archivo debe ser solo audio (MP3, WAV, M4A u OGG).');
      const fmt = info.format;
      const mime = /mp3/.test(fmt) ? 'audio/mpeg' : /wav/.test(fmt) ? 'audio/wav' : /ogg/.test(fmt) ? 'audio/ogg' : /mp4|m4a|mov/.test(fmt) ? 'audio/mp4' : null;
      if (!mime) throw httpErr(400, `Formato de audio no permitido (${fmt}). Use MP3, WAV, M4A u OGG.`);
      const brand = req.body.brand_id ? getBrand(req.body.brand_id) : null;
      return await saveAsset({ buffer: req.file.buffer, brand_id: brand?.id ?? null, kind: 'audio', mime, name: str(req.body.name) || str(req.file.originalname, 120) || 'audio', source: 'upload',
        meta: { duration: Math.round(info.duration * 10) / 10, license_confirmed: true, license_note: str(req.body.license_note, 200), voice: req.body.voice === '1' } });
    } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  }
  app.post('/api/assets', upload.single('file'), async (req, res) => {
    if (!req.file) throw httpErr(400, 'Falta el archivo.');
    if (req.body.kind === 'audio') { const a = await saveAudioUpload(req); audit(req.user.id, 'asset.upload', `audio:${a.name}`); return res.json(assetOut(a)); }
    const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'other';
    const brand = req.body.brand_id ? getBrand(req.body.brand_id) : null;
    if (req.body.brand_id && !brand) throw httpErr(404, 'Marca no encontrada.');
    const isLogo = kind === 'logo';
    const a = await saveAsset({
      buffer: req.file.buffer, brand_id: brand?.id ?? null, kind, name: str(req.body.name) || str(req.file.originalname, 120) || 'archivo',
      official: isLogo ? 1 : 0, source: 'upload', meta: isLogo ? { variant: str(req.body.variant, 30) || 'principal' } : {},
    });
    // El logo oficial se guarda tal cual; solo se registra como el vigente si es la variante principal o no hay ninguno.
    if (isLogo && brand && (!brand.logo_asset_id || (req.body.variant || 'principal') === 'principal')) {
      db.prepare('UPDATE brands SET logo_asset_id=? WHERE id=?').run(a.id, brand.id);
    }
    audit(req.user.id, 'asset.upload', `${kind}:${a.name}`);
    res.json(assetOut(a));
  });
  app.patch('/api/assets/:id', (req, res) => {
    const a = getAsset(req.params.id); if (!a) throw httpErr(404, 'Archivo no encontrado.');
    if (req.body?.status !== undefined) {
      if (a.kind !== 'generated' && a.kind !== 'video') throw httpErr(400, 'Solo las imágenes generadas y los videos se aprueban o rechazan.');
      if (a.kind === 'video' && j(a.meta, {}).draft) throw httpErr(400, 'Es una vista previa de baja calidad. Cree la versión final para aprobarla.');
      if (!['pending', 'approved', 'rejected'].includes(req.body.status)) throw httpErr(400, 'Estado no válido.');
      db.prepare('UPDATE assets SET status=? WHERE id=?').run(req.body.status, a.id);
      audit(req.user.id, `asset.${req.body.status}`, a.name);
      if (req.body.status === 'approved' && a.kind === 'video') emit('video.approved', { name: a.name });
    }
    if (req.body?.name !== undefined) db.prepare('UPDATE assets SET name=? WHERE id=?').run(str(req.body.name, 120) || a.name, a.id);
    res.json(assetOut(getAsset(a.id)));
  });
  app.delete('/api/assets/:id', (req, res) => {
    const a = getAsset(req.params.id); if (!a) throw httpErr(404, 'Archivo no encontrado.');
    if (a.official && req.query.confirm !== '1') throw httpErr(409, 'Es un archivo oficial de marca. Confirme para eliminarlo.');
    db.prepare('UPDATE brands SET logo_asset_id=NULL WHERE logo_asset_id=?').run(a.id);
    db.prepare('DELETE FROM assets WHERE id=?').run(a.id);
    removeAssetFiles(a);
    audit(req.user.id, 'asset.delete', a.name);
    res.json({ ok: true });
  });
  function sendFile(res, a, name, thumb = false, download = false) {
    const f = thumb ? a.thumb : a.file;
    if (!f) throw httpErr(404, 'Sin miniatura.');
    res.setHeader('Content-Type', thumb ? 'image/webp' : a.mime);
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (download) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.sendFile(path.join(uploads, f));
  }
  app.get('/files/:id', (req, res) => { const a = getAsset(req.params.id); if (!a) throw httpErr(404, 'No encontrado'); sendFile(res, a, a.name); });
  app.get('/files/:id/thumb', (req, res) => { const a = getAsset(req.params.id); if (!a) throw httpErr(404, 'No encontrado'); sendFile(res, a, a.name, true); });
  app.get('/api/assets/:id/download', (req, res) => {
    const a = getAsset(req.params.id); if (!a) throw httpErr(404, 'No encontrado');
    const ext = EXT[a.mime]; const base = a.name.replace(/\.[a-z0-9]+$/i, '');
    sendFile(res, a, `${base}.${ext}`, false, true);
  });

  // Pie de la «Tarjeta Print Clean»: WhatsApp de pedidos + Instagram de la línea (suministros o aseo; nunca se mezclan)
  function cardFooter(brand, useWa, line) {
    const biz = brand ? j(brand.business, {}) : {}, soc = brand ? j(brand.socials, {}) : {};
    const handle = line === 'suministros' ? soc.instagram_suministros : line === 'aseo' ? soc.instagram_limpieza : '';
    if (!useWa || !biz.whatsapp_pedidos) return handle ? ['', '', `Instagram ${handle}`].filter(Boolean) : [];
    return ['Escríbenos por WhatsApp', biz.whatsapp_pedidos, handle ? `Instagram ${handle}` : ''].filter(Boolean);
  }
  const cardPalette = (brand) => { const c = (brand ? j(brand.colors, []) : []).map((x) => x.hex); return { navy: c[0] || '#023473', sky: c[1] || '#96dcfe' }; };

  // ---------- generador de imágenes ----------
  app.get('/api/formats', (req, res) => res.json(FORMATS));
  const luminance = (hex) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6); const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const hexOk = (s) => /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$/.test(s || '');

  app.post('/api/images/generate', async (req, res) => {
    const b = req.body || {};
    const brand = b.brand_id ? getBrand(b.brand_id) : null;
    const fmt = FORMATS[b.format];
    if (!fmt) throw httpErr(400, 'Formato no válido.');
    const { w, h } = fmt;
    const provider = b.provider || 'local-compose';
    const src = b.source_asset_id ? getAsset(b.source_asset_id) : null;
    if (b.source_asset_id && !src) throw httpErr(404, 'La imagen original no existe.');
    const baseMeta = { provider, format: b.format, headline: str(b.headline, 120), subline: str(b.subline, 200), prompt: str(b.prompt, 1500) };
    let result, cost = 0, meta;

    if (provider === 'local-compose') {
      if (!src) throw httpErr(400, 'Seleccione la fotografía original del producto.');
      const colors = (Array.isArray(b.bg_colors) ? b.bg_colors : []).filter(hexOk).slice(0, 2);
      const bg = { type: b.bg_type === 'gradient' && colors.length > 1 ? 'gradient' : 'solid', colors: colors.length ? colors : ['#ffffff'] };
      const textColor = hexOk(b.text_color) ? b.text_color : (luminance(bg.colors[0]) > 0.55 ? '#111111' : '#ffffff');
      let logoBuffer = null;
      if (b.use_logo && brand?.logo_asset_id) logoBuffer = readAssetBuffer(getAsset(brand.logo_asset_id));
      if (b.use_logo && !logoBuffer) throw httpErr(400, 'La marca no tiene logo oficial cargado.');
      if (b.layout === 'cutout') {
        result = await connectors.get('local-compose').composeCutout({ width: w, height: h, cutoutBuffer: readAssetBuffer(src), logoBuffer, headline: str(b.headline, 120), subline: str(b.subline, 220), badgeTop: str(b.badge_top, 20), badgeMain: str(b.badge_main, 14), footerLines: cardFooter(brand, b.use_whatsapp, b.line), palette: cardPalette(brand), scale: Number(b.product_scale) || 1 });
        meta = { ...baseMeta, ...result.meta, line: b.line || null, logoUsed: !!logoBuffer, badge: b.badge_main || null };
        cost = 0;
      } else if (b.layout === 'card') {
        result = await connectors.get('local-compose').composeCard({ width: w, height: h, photoBuffer: readAssetBuffer(src), logoBuffer, headline: str(b.headline, 120), subline: str(b.subline, 200), footerLines: cardFooter(brand, b.use_whatsapp, b.line), palette: cardPalette(brand), rotate: b.photo_rotate, zoom: b.photo_zoom, fx: b.focus_x, fy: b.focus_y });
        meta = { ...baseMeta, ...result.meta, line: b.line || null, logoUsed: !!logoBuffer };
        cost = 0;
      } else {
      result = await connectors.get('local-compose').compose({ width: w, height: h, productBuffer: readAssetBuffer(src), logoBuffer, bg, headline: str(b.headline, 120), subline: str(b.subline, 200), footer: b.use_whatsapp && brand && j(brand.business, {}).whatsapp_pedidos ? `WhatsApp pedidos: ${j(brand.business, {}).whatsapp_pedidos}` : '', textColor, font: brand?.fonts ? (j(brand.fonts, {}).titulos || 'sans-serif') : 'sans-serif', layout: b.layout });
      meta = { ...baseMeta, ...result.meta, bg, logoUsed: !!logoBuffer };
      cost = 0;
      }
    } else if (provider === 'ollama-image' || provider === 'sd-webui') {
      // Motores de IA locales y gratuitos (Ollama experimental / Stable Diffusion WebUI).
      const prompt = str(b.prompt, 1500); if (!prompt) throw httpErr(400, 'Escriba la descripción de la imagen.');
      const negative = str(b.negative, 500);
      if (provider === 'ollama-image') {
        const model = str(b.model, 100); if (!model) throw httpErr(400, 'Elija un modelo de imagen de Ollama.');
        result = await connectors.get('ollama').generateImage({ env, model, prompt, width: w, height: h });
        meta = { ...baseMeta, model, experimental: true, productModified: false };
      } else {
        const sd = connectors.get('sd-webui');
        if (b.mode === 'edit') {
          if (!src) throw httpErr(400, 'Para editar, seleccione la imagen original.');
          result = await sd.img2img({ env, prompt, negative, width: w, height: h, imageBuffer: readAssetBuffer(src) });
          meta = { ...baseMeta, mode: 'edit', productModified: 'posible: la IA puede alterar el producto; compare con el original' };
        } else {
          result = await sd.txt2img({ env, prompt, negative, width: w, height: h });
          meta = { ...baseMeta, mode: 'text2img', productModified: false };
        }
      }
      cost = 0;
    } else throw httpErr(400, 'Proveedor no válido.');

    const asset = await saveAsset({
      buffer: result.buffer, brand_id: brand?.id ?? src?.brand_id ?? null, kind: 'generated', mime: 'image/png',
      name: `${brand?.name || 'Imagen'} ${fmt.label.split(' (')[0]} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      source: provider, parent_id: src?.id ?? null, status: 'pending', meta,
    });
    logUsage(provider, 'image.generate', cost);
    audit(req.user.id, 'image.generate', `${provider} ${b.format}`);
    emit('image.pending', { brand: brand?.name ?? null, name: asset.name, format: fmt.label, provider });
    res.json(assetOut(asset));
  });

  // ---------- video y Reels (FFmpeg local) ----------
  const jobs = new Map();
  const luma = (hex) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6); const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  app.get('/api/video-formats', (req, res) => res.json(VIDEO_FORMATS));
  app.post('/api/videos', async (req, res) => {
    const b = req.body || {};
    const fmt = VIDEO_FORMATS[b.format]; if (!fmt) throw httpErr(400, 'Formato de video no válido.');
    if (!Array.isArray(b.scenes) || !b.scenes.length) throw httpErr(400, 'Agregue al menos una escena.');
    const brand = b.brand_id ? getBrand(b.brand_id) : null;
    if (!(await connectors.get('ffmpeg').status(env)).configured) throw httpErr(503, 'FFmpeg no está instalado. Instálelo (gratis): Windows → winget install Gyan.FFmpeg · macOS → brew install ffmpeg · Linux → sudo apt install ffmpeg.');
    const scenes = b.scenes.map((s0, i) => {
      const a = getAsset(s0?.asset_id);
      if (!a || !a.mime.startsWith('image/')) throw httpErr(400, `La escena ${i + 1} necesita una imagen de la biblioteca.`);
      return { buffer: readAssetBuffer(a), seconds: Number(s0.seconds) || 3, caption: str(s0.caption, 90), asset: a, rotate: s0.rotate, zoom: s0.zoom, fx: s0.fx, fy: s0.fy, subcaption: str(s0.subcaption, 160), badgeTop: str(s0.badge_top, 20), badgeMain: str(s0.badge_main, 14), hideFooter: Boolean(s0.hide_footer) };
    });
    const audioOf = (id, label) => { if (!id) return null; const a = getAsset(id); if (!a || !a.mime.startsWith('audio/')) throw httpErr(400, `${label}: elija un audio de la biblioteca.`); return a; };
    const music = audioOf(b.music_asset_id, 'Música'), voice = audioOf(b.voice_asset_id, 'Voz');
    const colors = (brand ? j(brand.colors, []) : []).map((c) => c.hex).filter((x) => /^#[0-9a-fA-F]{6}$/.test(x));
    const bgColor = /^#[0-9a-fA-F]{6}$/.test(b.bg_color || '') ? b.bg_color : (colors[0] || '#ffffff');
    const biz = brand ? j(brand.business, {}) : {};
    let logoBuffer = null;
    if (b.use_logo) { if (!brand?.logo_asset_id) throw httpErr(400, 'La marca no tiene logo oficial cargado.'); logoBuffer = readAssetBuffer(getAsset(brand.logo_asset_id)); }
    const footer = b.use_whatsapp && biz.whatsapp_pedidos ? `WhatsApp pedidos: ${biz.whatsapp_pedidos}` : '';
    const vol = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Math.min(1.5, Math.max(0, Number(v))) : d);
    const jobId = crypto.randomBytes(8).toString('hex');
    const job = { id: jobId, status: 'running', progress: 0, userId: req.user.id };
    jobs.set(jobId, job); setTimeout(() => jobs.delete(jobId), 3600 * 1000).unref();
    res.status(202).json({ job_id: jobId });
    (async () => {
      try {
        const r = await renderVideo({
          env, scenes, format: fmt, draft: Boolean(b.draft), transition: b.transition === 'none' ? 'none' : 'fade', transitionSeconds: b.transition_seconds, motion: b.motion !== false,
          musicFile: music ? path.join(uploads, music.file) : null, musicVolume: vol(b.music_volume, voice ? 0.2 : 0.6), voiceFile: voice ? path.join(uploads, voice.file) : null, voiceVolume: vol(b.voice_volume, 1),
          style: { bg: { type: 'solid', colors: [bgColor] }, textColor: luma(bgColor) > 0.55 ? '#111111' : '#ffffff', font: (brand && j(brand.fonts, {}).titulos) || 'sans-serif', logoBuffer, footer,
            card: b.layout === 'card' || b.layout === 'cutout' ? { mode: b.layout, footerLines: cardFooter(brand, b.use_whatsapp, b.line), palette: cardPalette(brand) } : null },
          onProgress: (p) => { job.progress = p; },
        });
        const warnings = [];
        for (const a of [music, voice]) if (a && !j(a.meta, {}).license_confirmed) warnings.push(`El audio «${a.name}» no tiene licencia comercial confirmada.`);
        const asset = await saveAsset({
          buffer: r.buffer, brand_id: brand?.id ?? null, kind: 'video', mime: 'video/mp4', width: r.width, height: r.height, thumbBuffer: r.thumbBuffer, source: 'ffmpeg', status: 'pending',
          name: `${str(b.name, 80) || `${brand?.name || 'Video'} ${fmt.label.split(' (')[0]}`}${b.draft ? ' (vista previa)' : ''} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          meta: { format: b.format, draft: Boolean(b.draft), duration: Math.round(r.duration * 10) / 10, scenes: scenes.map((x) => ({ asset_id: x.asset.id, seconds: x.seconds, caption: x.caption })), music_asset_id: music?.id ?? null, voice_asset_id: voice?.id ?? null, transition: b.transition === 'none' ? 'none' : 'fade', motion: b.motion !== false, whatsapp: Boolean(footer), logo: Boolean(logoBuffer), warnings },
        });
        logUsage('ffmpeg', 'video.render', 0); audit(job.userId, 'video.create', asset.name);
        if (!b.draft) emit('video.pending', { brand: brand?.name ?? null, name: asset.name, format: fmt.label });
        job.status = 'done'; job.progress = 1; job.asset = assetOut(asset);
      } catch (e) { job.status = 'error'; job.error = e.message; if (!e.status || e.status >= 500) console.error('[video]', e); }
    })();
  });
  app.get('/api/videos/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id); if (!job || job.userId !== req.user.id) throw httpErr(404, 'Trabajo no encontrado (puede haber expirado).');
    res.json({ status: job.status, progress: job.progress, asset: job.asset ?? null, error: job.error ?? null });
  });

  // ---------- voz IA local (Piper) ----------
  app.post('/api/voice', async (req, res) => {
    const text = str(req.body?.text, 1500); if (!text) throw httpErr(400, 'Escriba el texto de la locución.');
    const brand = req.body?.brand_id ? getBrand(req.body.brand_id) : null;
    const banned = String(brand ? j(brand.business, {}).palabras_prohibidas || '' : '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const hit = banned.find((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(text));
    if (hit) throw httpErr(400, `El texto usa la palabra prohibida «${hit}» según las reglas de la marca.`);
    const r = await connectors.get('piper').synth({ env, text });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-voz-')); const tmp = path.join(tmpDir, 'v.wav'); fs.writeFileSync(tmp, r.buffer);
    let info; try { info = await connectors.get('ffmpeg').probe(tmp, env); } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    const a = await saveAsset({ buffer: r.buffer, brand_id: brand?.id ?? null, kind: 'audio', mime: 'audio/wav', name: str(req.body?.name, 80) || `Locución ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, source: 'piper', meta: { duration: Math.round(info.duration * 10) / 10, voice: true, text, license_confirmed: false, license_note: 'Voz sintética local (Piper): verifique la licencia de la voz antes de uso comercial.' } });
    logUsage('piper', 'voice.synth', 0); audit(req.user.id, 'voice.create', a.name);
    res.json(assetOut(a));
  });
  app.post('/api/assets/:id/confirm-license', (req, res) => {
    const a = getAsset(req.params.id); if (!a || a.kind !== 'audio') throw httpErr(404, 'Audio no encontrado.');
    const m = j(a.meta, {}); m.license_confirmed = true; m.license_note = str(req.body?.license_note, 200) || m.license_note;
    db.prepare('UPDATE assets SET meta=? WHERE id=?').run(JSON.stringify(m), a.id); audit(req.user.id, 'audio.license', a.name);
    res.json(assetOut(getAsset(a.id)));
  });

  // ---------- marketing con IA local ----------
  app.get('/api/ai/marketing-kinds', (req, res) => res.json(Object.fromEntries(Object.entries(marketing.KINDS).map(([k, v]) => [k, v.label]))));
  app.post('/api/ai/marketing', async (req, res) => {
    const b = req.body || {};
    const brand = b.brand_id ? getBrand(b.brand_id) : null;
    const out = await marketing.generate({
      env, kind: str(b.kind, 30), model: str(b.model, 100), notes: str(b.notes, 1500), audience: str(b.audience, 200), line: ['suministros', 'aseo'].includes(b.line) ? b.line : '',
      brand: brand ? { name: brand.name, business: j(brand.business, {}), socials: j(brand.socials, {}), style: brand.style } : null,
    });
    logUsage('ollama', `marketing.${out.kind}`); audit(req.user.id, 'ai.marketing', `${out.kind} ${out.model}`);
    res.json(out);
  });

  // ---------- asistente de textos con IA local (Ollama) ----------
  app.post('/api/ai/suggest-copy', async (req, res) => {
    const b = req.body || {};
    const brand = b.brand_id ? getBrand(b.brand_id) : null;
    const src = b.source_asset_id ? getAsset(b.source_asset_id) : null;
    const out = await suggestCopy({
      env, model: str(b.model, 100), brand: brand ? { name: brand.name, business: j(brand.business, {}), style: brand.style } : null,
      notes: str(b.notes, 1500), imageBuffer: b.use_image && src ? readAssetBuffer(src) : null,
    });
    logUsage('ollama', 'text.suggest');
    audit(req.user.id, 'ai.suggest', out.model);
    res.json(out);
  });

  // ---------- diseños ----------
  const designOut = (d, withJson = false) => d && ({
    id: d.id, brand_id: d.brand_id, name: d.name, width: d.width, height: d.height, format: d.format, status: d.status,
    is_template: !!d.is_template, version: d.version, created_at: d.created_at, updated_at: d.updated_at,
    preview_url: d.preview_asset_id ? `/files/${d.preview_asset_id}/thumb` : null, ...(withJson ? { json: j(d.json, {}) } : {}),
  });
  const getDesign = (id) => db.prepare('SELECT * FROM designs WHERE id=?').get(Number(id));
  const dims = (b) => {
    const f = FORMATS[b.format];
    const w = f ? f.w : Number(b.width), h = f ? f.h : Number(b.height);
    if (!(w >= 100 && w <= 4000 && h >= 50 && h <= 4000)) throw httpErr(400, 'Medidas no válidas (100–4000 px).');
    return { w, h, format: f ? b.format : 'custom' };
  };
  async function savePreview(design, dataUrl, userId) {
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) return design.preview_asset_id;
    const small = await sharp(Buffer.from(m[2], 'base64')).resize(600, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const a = await saveAsset({ buffer: small, brand_id: design.brand_id, kind: 'preview', name: `preview-${design.id}`, source: 'editor', mime: 'image/jpeg' });
    if (design.preview_asset_id) { const old = getAsset(design.preview_asset_id); if (old) { db.prepare('DELETE FROM assets WHERE id=?').run(old.id); removeAssetFiles(old); } }
    return a.id;
  }

  app.get('/api/designs', (req, res) => {
    const tpl = req.query.template === '1' ? 1 : 0;
    const where = ['is_template=?'], args = [tpl];
    if (req.query.brand_id) { where.push('brand_id=?'); args.push(Number(req.query.brand_id)); }
    if (req.query.status) { where.push('status=?'); args.push(str(req.query.status, 20)); }
    res.json(db.prepare(`SELECT * FROM designs WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT 300`).all(...args).map((d) => designOut(d)));
  });
  app.post('/api/designs', async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 100) || 'Diseño sin título';
    const brand = b.brand_id ? getBrand(b.brand_id) : null;
    let d, json;
    if (b.from_design_id) { // duplicar o crear desde plantilla
      const src = getDesign(b.from_design_id); if (!src) throw httpErr(404, 'Diseño base no encontrado.');
      d = { w: src.width, h: src.height, format: src.format }; json = src.json;
    } else { d = dims(b); json = JSON.stringify(b.json || { version: '5.3.0', objects: [], background: '#ffffff' }); }
    const r = db.prepare('INSERT INTO designs(brand_id,name,width,height,format,json,is_template) VALUES(?,?,?,?,?,?,0)').run(brand?.id ?? null, name, d.w ?? d.width, d.h ?? d.height, d.format, json);
    audit(req.user.id, 'design.create', name);
    res.json(designOut(getDesign(r.lastInsertRowid), true));
  });
  app.get('/api/designs/:id', (req, res) => { const d = getDesign(req.params.id); if (!d) throw httpErr(404, 'Diseño no encontrado.'); res.json(designOut(d, true)); });
  app.put('/api/designs/:id', async (req, res) => {
    const d = getDesign(req.params.id); if (!d) throw httpErr(404, 'Diseño no encontrado.');
    const b = req.body || {};
    const newJson = b.json ? JSON.stringify(b.json) : d.json;
    const changed = newJson !== d.json;
    let version = d.version, status = d.status;
    if (changed) {
      db.prepare('INSERT INTO design_versions(design_id,version,json) VALUES(?,?,?)').run(d.id, d.version, d.json);
      version = d.version + 1;
      if (status === 'approved') status = 'draft'; // cualquier cambio exige nueva aprobación
    }
    const preview = await savePreview(d, b.preview, req.user.id);
    db.prepare("UPDATE designs SET name=?,json=?,version=?,status=?,preview_asset_id=?,updated_at=datetime('now') WHERE id=?").run(str(b.name, 100) || d.name, newJson, version, status, preview ?? null, d.id);
    res.json(designOut(getDesign(d.id), true));
  });
  app.patch('/api/designs/:id/status', (req, res) => {
    const d = getDesign(req.params.id); if (!d) throw httpErr(404, 'Diseño no encontrado.');
    if (!['draft', 'approved', 'rejected'].includes(req.body?.status)) throw httpErr(400, 'Estado no válido.');
    db.prepare('UPDATE designs SET status=? WHERE id=?').run(req.body.status, d.id);
    audit(req.user.id, `design.${req.body.status}`, d.name);
    if (req.body.status === 'approved') emit('design.approved', { name: d.name, format: `${d.width}x${d.height}`, version: d.version });
    res.json(designOut(getDesign(d.id)));
  });
  app.post('/api/designs/:id/template', (req, res) => {
    const d = getDesign(req.params.id); if (!d) throw httpErr(404, 'Diseño no encontrado.');
    const r = db.prepare('INSERT INTO designs(brand_id,name,width,height,format,json,is_template,preview_asset_id) VALUES(?,?,?,?,?,?,1,NULL)').run(d.brand_id, str(req.body?.name, 100) || `Plantilla ${d.name}`, d.width, d.height, d.format, d.json);
    audit(req.user.id, 'template.create', d.name);
    res.json(designOut(getDesign(r.lastInsertRowid)));
  });
  app.delete('/api/designs/:id', (req, res) => {
    const d = getDesign(req.params.id); if (!d) throw httpErr(404, 'Diseño no encontrado.');
    db.prepare('DELETE FROM designs WHERE id=?').run(d.id);
    if (d.preview_asset_id) { const a = getAsset(d.preview_asset_id); if (a) { db.prepare('DELETE FROM assets WHERE id=?').run(a.id); removeAssetFiles(a); } }
    audit(req.user.id, 'design.delete', d.name);
    res.json({ ok: true });
  });
  app.get('/api/designs/:id/versions', (req, res) => res.json(db.prepare('SELECT id,version,created_at FROM design_versions WHERE design_id=? ORDER BY version DESC').all(Number(req.params.id))));
  app.post('/api/designs/:id/restore/:version', (req, res) => {
    const d = getDesign(req.params.id); if (!d) throw httpErr(404, 'Diseño no encontrado.');
    const v = db.prepare('SELECT * FROM design_versions WHERE design_id=? AND version=?').get(d.id, Number(req.params.version));
    if (!v) throw httpErr(404, 'Versión no encontrada.');
    db.prepare('INSERT INTO design_versions(design_id,version,json) VALUES(?,?,?)').run(d.id, d.version, d.json);
    db.prepare("UPDATE designs SET json=?,version=?,status='draft',updated_at=datetime('now') WHERE id=?").run(v.json, d.version + 1, d.id);
    res.json(designOut(getDesign(d.id), true));
  });

  // Exportación PNG/JPG/PDF. Solo diseños aprobados.
  app.post('/api/designs/:id/export', async (req, res) => {
    const d = getDesign(req.params.id); if (!d) throw httpErr(404, 'Diseño no encontrado.');
    if (d.status !== 'approved') throw httpErr(403, 'El diseño debe estar APROBADO antes de exportarse.');
    const fmt = req.body?.format;
    if (!['png', 'jpg', 'pdf'].includes(fmt)) throw httpErr(400, 'Formato no válido (png, jpg, pdf).');
    if (Number(req.body?.version) !== d.version) throw httpErr(409, 'El diseño cambió. Guárdelo y vuélvalo a aprobar.');
    const m = /^data:image\/png;base64,(.+)$/.exec(String(req.body?.dataUrl || ''));
    if (!m) throw httpErr(400, 'Falta la imagen del lienzo (PNG).');
    const png = Buffer.from(m[1], 'base64');
    const md = await sharp(png).metadata().catch(() => { throw httpErr(400, 'Imagen no válida.'); });
    if (md.width !== d.width || md.height !== d.height) throw httpErr(400, `La imagen debe medir ${d.width}x${d.height} px.`);
    let out, mime;
    if (fmt === 'png') { out = png; mime = 'image/png'; }
    else {
      out = await sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer(); mime = 'image/jpeg';
      if (fmt === 'pdf') {
        const jpg = out;
        out = await new Promise((resolve, reject) => {
          const doc = new PDFDocument({ size: [d.width * 0.75, d.height * 0.75], margin: 0, info: { Title: d.name } });
          const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
          doc.image(jpg, 0, 0, { width: d.width * 0.75, height: d.height * 0.75 }); doc.end();
        });
        mime = 'application/pdf';
      }
    }
    const asset = await saveAsset({ buffer: out, brand_id: d.brand_id, kind: 'export', name: `${d.name} v${d.version}.${fmt}`, source: 'editor', mime, meta: { design_id: d.id, version: d.version, format: fmt } });
    logUsage('editor-local', `export.${fmt}`, 0);
    audit(req.user.id, 'design.export', `${d.name} ${fmt}`);
    emit('export.created', { name: d.name, file_format: fmt });
    res.json(assetOut(asset));
  });

  // ---------- conectores, consumo, panel ----------
  app.get('/api/connectors', async (req, res) => res.json({ active: await connectors.list(env), planned: connectors.planned }));
  app.get('/api/usage', (req, res) => res.json(usageSummary()));
  function usageSummary() {
    // Todos los conectores incluidos son gratuitos: solo se cuenta el uso.
    return db.prepare('SELECT connector, COUNT(*) ops FROM usage_log GROUP BY connector').all();
  }
  app.get('/api/dashboard', async (req, res) => {
    const c = (sql) => db.prepare(sql).get().c;
    res.json({
      counts: {
        designs: c("SELECT COUNT(*) c FROM designs WHERE is_template=0"),
        images: c("SELECT COUNT(*) c FROM assets WHERE kind='generated'"),
        images_pending: c("SELECT COUNT(*) c FROM assets WHERE kind='generated' AND status='pending'"),
        videos: c("SELECT COUNT(*) c FROM assets WHERE kind='video'"), exports: c("SELECT COUNT(*) c FROM assets WHERE kind='export'"),
        designs_pending: c("SELECT COUNT(*) c FROM designs WHERE is_template=0 AND status<>'approved'"),
        brands: c('SELECT COUNT(*) c FROM brands'),
      },
      recent_designs: db.prepare('SELECT * FROM designs WHERE is_template=0 ORDER BY updated_at DESC, id DESC LIMIT 6').all().map((d) => designOut(d)),
      recent_images: db.prepare("SELECT * FROM assets WHERE kind='generated' ORDER BY id DESC LIMIT 6").all().map(assetOut),
      recent_videos: db.prepare("SELECT * FROM assets WHERE kind='video' ORDER BY id DESC LIMIT 6").all().map(assetOut),
      recent_exports: db.prepare("SELECT * FROM assets WHERE kind='export' ORDER BY id DESC LIMIT 6").all().map(assetOut),
      pending_designs: db.prepare("SELECT * FROM designs WHERE is_template=0 AND status<>'approved' ORDER BY updated_at DESC LIMIT 6").all().map((d) => designOut(d)),
      connectors_active: (await connectors.list(env)).filter((x) => x.configured).map((x) => x.label),
      usage: usageSummary(),
    });
  });

  // ---------- respaldo ----------
  app.post('/api/backup', auth.requireAdmin, (req, res) => {
    const dir = path.join(dataDir, 'backups'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `estudio-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    audit(req.user.id, 'backup', path.basename(file));
    emit('backup.created', { file: path.basename(file) });
    res.json({ ok: true, file: path.basename(file), note: 'Respalda la base de datos. Los archivos están en data/uploads (copie esa carpeta o use npm run backup).' });
  });

  // ---------- errores ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || 500, msg = err.message;
    if (err instanceof multer.MulterError) { status = 400; msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 25 MB.' : err.message; }
    if (err.type === 'entity.too.large') { status = 413; msg = 'La solicitud es demasiado grande.'; }
    // Los errores de servicios externos (502/503/504) llevan un mensaje claro y deliberado; solo se oculta el 500 inesperado.
    if (status === 500) { console.error('[error]', err); msg = 'Error interno del servidor.'; }
    res.status(status).json({ error: msg });
  });

  app.locals.db = db;
  return app;
}
module.exports = { createApp };
