'use strict';
/**
 * Guardia de contenido para textos generados por IA. Se aplica por código (no solo en el prompt):
 *  - palabras prohibidas de la marca (ej. «original» en tóner/tintas)
 *  - cifras inventadas: un número solo se acepta si el usuario lo entregó.
 *    Porcentajes, precios y monedas son MÁS estrictos: deben estar en las notas/público del usuario
 *    (no basta con que el número aparezca en un teléfono u horario de la empresa).
 */
const nums = (t) => (String(t).match(/\d[\d.,]*/g) || []).map((x) => x.replace(/[.,]+$/, ''));
const sensitive = (t) => {
  const out = []; const re = /(\d[\d.,]*)\s*(?:%|por\s*ciento|pesos|clp|usd|d[oó]lares)|(?:us\$|\$)\s*(\d[\d.,]*)/gi; let m;
  while ((m = re.exec(String(t)))) out.push((m[1] || m[2]).replace(/[.,]+$/, ''));
  return out;
};
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function makeGuard(brand, userText) {
  const banned = String(brand?.business?.palabras_prohibidas || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const res = banned.map((w) => new RegExp(`(^|[^\\p{L}])${esc(w)}([^\\p{L}]|$)`, 'iu'));
  const fromUser = new Set(nums(userText));
  const fromAll = new Set([...fromUser, ...nums(JSON.stringify(brand?.business || {})), ...nums(brand?.name || '')]);
  return {
    hasBanned: (t) => res.some((r) => r.test(t)),
    inventedNumber: (t) => {
      if (String(t).trim().startsWith('#')) return false;           // hashtags
      if (sensitive(t).some((n) => !fromUser.has(n))) return true;  // %, precios, monedas: solo si el usuario los dio
      return nums(t).some((n) => !fromAll.has(n));
    },
  };
}
module.exports = { makeGuard, nums, sensitive };
