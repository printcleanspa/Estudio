'use strict';
/**
 * Avisos de Estudio hacia n8n (webhook saliente). Opcional: sin N8N_WEBHOOK_URL no hace nada.
 * - Nunca bloquea ni rompe la operación principal (timeout corto, errores solo al registro).
 * - Solo envía datos de texto (evento, marca, nombre del archivo, formato). Nunca imágenes, claves ni contraseñas.
 */
async function notify(env, event, data = {}) {
  const url = (env.N8N_WEBHOOK_URL || '').trim();
  if (!url) return { sent: false };
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ app: 'estudio-creativo-ia', event, at: new Date().toISOString(), base_url: env.PUBLIC_BASE_URL || null, ...data }),
    });
    if (!res.ok) throw new Error(`n8n respondió ${res.status}`);
    return { sent: true };
  } catch (e) {
    console.error(`[n8n] no se pudo avisar (${event}): ${e.message}`);
    return { sent: false, error: e.message };
  }
}
module.exports = { notify };
