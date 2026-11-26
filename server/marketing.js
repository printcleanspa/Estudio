'use strict';
/**
 * Módulo de marketing con IA LOCAL (Ollama, gratis). Genera textos para Instagram y Google, guiones de Reel y calendarios.
 * Reglas aplicadas por código (no solo por la IA): descarta opciones con palabras prohibidas de la marca, con cifras que
 * el usuario no entregó, o que superan los límites de la plataforma. Estudio NO publica nada: solo entrega textos para revisar.
 */
const connectors = require('./connectors');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const LIMITS = { igCaption: 2200, igHashtags: 30, adTitle: 30, adDescription: 90 }; // límites de Instagram y de anuncios de Google (responsive search ads)

const SYSTEM = `Eres redactor publicitario. Escribes en español neutro, claro, cercano y directo.
REGLAS ESTRICTAS:
- Usa SOLO la información entregada (datos de la empresa, notas del usuario y la audiencia indicada).
- NO inventes precios, descuentos, porcentajes, cifras, plazos, stock, características técnicas, marcas ni promesas.
- Si faltan datos, escribe textos genéricos y honestos, sin números.
- Respeta las reglas de redacción de la empresa indicadas en los datos (palabras prohibidas y notas).
- Responde únicamente con el JSON pedido.`;

const str = { type: 'string' };
const KINDS = {
  captions: {
    label: 'Textos para publicación (Instagram)', count: 3,
    schema: { type: 'object', properties: { opciones: { type: 'array', items: { type: 'object', properties: { texto: str, hashtags: { type: 'array', items: str }, llamado_a_la_accion: str }, required: ['texto', 'hashtags', 'llamado_a_la_accion'] } } }, required: ['opciones'] },
    ask: 'Escribe 3 textos distintos para una publicación de Instagram (cada uno con 5 a 8 hashtags y un llamado a la acción corto).',
  },
  reel_script: {
    label: 'Guion de Reel', count: 1,
    schema: { type: 'object', properties: { titulo: str, escenas: { type: 'array', items: { type: 'object', properties: { texto_en_pantalla: str, locucion: str, segundos: { type: 'number' } }, required: ['texto_en_pantalla', 'locucion', 'segundos'] } } }, required: ['titulo', 'escenas'] },
    ask: 'Escribe un guion de Reel de 4 a 6 escenas. Cada escena: texto corto en pantalla (máx. 8 palabras), locución (1 frase) y segundos (entre 2 y 6).',
  },
  calendar: {
    label: 'Calendario semanal de contenido', count: 1,
    schema: { type: 'object', properties: { dias: { type: 'array', items: { type: 'object', properties: { dia: str, formato: str, idea: str, texto: str }, required: ['dia', 'formato', 'idea', 'texto'] } } }, required: ['dias'] },
    ask: 'Arma un calendario de lunes a viernes (5 entradas). En cada día: dia, formato (Post, Carrusel, Historia o Reel), idea y un texto breve listo para publicar.',
  },
  ad_variants: {
    label: 'Variantes de anuncio (Google / Meta)', count: 3,
    schema: { type: 'object', properties: { variantes: { type: 'array', items: { type: 'object', properties: { titulo: str, descripcion: str, cta: str }, required: ['titulo', 'descripcion', 'cta'] } } }, required: ['variantes'] },
    ask: `Escribe 4 variantes de anuncio. Título de MÁXIMO ${LIMITS.adTitle} caracteres, descripción de MÁXIMO ${LIMITS.adDescription} caracteres y un llamado a la acción corto.`,
  },
  campaign_ideas: {
    label: 'Ideas de campaña', count: 3,
    schema: { type: 'object', properties: { ideas: { type: 'array', items: { type: 'object', properties: { nombre: str, objetivo: str, publico: str, mensaje: str }, required: ['nombre', 'objetivo', 'publico', 'mensaje'] } } }, required: ['ideas'] },
    ask: 'Propón 3 ideas de campaña. Cada una: nombre, objetivo, público y mensaje principal.',
  },
};

const { makeGuard } = require('./guard');
function leaves(v, out = []) { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => leaves(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out)); return out; }

function clean(kind, data, chk) {
  let discarded = 0;
  const okText = (v) => leaves(v).every((t) => !chk.hasBanned(t) && !chk.inventedNumber(t));
  const cap = (s, n) => String(s ?? '').trim().slice(0, n);
  if (kind === 'captions') {
    const items = [];
    for (const o of data.opciones || []) {
      const it = { texto: cap(o.texto, LIMITS.igCaption), hashtags: (o.hashtags || []).map((h) => `#${String(h).replace(/^#+/, '').replace(/\s+/g, '')}`).filter((h) => h.length > 1).slice(0, LIMITS.igHashtags), llamado_a_la_accion: cap(o.llamado_a_la_accion, 120) };
      if (!it.texto || !okText(it)) { discarded++; continue; } items.push(it);
    }
    return { items, discarded };
  }
  if (kind === 'ad_variants') {
    const items = [];
    for (const o of data.variantes || []) {
      const it = { titulo: String(o.titulo ?? '').trim(), descripcion: String(o.descripcion ?? '').trim(), cta: cap(o.cta, 30) };
      if (!it.titulo || it.titulo.length > LIMITS.adTitle || it.descripcion.length > LIMITS.adDescription || !okText(it)) { discarded++; continue; } items.push(it);
    }
    return { items, discarded };
  }
  if (kind === 'campaign_ideas') {
    const items = [];
    for (const o of data.ideas || []) { const it = { nombre: cap(o.nombre, 80), objetivo: cap(o.objetivo, 200), publico: cap(o.publico, 200), mensaje: cap(o.mensaje, 300) }; if (!it.nombre || !okText(it)) { discarded++; continue; } items.push(it); }
    return { items, discarded };
  }
  if (kind === 'reel_script') {
    const escenas = [];
    for (const e of data.escenas || []) {
      const it = { texto_en_pantalla: cap(e.texto_en_pantalla, 60), locucion: cap(e.locucion, 200), segundos: Math.min(6, Math.max(2, Math.round(Number(e.segundos) || 3))) };
      if (!it.texto_en_pantalla || !okText(it)) { discarded++; continue; } escenas.push(it);
    }
    const titulo = cap(data.titulo, 80);
    return { items: escenas.length ? [{ titulo: okText(titulo) ? titulo : 'Reel', escenas }] : [], discarded };
  }
  if (kind === 'calendar') {
    const FORMS = ['Post', 'Carrusel', 'Historia', 'Reel'];
    const dias = [];
    for (const d of data.dias || []) {
      const it = { dia: cap(d.dia, 20), formato: FORMS.find((f) => f.toLowerCase() === String(d.formato).trim().toLowerCase()) || 'Post', idea: cap(d.idea, 200), texto: cap(d.texto, LIMITS.igCaption) };
      if (!it.dia || !it.idea || !okText(it)) { discarded++; continue; } dias.push(it);
    }
    return { items: dias.length ? [{ dias }] : [], discarded };
  }
  return { items: [], discarded };
}

async function generate({ env, kind, model, brand, notes, audience, line }) {
  const k = KINDS[kind]; if (!k) throw httpErr(400, 'Tipo de contenido no válido.');
  if (!model) throw httpErr(400, 'Elija un modelo de Ollama (instálelo con: ollama pull <modelo>).');
  const biz = Object.entries(brand?.business || {}).map(([a, v]) => `${a}: ${v}`);
  const lineNote = line === 'suministros' ? `Línea: SUMINISTROS DE IMPRESORA (tóner y tintas alternativos/compatibles). Cuenta de Instagram: ${brand?.socials?.instagram_suministros || 'la de suministros'}. NO menciones artículos de aseo.`
    : line === 'aseo' ? `Línea: ASEO Y LIMPIEZA. Cuenta de Instagram: ${brand?.socials?.instagram_limpieza || 'la de aseo'}. NO menciones tóner ni tintas.` : '';
  const prompt = [
    brand?.name && `Empresa: ${brand.name}`, ...biz, brand?.style && `Estilo: ${brand.style}`, lineNote && lineNote,
    audience && `Público objetivo: ${audience}`, `NOTAS DEL USUARIO:\n${notes || '(sin notas)'}`, '', k.ask,
  ].filter((x) => x !== undefined && x !== false && x !== '').join('\n');
  const raw = await connectors.get('ollama').chat({ env, model, system: SYSTEM, prompt, format: k.schema });
  let data; try { data = JSON.parse(raw); } catch { throw httpErr(502, 'El modelo no devolvió un formato válido. Intente de nuevo o use un modelo más capaz.'); }
  const chk = makeGuard(brand, `${notes} ${audience || ''}`);
  const { items, discarded } = clean(kind, data, chk);
  if (!items.length) throw httpErr(502, discarded ? 'Todas las opciones rompían reglas (palabras prohibidas, cifras inventadas o límites de la plataforma) y se descartaron. Intente de nuevo.' : 'El modelo no propuso contenido. Intente de nuevo.');
  return { kind, label: k.label, items, discarded, model, limits: LIMITS };
}

module.exports = { generate, KINDS, LIMITS };
