'use strict';
/**
 * Registro de conectores. Cada conector es independiente y expone:
 *   id, label, category, paid, status(env) -> {configured, note}, info (costos/límites/enlaces)
 * Para cambiar de proveedor basta con registrar otro conector de la misma categoría.
 * Regla: nunca se simula una conexión; si falta la clave, el estado es "no configurado".
 */
const local = require('./local-compose');
const openai = require('./openai-images');

const registry = [local, openai];

function list(env = process.env) {
  return registry.map((c) => ({ id: c.id, label: c.label, category: c.category, paid: c.paid, ...c.status(env), info: c.info }));
}
const get = (id) => registry.find((c) => c.id === id);

// Conectores previstos para fases siguientes (no implementados; se muestran como tales, sin simular).
const planned = [
  { id: 'ffmpeg', label: 'FFmpeg (montaje de video local)', category: 'Edición audiovisual', phase: 2, note: 'Procesamiento local, sin costo por uso.' },
  { id: 'video-gen', label: 'Generación de video por API (Runway u otro)', category: 'Video', phase: 2, note: 'Requiere evaluar API, precios y límites vigentes antes de integrar.' },
  { id: 'openai-audio', label: 'OpenAI Audio (voz/transcripción)', category: 'Voz y audio', phase: 3, note: 'De pago por uso. Pendiente de verificación de precios.' },
  { id: 'music', label: 'Música IA con licencia comercial', category: 'Música', phase: 3, note: 'Proveedor por elegir; exige verificar licencia comercial.' },
  { id: 'gdrive', label: 'Google Drive (almacenamiento)', category: 'Almacenamiento', phase: 5, note: 'Requiere OAuth de Google.' },
  { id: 'instagram', label: 'Instagram Graph API', category: 'Redes', phase: 4, note: 'Requiere cuenta profesional, app de Meta y revisión de permisos.' },
  { id: 'google-ads', label: 'Google Ads API', category: 'Publicidad', phase: 4, note: 'Requiere developer token y aprobación de Google.' },
  { id: 'youtube', label: 'YouTube Data API', category: 'Redes', phase: 4, note: 'Requiere proyecto en Google Cloud y cuota.' },
];
module.exports = { list, get, planned };
