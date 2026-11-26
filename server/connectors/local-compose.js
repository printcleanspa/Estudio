'use strict';
/**
 * Conector LOCAL (gratuito): compone una imagen publicitaria con sharp.
 * La fotografía del producto se conserva SIN alterar (solo se escala proporcionalmente).
 * No elimina fondos ni "inventa" nada: coloca el producto sobre un fondo de marca.
 */
const sharp = require('sharp');

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function backgroundSvg(w, h, bg) {
  const c1 = bg.colors?.[0] || '#ffffff';
  const c2 = bg.colors?.[1] || c1;
  if (bg.type === 'solid') return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${esc(c1)}"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(c1)}"/><stop offset="1" stop-color="${esc(c2)}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

function textSvg(w, h, { headline, subline, footer, color, font, layout }) {
  const fs1 = Math.round(Math.min(w, h) * 0.07);
  const fs2 = Math.round(fs1 * 0.55);
  const maxChars = Math.max(10, Math.floor((w * 0.86) / (fs1 * 0.55)));
  const l1 = headline ? wrap(headline, maxChars) : [];
  const l2 = subline ? wrap(subline, Math.floor(maxChars * 1.6)) : [];
  const blockH = l1.length * fs1 * 1.2 + (l2.length ? l2.length * fs2 * 1.3 + fs2 * 0.5 : 0);
  let y = layout === 'text-bottom' ? h - blockH - h * (footer ? 0.095 : 0.05) + fs1 : h * 0.06 + fs1 + (layout === 'text-top-logo' ? h * 0.07 : 0);
  let out = '';
  for (const l of l1) { out += `<text x="${w / 2}" y="${y}" font-size="${fs1}" font-weight="700" text-anchor="middle" fill="${esc(color)}" font-family="${esc(font)}">${esc(l)}</text>`; y += fs1 * 1.2; }
  y += fs2 * 0.3;
  for (const l of l2) { out += `<text x="${w / 2}" y="${y}" font-size="${fs2}" text-anchor="middle" fill="${esc(color)}" font-family="${esc(font)}">${esc(l)}</text>`; y += fs2 * 1.3; }
  if (footer) out += `<text x="${w / 2}" y="${h - h * 0.03}" font-size="${Math.round(fs2 * 0.8)}" font-weight="700" text-anchor="middle" fill="${esc(color)}" font-family="${esc(font)}">${esc(footer)}</text>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${out}</svg>`);
}

/** @returns {Promise<{buffer:Buffer, width:number, height:number, meta:object}>} */
async function compose({ width, height, productBuffer, logoBuffer, bg, headline, subline, footer, textColor, font, layout }) {
  const hasText = Boolean(headline || subline);
  const lay = layout || (hasText ? 'text-top' : 'center');
  let base = sharp(Buffer.from(backgroundSvg(width, height, bg || { type: 'solid', colors: ['#ffffff'] }))).png();
  const layers = [];

  // Zona del producto
  const topPad = hasText && lay !== 'text-bottom' ? 0.30 : 0.06;
  const botPad = (hasText && lay === 'text-bottom' ? 0.30 : 0.06) + (footer ? 0.07 : 0);
  const area = { x: Math.round(width * 0.07), y: Math.round(height * topPad), w: Math.round(width * 0.86), h: Math.round(height * (1 - topPad - botPad)) };
  let productInfo = null;
  if (productBuffer) {
    const p = await sharp(productBuffer).rotate().resize(area.w, area.h, { fit: 'inside', withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true });
    layers.push({ input: p.data, left: area.x + Math.round((area.w - p.info.width) / 2), top: area.y + Math.round((area.h - p.info.height) / 2) });
    productInfo = { w: p.info.width, h: p.info.height };
  }
  if (hasText || footer) layers.push({ input: textSvg(width, height, { headline, subline, footer, color: textColor || '#111111', font: font || 'sans-serif', layout: lay }) });
  if (logoBuffer) {
    const lw = Math.round(width * 0.2);
    const l = await sharp(logoBuffer).resize(lw, Math.round(height * 0.12), { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
    const left = Math.round(width * 0.04);
    const top = lay === 'text-bottom' || !hasText ? Math.round(height * 0.03) : Math.round(height * 0.03);
    layers.push({ input: l.data, left, top });
  }
  const buffer = await base.composite(layers).png().toBuffer();
  return { buffer, width, height, meta: { layout: lay, footer: footer || null, productScaledTo: productInfo, productModified: false } };
}


/**
 * Plantilla «Tarjeta Print Clean»: fondo celeste, logo redondo arriba, título, la FOTO REAL en una tarjeta con borde y sombra
 * (sin recortar ni alterar el producto) y banda azul con WhatsApp / Instagram abajo. Imita la línea visual de las imágenes terminadas de Print Clean.
 */
const FONT = "Inter, 'Segoe UI', Arial, Helvetica, sans-serif";
function wrapText(text, maxChars) { return wrap(text, maxChars); }
function roundedMask(w, h, r) { return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`); }

async function composeCard({ width: W, height: H, photoBuffer, logoBuffer, headline, subline, footerLines, palette, rotate = 0, zoom = 1, fx = 0.5, fy = 0.5, badgeTop, badgeMain, ribbon, compact = false, oldPrice }) {
  const navy = palette?.navy || '#023473', sky = palette?.sky || '#96dcfe';
  const m = Math.round(W * 0.045);
  const layers = [];
  // fondo con degradado y ondas suaves
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(sky)}"/><stop offset="0.55" stop-color="#d9f1fe"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <path d="M0 ${H * 0.2} C ${W * 0.3} ${H * 0.12}, ${W * 0.55} ${H * 0.3}, ${W} ${H * 0.2} L ${W} ${H * 0.45} C ${W * 0.6} ${H * 0.35}, ${W * 0.3} ${H * 0.52}, 0 ${H * 0.42} Z" fill="#ffffff" opacity="0.28"/>
    <path d="M0 ${H * 0.62} C ${W * 0.35} ${H * 0.52}, ${W * 0.6} ${H * 0.75}, ${W} ${H * 0.6} L ${W} ${H} L 0 ${H} Z" fill="#ffffff" opacity="0.35"/></svg>`;
  // cabecera: logo + título
  const logoSize = Math.round(W * (compact ? 0.15 : 0.2));
  let headerBottom = m;
  if (logoBuffer) {
    const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${logoSize}" height="${logoSize}"><circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`);
    const lg = await sharp(logoBuffer).resize(logoSize, logoSize, { fit: 'cover' }).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
    layers.push({ input: lg, left: m, top: m }); headerBottom = m + logoSize;
  }
  const tx = logoBuffer ? m + logoSize + Math.round(W * 0.04) : m, tw = W - m - tx;
  const fs1 = Math.round(W * (compact ? 0.056 : (logoBuffer ? 0.062 : 0.075))), fs2 = Math.round(fs1 * (compact ? 0.52 : 0.5));
  const l1 = wrapText(headline || '', Math.max(8, Math.floor(tw / (fs1 * 0.6)))).slice(0, 3);
  const l2 = wrapText(subline || '', Math.max(12, Math.floor(tw / (fs2 * 0.56)))).slice(0, 3);
  const blockH = l1.length * fs1 * 1.15 + (l2.length ? l2.length * fs2 * 1.3 + fs2 * 0.4 : 0);
  let ty = (logoBuffer ? m + logoSize / 2 - blockH / 2 : m) + fs1 * 0.95;
  let txt = '';
  for (const l of l1) { txt += `<text x="${tx}" y="${ty}" font-size="${fs1}" font-weight="800" fill="${esc(navy)}" font-family="${esc(FONT)}">${esc(l)}</text>`; ty += fs1 * 1.15; }
  ty += fs2 * 0.2;
  for (const l of l2) { txt += `<text x="${tx}" y="${ty}" font-size="${fs2}" font-weight="600" fill="${esc(navy)}" opacity="0.85" font-family="${esc(FONT)}">${esc(l)}</text>`; ty += fs2 * 1.3; }
  headerBottom = Math.max(headerBottom, ty);
  // banda inferior
  let bandTop = H - m;
  if (footerLines && footerLines.length) {
    let lines = footerLines.filter(Boolean);
    if (compact && lines.length === 3) lines = lines.slice(1);   // modo compacto: solo número + Instagram
    const bigIdx = lines.length >= 3 ? 1 : 0;
    const sizes = lines.map((_, i) => Math.round(W * (i === bigIdx ? 0.058 : 0.033)));
    const bh = Math.round(sizes.reduce((a, b) => a + b * 1.3, 0) + W * 0.05);
    const by = H - m - bh;
    let yy = by + W * 0.028; let t = '';
    lines.forEach((ln, i) => { yy += sizes[i] * 1.02; t += `<text x="${W / 2}" y="${yy}" font-size="${sizes[i]}" font-weight="${i === bigIdx ? 800 : 700}" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(ln)}</text>`; yy += sizes[i] * 0.28; });
    txt += `<rect x="${m}" y="${by}" width="${W - 2 * m}" height="${bh}" rx="${Math.round(W * 0.045)}" fill="${esc(navy)}"/>` + t;
    bandTop = by;
  }
  layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${txt}</svg>`), left: 0, top: 0 });
  // tarjeta de la foto real (sin recortar): se escala para caber y se redondean las esquinas
  const gap = Math.round(H * 0.022);
  const boxY = Math.round(headerBottom + gap), boxH = Math.round(bandTop - gap - boxY), boxW = Math.round(W - 2 * m * 1.6);
  const bord = Math.max(5, Math.round(W * 0.006));
  // Ajustes de encuadre que decide el usuario: girar (0/90/180/270) y acercar (1–2×) hacia un punto. No se altera el producto.
  let src = await sharp(photoBuffer).rotate().toBuffer();                       // respeta la orientación EXIF
  const rot = [90, 180, 270].includes(Number(rotate)) ? Number(rotate) : 0;
  if (rot) src = await sharp(src).rotate(rot).toBuffer();
  const z = Math.min(2, Math.max(1, Number(zoom) || 1));
  if (z > 1) {
    const m0 = await sharp(src).metadata(); const cw0 = Math.round(m0.width / z), ch0 = Math.round(m0.height / z);
    const left = Math.min(m0.width - cw0, Math.max(0, Math.round((Math.min(1, Math.max(0, Number(fx))) * m0.width) - cw0 / 2)));
    const top = Math.min(m0.height - ch0, Math.max(0, Math.round((Math.min(1, Math.max(0, Number(fy))) * m0.height) - ch0 / 2)));
    src = await sharp(src).extract({ left, top, width: cw0, height: ch0 }).toBuffer();
  }
  const ph = await sharp(src).resize(boxW - 2 * bord, boxH - 2 * bord, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const pw = ph.info.width, phh = ph.info.height, r = Math.round(W * 0.035);
  const rounded = await sharp(ph.data).composite([{ input: roundedMask(pw, phh, r), blend: 'dest-in' }]).png().toBuffer();
  const cw = pw + 2 * bord, chh = phh + 2 * bord, cx = Math.round((W - cw) / 2), cy = boxY + Math.round((boxH - chh) / 2);
  const shadow = await sharp({ create: { width: cw, height: chh, channels: 4, background: { r: 0, g: 20, b: 60, alpha: 0.38 } } }).composite([{ input: roundedMask(cw, chh, r + bord), blend: 'dest-in' }]).blur(Math.round(W * 0.012)).png().toBuffer();
  const frame = await sharp({ create: { width: cw, height: chh, channels: 4, background: '#ffffff' } }).composite([{ input: roundedMask(cw, chh, r + bord), blend: 'dest-in' }]).png().toBuffer();
  layers.push({ input: shadow, left: cx + Math.round(W * 0.006), top: cy + Math.round(W * 0.012) }, { input: frame, left: cx, top: cy }, { input: rounded, left: cx + bord, top: cy + bord });
  if (badgeMain) {
    const d = Math.round(W * 0.25), bxx = Math.round(W - m - d + W * 0.012), byy = Math.round(Math.min(bandTop - gap - d * 0.9, cy + chh - d * 0.6));
    const f1 = Math.round(d * 0.17), f2 = Math.round(d * Math.min(0.27, 1.25 / String(badgeMain).length));
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 4}" fill="${esc(navy)}" stroke="#ffffff" stroke-width="8"/>${badgeTop ? `<text x="${d / 2}" y="${d * 0.36}" font-size="${f1}" font-weight="700" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(badgeTop)}</text>` : ''}<text x="${d / 2}" y="${badgeTop ? d * 0.64 : d * 0.57}" font-size="${f2}" font-weight="800" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(badgeMain)}</text></svg>`), left: bxx, top: byy });
  }
  if (badgeMain && oldPrice) {   // «Antes $X» tachado, justo encima del medallón de precio
    const d = Math.round(W * 0.25), bxx = Math.round(W - m - d + W * 0.012), byy = Math.round(Math.min(bandTop - gap - d * 0.9, cy + chh - d * 0.6));
    const fs = Math.round(d * 0.15), txtW = Math.round(String(`Antes ${oldPrice}`).length * fs * 0.56), pw2 = txtW + Math.round(fs * 1.4), ph2 = Math.round(fs * 1.9);
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw2}" height="${ph2}"><rect width="${pw2}" height="${ph2}" rx="${ph2 / 2}" fill="#ffffff" opacity="0.96"/><text x="${pw2 / 2}" y="${ph2 * 0.67}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="#4b5563" font-family="${esc(FONT)}">${esc('Antes ' + oldPrice)}</text><line x1="${fs * 0.6}" y1="${ph2 * 0.52}" x2="${pw2 - fs * 0.6}" y2="${ph2 * 0.52}" stroke="#e11d2e" stroke-width="${Math.max(3, Math.round(fs * 0.13))}"/></svg>`), left: Math.min(Math.round(bxx + d / 2 - pw2 / 2), W - Math.round(m * 0.9) - pw2), top: Math.max(0, byy - ph2 - Math.round(W * 0.012)) });
  }
  if (ribbon) {   // cinta de oferta sobre la esquina superior izquierda de la tarjeta
    const rw = Math.round(W * 0.34), rh = Math.round(W * 0.085), rf = Math.round(rh * 0.5);
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${rw}" height="${rh}"><rect width="${rw}" height="${rh}" rx="${rh / 2}" fill="#e11d2e"/><text x="${rw / 2}" y="${rh * 0.68}" font-size="${rf}" font-weight="800" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(ribbon)}</text></svg>`), left: cx + Math.round(W * 0.02), top: cy + Math.round(W * 0.02) });
  }
  const buffer = await sharp(Buffer.from(bg)).composite(layers).png().toBuffer();
  return { buffer, width: W, height: H, meta: { layout: 'card', productScaledTo: { w: pw, h: phh }, productModified: false, rotate: rot, zoom: z, cropped: z > 1 } };
}

/**
 * Estilo «Producto recortado» (como las imágenes terminadas de Print Clean): logo, título, el producto YA RECORTADO (PNG con transparencia)
 * grande y con sombra, medallón de precio y banda inferior con WhatsApp / Instagram. No inventa nada: solo coloca lo que se le entrega.
 */
async function alphaBBox(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 > x0 ? { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null;
}
async function composeCutout({ width: W, height: H, cutoutBuffer, logoBuffer, headline, subline, badgeTop, badgeMain, footerLines, palette, scale = 1 }) {
  const navy = palette?.navy || '#023473', sky = palette?.sky || '#96dcfe';
  const m = Math.round(W * 0.045); const layers = [];
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(sky)}"/><stop offset="0.6" stop-color="#d9f1fe"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <path d="M0 ${H * 0.22} C ${W * 0.3} ${H * 0.14}, ${W * 0.55} ${H * 0.32}, ${W} ${H * 0.22} L ${W} ${H * 0.5} C ${W * 0.6} ${H * 0.4}, ${W * 0.3} ${H * 0.57}, 0 ${H * 0.47} Z" fill="#ffffff" opacity="0.3"/>
    <path d="M0 ${H * 0.66} C ${W * 0.35} ${H * 0.56}, ${W * 0.6} ${H * 0.78}, ${W} ${H * 0.64} L ${W} ${H} L 0 ${H} Z" fill="#ffffff" opacity="0.4"/></svg>`;
  // cabecera
  const logoSize = Math.round(W * 0.19); let headerBottom = m;
  if (logoBuffer) {
    const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${logoSize}" height="${logoSize}"><circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`);
    layers.push({ input: await sharp(logoBuffer).resize(logoSize, logoSize, { fit: 'cover' }).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer(), left: m, top: m }); headerBottom = m + logoSize;
  }
  const tx = logoBuffer ? m + logoSize + Math.round(W * 0.035) : m, tw = W - m - tx;
  const fs1 = Math.round(W * 0.075), fs2 = Math.round(W * 0.03);
  const l1 = wrap(headline || '', Math.max(8, Math.floor(tw / (fs1 * 0.58)))).slice(0, 3), l2 = wrap(subline || '', Math.max(14, Math.floor(tw / (fs2 * 0.55)))).slice(0, 3);
  const blockH = l1.length * fs1 * 1.12 + (l2.length ? l2.length * fs2 * 1.3 + fs2 * 0.5 : 0);
  let ty = Math.max(m + fs1 * 0.92, (logoBuffer ? m + logoSize / 2 - blockH / 2 : m) + fs1 * 0.92), txt = '';
  for (const l of l1) { txt += `<text x="${tx}" y="${ty}" font-size="${fs1}" font-weight="800" fill="${esc(navy)}" font-family="${esc(FONT)}">${esc(l)}</text>`; ty += fs1 * 1.12; }
  ty += fs2 * 0.3;
  for (const l of l2) { txt += `<text x="${tx}" y="${ty}" font-size="${fs2}" font-weight="600" fill="${esc(navy)}" opacity="0.88" font-family="${esc(FONT)}">${esc(l)}</text>`; ty += fs2 * 1.3; }
  headerBottom = Math.max(headerBottom, ty);
  // banda inferior
  let bandTop = H - m;
  const lines = (footerLines || []).filter(Boolean);
  if (lines.length) {
    const sizes = lines.map((_, i) => Math.round(W * (i === 1 ? 0.058 : 0.033))); const bh = Math.round(sizes.reduce((a, b) => a + b * 1.3, 0) + W * 0.05), by = H - m - bh;
    let yy = by + W * 0.028, t = '';
    lines.forEach((ln, i) => { yy += sizes[i] * 1.02; t += `<text x="${W / 2}" y="${yy}" font-size="${sizes[i]}" font-weight="${i === 1 ? 800 : 700}" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(ln)}</text>`; yy += sizes[i] * 0.28; });
    txt += `<rect x="${m}" y="${by}" width="${W - 2 * m}" height="${bh}" rx="${Math.round(W * 0.045)}" fill="${esc(navy)}"/>` + t; bandTop = by;
  }
  // producto recortado: se recorta a su caja real, se escala para caber y se le pone sombra
  const box = await alphaBBox(cutoutBuffer);
  const prod = box ? await sharp(cutoutBuffer).extract(box).toBuffer() : cutoutBuffer;
  const gap = Math.round(H * 0.02), boxY = Math.round(headerBottom + gap), boxH = Math.round(bandTop - gap - boxY), boxW = Math.round(W - 2 * m);
  const pr = await sharp(prod).resize(Math.round(boxW * scale), Math.round(boxH * scale), { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const pw = pr.info.width, ph = pr.info.height, px = Math.round((W - pw) / 2), py = boxY + Math.round((boxH - ph) / 2);
  // sombra: misma silueta del producto (canal alfa), azul oscuro, desenfocada y semitransparente
  const alpha = await sharp(pr.data).ensureAlpha().extractChannel(3).raw().toBuffer();
  const sh = await sharp({ create: { width: pw, height: ph, channels: 3, background: { r: 0, g: 25, b: 70 } } }).joinChannel(alpha, { raw: { width: pw, height: ph, channels: 1 } }).png().toBuffer();
  const pad = Math.round(W * 0.04);
  const shadow = await sharp(sh).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 25, b: 70, alpha: 0 } }).blur(Math.max(8, Math.round(W * 0.016))).linear([1, 1, 1, 0.42], [0, 0, 0, 0]).png().toBuffer();
  layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${txt}</svg>`), left: 0, top: 0 });
  layers.push({ input: shadow, left: px - pad + Math.round(W * 0.008), top: py - pad + Math.round(W * 0.022) }, { input: pr.data, left: px, top: py });
  // medallón de precio / dato destacado (solo si se entrega)
  if (badgeMain) {
    const d = Math.round(W * 0.25), bx = W - m - d + Math.round(W * 0.012), by2 = Math.round(Math.min(bandTop - gap - d * 0.92, py + ph - d * 0.5));
    const f1 = Math.round(d * 0.17), f2 = Math.round(d * Math.min(0.27, 1.25 / String(badgeMain).length));
    const circ = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 4}" fill="${esc(navy)}" stroke="#ffffff" stroke-width="8"/>
      ${badgeTop ? `<text x="${d / 2}" y="${d * 0.36}" font-size="${f1}" font-weight="700" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(badgeTop)}</text>` : ''}
      <text x="${d / 2}" y="${badgeTop ? d * 0.64 : d * 0.57}" font-size="${f2}" font-weight="800" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(badgeMain)}</text></svg>`;
    layers.push({ input: Buffer.from(circ), left: Math.round(bx), top: by2 });
  }
  const buffer = await sharp(Buffer.from(bg)).composite(layers).png().toBuffer();
  return { buffer, width: W, height: H, meta: { layout: 'cutout', productModified: false, background_removed: true } };
}

module.exports = {
  id: 'local-compose', label: 'Composición local (sharp)', category: 'Imágenes', paid: false,
  status: () => ({ configured: true, note: 'Siempre disponible. Procesamiento local, sin costo.' }),
  info: { cost: 'Gratis (procesa en su servidor)', limits: 'Sin límites externos. No genera imágenes nuevas ni quita fondos: conserva la foto original del producto.', docs: 'https://sharp.pixelplumbing.com/' },
  compose, composeCard, composeCutout,
};
