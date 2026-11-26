'use strict';
/** Asistente de textos con IA local (Ollama). Genera titulares/apoyos y descarta cifras que usted no entregó. */
const connectors = require('./connectors');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const SCHEMA = {
  type: 'object',
  properties: { opciones: { type: 'array', items: { type: 'object', properties: { titular: { type: 'string' }, apoyo: { type: 'string' } }, required: ['titular', 'apoyo'] } } },
  required: ['opciones'],
};
const SYSTEM = `Eres redactor publicitario. Escribes en español neutro, claro y directo.
REGLAS ESTRICTAS:
- Usa SOLO la información entregada (datos de la empresa, notas del usuario y, si hay foto, lo que se ve claramente en ella).
- NO inventes precios, descuentos, porcentajes, cifras, plazos, características técnicas, marcas, modelos ni promesas.
- Si no hay datos suficientes, escribe textos genéricos y honestos (sin números).
- Titular: máximo 7 palabras. Apoyo: máximo 14 palabras.
- Respeta las reglas de redacción de la empresa indicadas en los datos (palabras prohibidas y notas).
- Devuelve exactamente 3 opciones en el JSON pedido.`;

const { makeGuard } = require('./guard');

async function suggestCopy({ env, model, brand, notes, imageBuffer }) {
  if (!model) throw httpErr(400, 'Elija un modelo de Ollama (instálelo con: ollama pull <modelo>).');
  const facts = [brand?.name && `Empresa: ${brand.name}`, ...Object.entries(brand?.business || {}).map(([k, v]) => `${k}: ${v}`), brand?.style && `Estilo: ${brand.style}`].filter(Boolean).join('\n');
  const prompt = `${facts ? `DATOS DE LA EMPRESA:\n${facts}\n\n` : ''}NOTAS DEL USUARIO SOBRE EL PRODUCTO:\n${notes || '(sin notas)'}\n\n${imageBuffer ? 'Se adjunta la fotografía del producto: describe solo lo que se ve con claridad; no leas ni inventes marcas o modelos que no sean legibles.\n\n' : ''}Propón 3 opciones de titular y texto de apoyo para una publicación.`;
  const raw = await connectors.get('ollama').chat({ env, model, system: SYSTEM, prompt, images: imageBuffer ? [imageBuffer] : [], format: SCHEMA });
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw httpErr(502, 'El modelo no devolvió un formato válido. Intente de nuevo o use un modelo más capaz.'); }
  const chk = makeGuard(brand, notes);
  const options = []; let discarded = 0;
  for (const o of Array.isArray(parsed?.opciones) ? parsed.opciones : []) {
    const titular = String(o?.titular ?? '').trim().slice(0, 80), apoyo = String(o?.apoyo ?? '').trim().slice(0, 140);
    if (!titular) continue;
    if (chk.hasBanned(`${titular} ${apoyo}`)) { discarded++; continue; } // palabra prohibida por la marca (ej. «original» en tóner)
    if (chk.inventedNumber(`${titular} ${apoyo}`)) { discarded++; continue; } // cifras que usted no dio
    options.push({ titular, apoyo });
  }
  if (!options.length) throw httpErr(502, discarded ? 'Todas las opciones rompían reglas (cifras inventadas o palabras prohibidas) y se descartaron. Intente de nuevo.' : 'El modelo no propuso opciones. Intente de nuevo.');
  return { options: options.slice(0, 3), discarded, model, used_image: Boolean(imageBuffer) };
}
module.exports = { suggestCopy };
