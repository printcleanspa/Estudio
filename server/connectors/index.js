'use strict';
/**
 * Registro de conectores. Cada conector es independiente y expone:
 *   id, label, category, paid, capabilities, status(env) (puede ser async), info {cost, limits, docs}
 * Para agregar otro motor gratuito (ComfyUI, otro servidor compatible…) se crea un módulo con esta forma
 * y se agrega a `registry`; la interfaz lo muestra sola.
 * POLÍTICA: no se incluyen conectores de pago. Un conector de pago solo puede agregarse con autorización expresa del usuario.
 * Regla: nunca se simula una conexión; si el motor no responde, el estado es "no disponible".
 */
const local = require('./local-compose');
const ollama = require('./ollama');
const sdWebui = require('./sd-webui');
const ffmpeg = require('./ffmpeg');
const piper = require('./piper');

const registry = [local, ollama, sdWebui, ffmpeg, piper];

async function list(env = process.env) {
  return Promise.all(registry.map(async (c) => ({ id: c.id, label: c.label, category: c.category, paid: c.paid, capabilities: c.capabilities, ...(await c.status(env)), info: c.info })));
}
const get = (id) => registry.find((c) => c.id === id);

// Conectores previstos (aún no integrados). Publicar en Instagram/Google y guardar en Drive NO se hace desde Estudio: lo hace el panel de Michael en Cowork. Todos gratuitos/abiertos; los detalles de licencia deben verificarse al integrarlos.
const planned = [
  { id: 'whisper', label: 'Whisper (subtítulos automáticos desde audio, local)', category: 'Voz y audio', phase: 6, note: 'Modelos abiertos; hoy los subtítulos se escriben por escena.' },
  { id: 'video-local', label: 'Video generado con modelos abiertos locales', category: 'Video', phase: 6, note: 'Exigen GPU potente y revisar la licencia de cada modelo. A evaluar.' },
  { id: 'music-local', label: 'Música: biblioteca libre de derechos / modelos abiertos', category: 'Música', phase: 6, note: 'Hoy: suba pistas con licencia comercial. Generar música con IA queda pendiente: muchos modelos abiertos prohíben el uso comercial.' },
  { id: 'comfyui', label: 'ComfyUI (flujos de imagen locales)', category: 'IA local', phase: 6, note: 'Alternativa gratuita a Stable Diffusion WebUI.' },
];
module.exports = { list, get, planned };
