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

async function composeCard({ width: W, height: H, photoBuffer, logoBuffer, headline, subline, footerLines, palette, rotate = 0, zoom = 1, fx = 0.5, fy = 0.5 }) {
  const navy = palette?.navy || '#023473', sky = palette?.sky || '#96dcfe';
  const m = Math.round(W * 0.045);
  const layers = [];
  // fondo con degradado y ondas suaves
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(sky)}"/><stop offset="0.55" stop-color="#d9f1fe"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <path d="M0 ${H * 0.2} C ${W * 0.3} ${H * 0.12}, ${W * 0.55} ${H * 0.3}, ${W} ${H * 0.2} L ${W} ${H * 0.45} C ${W * 0.6} ${H * 0.35}, ${W * 0.3} ${H * 0.52}, 0 ${H * 0.42} Z" fill="#ffffff" opacity="0.28"/>
    <path d="M0 ${H * 0.62} C ${W * 0.35} ${H * 0.52}, ${W * 0.6} ${H * 0.75}, ${W} ${H * 0.6} L ${W} ${H} L 0 ${H} Z" fill="#ffffff" opacity="0.35"/></svg>`;
  // cabecera: logo + título
  const logoSize = Math.round(W * 0.2);
  let headerBottom = m;
  if (logoBuffer) {
    const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${logoSize}" height="${logoSize}"><circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`);
    const lg = await sharp(logoBuffer).resize(logoSize, logoSize, { fit: 'cover' }).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
    layers.push({ input: lg, left: m, top: m }); headerBottom = m + logoSize;
  }
  const tx = logoBuffer ? m + logoSize + Math.round(W * 0.04) : m, tw = W - m - tx;
  const fs1 = Math.round(W * (logoBuffer ? 0.062 : 0.075)), fs2 = Math.round(fs1 * 0.5);
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
    const lines = footerLines.filter(Boolean);
    const sizes = lines.map((_, i) => Math.round(W * (i === 1 ? 0.058 : 0.033)));
    const bh = Math.round(sizes.reduce((a, b) => a + b * 1.3, 0) + W * 0.05);
    const by = H - m - bh;
    let yy = by + W * 0.028; let t = '';
    lines.forEach((ln, i) => { yy += sizes[i] * 1.02; t += `<text x="${W / 2}" y="${yy}" font-size="${sizes[i]}" font-weight="${i === 1 ? 800 : 700}" text-anchor="middle" fill="#fff" font-family="${esc(FONT)}">${esc(ln)}</text>`; yy += sizes[i] * 0.28; });
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
  const buffer = await sharp(Buffer.from(bg)).composite(layers).png().toBuffer();
  return { buffer, width: W, height: H, meta: { layout: 'card', productScaledTo: { w: pw, h: phh }, productModified: false, rotate: rot, zoom: z, cropped: z > 1 } };
}

module.exports = {
  id: 'local-compose', label: 'Composición local (sharp)', category: 'Imágenes', paid: false,
  status: () => ({ configured: true, note: 'Siempre disponible. Procesamiento local, sin costo.' }),
  info: { cost: 'Gratis (procesa en su servidor)', limits: 'Sin límites externos. No genera imágenes nuevas ni quita fondos: conserva la foto original del producto.', docs: 'https://sharp.pixelplumbing.com/' },
  compose, composeCard,
};
