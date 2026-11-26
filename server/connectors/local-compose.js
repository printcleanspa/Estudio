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

module.exports = {
  id: 'local-compose', label: 'Composición local (sharp)', category: 'Imágenes', paid: false,
  status: () => ({ configured: true, note: 'Siempre disponible. Procesamiento local, sin costo.' }),
  info: { cost: 'Gratis (procesa en su servidor)', limits: 'Sin límites externos. No genera imágenes nuevas ni quita fondos: conserva la foto original del producto.', docs: 'https://sharp.pixelplumbing.com/' },
  compose,
};
