'use strict';
/* Utilidades de interfaz: constructor DOM seguro (sin innerHTML), API, toasts, modales. */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  if (props && props.value !== undefined && el.tagName === 'SELECT') el.value = props.value;
  return el;
}
const $ = (sel, root = document) => root.querySelector(sel);

async function api(method, url, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  let data = null; try { data = await r.json(); } catch { /* sin cuerpo */ }
  if (r.status === 401 && !url.startsWith('/api/auth/')) { window.dispatchEvent(new Event('need-login')); throw Object.assign(new Error('Sesión expirada'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error(data?.error || `Error ${r.status}`), { status: r.status, data });
  return data;
}

function toast(msg, type = '') {
  const t = h('div', { class: `toast ${type}` }, msg);
  $('#toasts').append(t); setTimeout(() => t.remove(), type === 'err' ? 7000 : 3500);
}
const fail = (e) => { if (e.status !== 401) toast(e.message, 'err'); };

function modal(content, { small = false } = {}) {
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } });
  const box = h('div', { class: `modal${small ? ' s' : ''}` }, content);
  bg.append(box); document.body.append(bg);
  const close = () => bg.remove();
  return { close, box };
}
function confirmModal(message, okLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    const m = modal(h('div', {}, h('p', {}, message), h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'btn', onclick: () => { m.close(); resolve(false); } }, 'Cancelar'),
      h('button', { class: `btn ${danger ? 'bad' : 'p'}`, onclick: () => { m.close(); resolve(true); } }, okLabel))), { small: true });
  });
}
function promptModal(label, value = '') {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'text', value });
    const go = () => { m.close(); resolve(inp.value.trim() || null); };
    const m = modal(h('div', {}, h('label', {}, label), inp, h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } },
      h('button', { class: 'btn', onclick: () => { m.close(); resolve(null); } }, 'Cancelar'), h('button', { class: 'btn p', onclick: go }, 'Aceptar'))), { small: true });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); inp.focus();
  });
}

const STATUS = { pending: ['Pendiente de revisión', 'warn'], approved: ['Aprobado', 'ok'], rejected: ['Rechazado', 'bad'], draft: ['Borrador', ''], none: ['', ''] };
const statusBadge = (s) => (STATUS[s]?.[0] ? h('span', { class: `badge ${STATUS[s][1]}` }, STATUS[s][0]) : null);
const KIND_LABEL = { logo: 'Logo', product: 'Producto', photo: 'Fotografía', background: 'Fondo', material: 'Material comercial', other: 'Otro', generated: 'Generada', export: 'Exportado' };
const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '');
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

/** Selector de archivos de la biblioteca (modal). onPick(asset) */
async function pickAsset({ kinds = ['product', 'photo', 'logo', 'background', 'material', 'other', 'generated'], brandId, title = 'Elegir archivo' } = {}) {
  return new Promise(async (resolve) => {
    let items = [];
    try { items = await api('GET', '/api/assets' + (brandId ? `?brand_id=${brandId}` : '')); } catch (e) { fail(e); return resolve(null); }
    items = items.filter((a) => kinds.includes(a.kind) && a.mime !== 'application/pdf');
    const m = modal(h('div', {}, h('h2', {}, title),
      items.length ? h('div', { class: 'picker' }, items.map((a) => h('div', {}, h('img', { class: 'thumb', src: a.thumb_url, alt: a.name, onclick: () => { m.close(); resolve(a); } }), h('div', { class: 'small muted' }, a.name))))
        : h('div', { class: 'empty' }, 'No hay archivos. Súbalos primero en la Biblioteca.'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => { m.close(); resolve(null); } }, 'Cancelar'))));
  });
}
