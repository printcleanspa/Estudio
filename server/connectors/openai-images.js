'use strict';
/**
 * Conector OpenAI Images (DE PAGO por uso). Llamadas reales a la API de OpenAI.
 * - Sin OPENAI_API_KEY queda "no configurado": no se simula nada.
 * - El costo por imagen NO se inventa: se usa OPENAI_IMAGE_COST_USD si el usuario lo configura.
 * - OPENAI_BASE_URL permite apuntar a un servidor de pruebas (usado en los tests automatizados).
 */
const sharp = require('sharp');

const base = (env) => (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const model = (env) => env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

function pickSize(w, h) {
  const r = w / h;
  if (r > 1.2) return '1536x1024';
  if (r < 0.83) return '1024x1536';
  return '1024x1024';
}
function estimate(env) {
  const c = Number(env.OPENAI_IMAGE_COST_USD);
  return Number.isFinite(c) && c > 0 ? c : null;
}

async function call(env, path, init) {
  const res = await fetch(base(env) + path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${env.OPENAI_API_KEY}` } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const e = new Error(`OpenAI respondió ${res.status}: ${data?.error?.message || data.raw || 'error desconocido'}`);
    e.status = 502; throw e;
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) { const e = new Error('OpenAI no devolvió una imagen (b64_json).'); e.status = 502; throw e; }
  return Buffer.from(b64, 'base64');
}

async function fitTo(buf, width, height) {
  return sharp(buf).resize(width, height, { fit: 'cover' }).png().toBuffer();
}

async function textToImage({ prompt, width, height, env = process.env }) {
  const raw = await call(env, '/images/generations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model(env), prompt, size: pickSize(width, height), n: 1 }),
  });
  return { buffer: await fitTo(raw, width, height), width, height };
}

async function editImage({ prompt, width, height, imageBuffer, env = process.env }) {
  const png = await sharp(imageBuffer).rotate().resize(1024, 1024, { fit: 'inside' }).png().toBuffer();
  const form = new FormData();
  form.append('model', model(env));
  form.append('prompt', prompt);
  form.append('size', pickSize(width, height));
  form.append('image', new Blob([png], { type: 'image/png' }), 'source.png');
  const raw = await call(env, '/images/edits', { method: 'POST', body: form });
  return { buffer: await fitTo(raw, width, height), width, height };
}

module.exports = {
  id: 'openai-images', label: 'OpenAI Images (gpt-image-1)', category: 'Imágenes', paid: true,
  status: (env) => env.OPENAI_API_KEY
    ? { configured: true, note: estimate(env) ? `Clave detectada. Costo estimado por imagen configurado: US$ ${estimate(env)}.` : 'Clave detectada. Costo por imagen NO configurado (OPENAI_IMAGE_COST_USD): el consumo se registra sin cifra.' }
    : { configured: false, note: 'Falta OPENAI_API_KEY en el servidor. Servicio de pago por uso.' },
  info: { cost: 'De pago por uso (la API se factura aparte de ChatGPT). Verifique el precio vigente en openai.com/api/pricing.', limits: 'Límites según el nivel de su cuenta de API; podría requerir verificación de organización para este modelo.', docs: 'https://platform.openai.com/docs/guides/image-generation' },
  estimate, textToImage, editImage,
};
