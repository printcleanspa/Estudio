'use strict';
/**
 * Conector STABLE DIFFUSION WEBUI (gratuito, local, código abierto): compatible con la API de AUTOMATIC1111 / Forge / SD.Next
 * (inicie el WebUI con la opción --api). Endpoints: /sdapi/v1/txt2img, /sdapi/v1/img2img, /sdapi/v1/sd-models.
 * Requiere que usted instale el WebUI y un modelo; revise la licencia de cada modelo antes de uso comercial.
 */
const sharp = require('sharp');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const urlOf = (env) => (env.SD_WEBUI_URL || '').trim().replace(/\/$/, '');

async function request(env, path, body, timeout = 600000) {
  const base = urlOf(env);
  if (!base) throw httpErr(400, 'Stable Diffusion WebUI no está configurado (variable SD_WEBUI_URL).');
  let res;
  try { res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) }); }
  catch (e) { throw httpErr(e.name === 'TimeoutError' ? 504 : 503, e.name === 'TimeoutError' ? 'Stable Diffusion tardó demasiado.' : `No se pudo conectar con Stable Diffusion WebUI en ${base}. ¿Está iniciado con --api?`); }
  const text = await res.text();
  if (!res.ok) throw httpErr(502, `Stable Diffusion WebUI respondió ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function fitSize(w, h, maxSide) {
  const k = maxSide / Math.max(w, h);
  const r8 = (n) => Math.max(64, Math.round((n * k) / 8) * 8);
  return { w: r8(w), h: r8(h) };
}
async function finish(data, width, height) {
  const b64 = data?.images?.[0];
  if (!b64) throw httpErr(502, 'Stable Diffusion no devolvió imagen.');
  return { buffer: await sharp(Buffer.from(b64, 'base64')).resize(width, height, { fit: 'cover' }).png().toBuffer(), width, height };
}
const maxSide = (env) => Number(env.SD_WEBUI_MAX_SIDE) || 768;

async function txt2img({ env = process.env, prompt, negative, width, height }) {
  const s = fitSize(width, height, maxSide(env));
  return finish(await request(env, '/sdapi/v1/txt2img', { prompt, negative_prompt: negative || '', width: s.w, height: s.h, steps: 25 }), width, height);
}
async function img2img({ env = process.env, prompt, negative, width, height, imageBuffer, strength = 0.45 }) {
  const s = fitSize(width, height, maxSide(env));
  const init = await sharp(imageBuffer).rotate().resize(s.w, s.h, { fit: 'cover' }).png().toBuffer();
  return finish(await request(env, '/sdapi/v1/img2img', { init_images: [init.toString('base64')], prompt, negative_prompt: negative || '', width: s.w, height: s.h, steps: 25, denoising_strength: strength }), width, height);
}

module.exports = {
  id: 'sd-webui', label: 'Stable Diffusion WebUI (local)', category: 'IA local', paid: false, capabilities: ['image.txt2img', 'image.img2img'],
  async status(env) {
    if (!urlOf(env)) return { configured: false, note: 'Opcional. Para activarlo defina SD_WEBUI_URL (ej. http://127.0.0.1:7860) con el WebUI iniciado con --api.' };
    try { const m = await request(env, '/sdapi/v1/sd-models', null, 8000); return { configured: true, note: `Conectado a ${urlOf(env)}. ${Array.isArray(m) ? m.length : 0} modelo(s) de imagen.` }; }
    catch (e) { return { configured: false, note: e.message }; }
  },
  info: { cost: 'Gratis (software libre). Requiere una GPU decente para velocidad razonable.', limits: 'Los define su hardware. Licencia según el modelo que use.', docs: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui' },
  txt2img, img2img,
};
