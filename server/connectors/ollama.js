'use strict';
/**
 * Conector OLLAMA (gratuito, local, código abierto). https://ollama.com
 *  - Texto y visión: API estable (/api/chat). Funciona con los modelos que usted instale (`ollama pull <modelo>`).
 *  - Imagen: función EXPERIMENTAL de Ollama (/api/generate con un modelo de imagen). Según la documentación de Ollama
 *    (enero 2026) nació en macOS; Windows/Linux estaban "próximamente". Puede cambiar. Se ofrece como opción, nunca como requisito.
 * Sin Ollama en ejecución el conector queda "no disponible": no se simula nada.
 * Los modelos pueden tener licencias distintas (algunas no permiten uso comercial): revise la ficha de cada modelo.
 */
const sharp = require('sharp');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const hostOf = (env) => {
  let h = (env.OLLAMA_HOST || 'http://127.0.0.1:11434').trim().replace(/\/$/, '');
  if (!/^https?:\/\//.test(h)) h = `http://${h}`;
  return h;
};

async function request(env, path, { body, timeout = 20000 } = {}) {
  let res;
  try {
    res = await fetch(hostOf(env) + path, {
      method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw httpErr(504, 'Ollama tardó demasiado en responder. Un modelo grande puede necesitar más tiempo o más memoria.');
    throw httpErr(503, `No se pudo conectar con Ollama en ${hostOf(env)}. Instálelo desde ollama.com e inícielo (ollama serve).`);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300); try { msg = JSON.parse(text).error || msg; } catch { /* texto plano */ }
    throw httpErr(/not found/i.test(msg) ? 400 : 502, `Ollama: ${msg}`);
  }
  return text;
}

async function models(env = process.env) {
  const data = JSON.parse(await request(env, '/api/tags'));
  return (data.models || []).map((m) => ({ name: m.name, size: m.size ?? null }));
}

/** Conversación de texto o visión. images: array de Buffers (solo modelos con visión). */
async function chat({ env = process.env, model, system, prompt, images = [], format }) {
  if (!model) throw httpErr(400, 'Elija un modelo de Ollama.');
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt, ...(images.length ? { images: images.map((b) => b.toString('base64')) } : {}) });
  const data = JSON.parse(await request(env, '/api/chat', { body: { model, messages, stream: false, ...(format ? { format } : {}), options: { temperature: 0.6 } }, timeout: 180000 }));
  const content = data?.message?.content;
  if (typeof content !== 'string') throw httpErr(502, 'Ollama no devolvió texto.');
  return content;
}

function fitSize(w, h, maxSide) {
  const k = maxSide / Math.max(w, h);
  const r8 = (n) => Math.max(64, Math.round((n * k) / 8) * 8);
  return { w: r8(w), h: r8(h) };
}

/** EXPERIMENTAL: imagen con un modelo de imagen de Ollama. Respuesta NDJSON; la imagen llega en la última línea (campo `image`). */
async function generateImage({ env = process.env, model, prompt, width, height }) {
  if (!model) throw httpErr(400, 'Elija un modelo de imagen de Ollama.');
  const s = fitSize(width, height, Number(env.OLLAMA_IMAGE_MAX_SIDE) || 1024);
  const text = await request(env, '/api/generate', { body: { model, prompt, stream: false, width: s.w, height: s.h }, timeout: 600000 });
  let b64 = null;
  for (const line of text.trim().split('\n').reverse()) {
    try { const o = JSON.parse(line); b64 = o.image || (Array.isArray(o.images) && o.images[0]) || null; if (b64) break; } catch { /* línea parcial */ }
  }
  if (!b64) throw httpErr(502, 'El modelo no devolvió una imagen. Verifique que sea un modelo de IMAGEN y que su versión de Ollama y su sistema lo soporten (función experimental).');
  const buffer = await sharp(Buffer.from(b64, 'base64')).resize(width, height, { fit: 'cover' }).png().toBuffer();
  return { buffer, width, height };
}

module.exports = {
  id: 'ollama', label: 'Ollama (modelos locales)', category: 'IA local', paid: false, capabilities: ['text', 'vision', 'image (experimental)'],
  async status(env) {
    try {
      const m = await models(env);
      return { configured: true, host: hostOf(env), models: m, note: m.length ? `Conectado a ${hostOf(env)}. ${m.length} modelo(s) instalado(s).` : `Conectado a ${hostOf(env)}, pero no hay modelos instalados. Ejecute: ollama pull <modelo>` };
    } catch (e) { return { configured: false, host: hostOf(env), models: [], note: e.message }; }
  },
  info: { cost: 'Gratis. Se ejecuta en su propio equipo (usa su CPU/GPU/memoria).', limits: 'Los define su hardware. La imagen es experimental en Ollama. Cada modelo tiene su propia licencia.', docs: 'https://ollama.com' },
  models, chat, generateImage,
};
