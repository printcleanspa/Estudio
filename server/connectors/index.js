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

const registry = [local, ollama, sdWebui];

async function list(env = process.env) {
  return Promise.all(registry.map(async (c) => ({ id: c.id, label: c.label, category: c.category, paid: c.paid, capabilities: c.capabilities, ...(await c.status(env)), info: c.info })));
}
const get = (id) => registry.find((c) => c.id === id);

// Conectores previstos (aún no integrados). Todos gratuitos/abiertos; los detalles de licencia deben verificarse al integrarlos.
const planned = [
  { id: 'ffmpeg', label: 'FFmpeg (montaje de video local)', category: 'Edición audiovisual', phase: 2, note: 'Software libre, sin costo por uso.' },
  { id: 'whisper', label: 'Whisper (subtítulos desde audio, local)', category: 'Voz y audio', phase: 2, note: 'Modelos abiertos; funciona en su equipo.' },
  { id: 'video-local', label: 'Video generado con modelos abiertos locales', category: 'Video', phase: 2, note: 'Exigen GPU potente y revisar la licencia de cada modelo. A evaluar.' },
  { id: 'tts-local', label: 'Texto a voz local (ej. Piper)', category: 'Voz y audio', phase: 3, note: 'Verificar licencia de la voz y del motor antes de uso comercial.' },
  { id: 'music-local', label: 'Música: biblioteca libre de derechos / modelos abiertos', category: 'Música', phase: 3, note: 'Verificar licencia comercial de cada pista o modelo. Algunos modelos abiertos prohíben uso comercial.' },
  { id: 'comfyui', label: 'ComfyUI (flujos de imagen locales)', category: 'IA local', phase: 2, note: 'Alternativa gratuita a Stable Diffusion WebUI.' },
  { id: 'gdrive', label: 'Google Drive (almacenamiento)', category: 'Almacenamiento', phase: 5, note: 'API gratuita; requiere OAuth de Google.' },
  { id: 'instagram', label: 'Instagram Graph API', category: 'Redes', phase: 4, note: 'API gratuita; requiere cuenta profesional y revisión de permisos de Meta.' },
  { id: 'google-ads', label: 'Google Ads API', category: 'Publicidad', phase: 4, note: 'La API es gratuita (la publicidad se paga aparte); requiere developer token aprobado.' },
];
module.exports = { list, get, planned };
