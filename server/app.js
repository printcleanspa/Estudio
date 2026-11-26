'use strict';
const fs = require('node:fs');
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

const httpErr = (status, msg) => Object.assign(new Error(msg), { status });
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const MAX_UPLOAD = 25 * 1024 * 1024;

function createApp({ dataDir = path.join(process.cwd(), 'data'), env = process.env } = {}) {
  const db = openDb(dataDir);
  const uploads = path.join(dataDir, 'uploads');
  const auth = makeAuth(db, { secureCookie: env.COOKIE_SECURE === '1' });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1 } });
  const audit = (userId, action, detail = '') => db.prepare('INSERT INTO audit_log(user_id,action,detail) VALUES(?,?,?)').run(userId ?? null, action, String(detail).slice(0, 500));
  const logUsage = (connector, op, cost = null, units = 1) => db.prepare('INSERT INTO usage_log(connector,op,units,cost_usd) VALUES(?,?,?,?)').run(connector, op, units, cost);

  // ---------- helpers de activos ----------
  const assetOut = (a) => a && ({
    id: a.id, brand_id: a.brand_id, kind: a.kind, name: a.name, mime: a.mime, width: a.width, height: a.height, bytes: a.bytes,
    official: !!a.official, source: a.source, parent_id: a.parent_id, status: a.status, meta: j(a.meta, {}), created_at: a.created_at,
    url: `/files/${a.id}`, thumb_url: a.thumb ? `/files/${a.id}/thumb` : null,
  });
  const getAsset = (id) => db.prepare('SELECT * FROM assets WHERE id=?').get(Number(id));
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };

  async function saveAsset({ buffer, brand_id = null, kind, name, official = 0, source = 'upload', parent_id = null, status = 'none', meta = {}, mime }) {
    let width = null, height = null, thumbName = null;
    if (mime !== 'application/pdf') {
      let md;
      try { md = await sharp(buffer).metadata(); } catch { throw httpErr(400, 'El archivo no es una imagen válida.'); }
      const fmt = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }[md.format];
      if (!fmt) throw httpErr(400, `Formato de imagen no permitido (${md.format}). Use PNG, JPG, WEBP o SVG.`);
      mime = fmt; width = md.width; height = md.height;
    }
    const id = crypto.randomBytes(12).toString('hex');
    const file = `${id}.${EXT[mime]}`;
    fs.writeFileSync(path.join(uploads, file), buffer);
    if (mime !== 'application/pdf') {
      thumbName = `${id}.thumb.webp`;
      await sharp(buffer, { density: 144 }).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(uploads, thumbName));
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
    db.prepare('INSERT INTO brands(name,business,style) VALUES(?,?,?)').run('Print Clean SPA', JSON.stringify({ actividad: 'Suministros para impresoras y artículos de aseo' }), '');
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
  app.post('/api/assets', upload.single('file'), async (req, res) => {
    if (!req.file) throw httpErr(400, 'Falta el archivo.');
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
      if (a.kind !== 'generated') throw httpErr(400, 'Solo las imágenes generadas se aprueban o rechazan.');
      if (!['pending', 'approved', 'rejected'].includes(req.body.status)) throw httpErr(400, 'Estado no válido.');
      db.prepare('UPDATE assets SET status=? WHERE id=?').run(req.body.status, a.id);
      audit(req.user.id, `asset.${req.body.status}`, a.name);
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
      result = await connectors.get('local-compose').compose({ width: w, height: h, productBuffer: readAssetBuffer(src), logoBuffer, bg, headline: str(b.headline, 120), subline: str(b.subline, 200), textColor, font: brand?.fonts ? (j(brand.fonts, {}).titulos || 'sans-serif') : 'sans-serif', layout: b.layout });
      meta = { ...baseMeta, ...result.meta, bg, logoUsed: !!logoBuffer };
      cost = 0;
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
    res.json(assetOut(asset));
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
        videos: 0, exports: c("SELECT COUNT(*) c FROM assets WHERE kind='export'"),
        designs_pending: c("SELECT COUNT(*) c FROM designs WHERE is_template=0 AND status<>'approved'"),
        brands: c('SELECT COUNT(*) c FROM brands'),
      },
      recent_designs: db.prepare('SELECT * FROM designs WHERE is_template=0 ORDER BY updated_at DESC, id DESC LIMIT 6').all().map((d) => designOut(d)),
      recent_images: db.prepare("SELECT * FROM assets WHERE kind='generated' ORDER BY id DESC LIMIT 6").all().map(assetOut),
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
