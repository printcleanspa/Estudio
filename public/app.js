'use strict';
const S = { user: null, brands: [], brandId: null, formats: {} };
const root = $('#app');
let cleanup = null;

const MENU = [
  ['home', 'Inicio', '🏠'], ['identity', 'Identidad y logos', '🎨'], ['images', 'Generador de imágenes', '🖼️'], ['design', 'Diseño gráfico', '✏️'],
  ['video', 'Estudio de video', '🎬', 2], ['reels', 'Reels', '📱', 2], ['music', 'Música y audio', '🎵', 3], ['voice', 'Voz IA', '🎙️', 3],
  ['marketing', 'Marketing', '📣', 4], ['instagram', 'Instagram', '📸', 4], ['google', 'Google Ads', '🔎', 4],
  ['library', 'Biblioteca de archivos', '📁'], ['connectors', 'Conectores', '🔌'], ['projects', 'Proyectos', '🗂️'], ['settings', 'Configuración', '⚙️'],
];
const COMING = {
  video: { phase: 2, title: 'Estudio de video', items: ['Video desde texto o imágenes (requiere un proveedor de video por API)', 'Línea de tiempo con varias pistas, transiciones y exportación MP4 (FFmpeg local)', 'Subtítulos automáticos', 'Animación de fotografías de producto'] },
  reels: { phase: 2, title: 'Reels', items: ['Plantillas 9:16 con escenas', 'Secuencias de imágenes con música y texto', 'Exportación MP4 vertical'] },
  music: { phase: 3, title: 'Música y audio', items: ['Música de fondo con licencia comercial verificada', 'Efectos de sonido', 'Mezcla y volumen sincronizados con el video'] },
  voice: { phase: 3, title: 'Voz IA', items: ['Guiones comerciales', 'Locuciones en español (texto a voz por API)', 'Subtítulos desde audio', 'Carga de grabaciones propias'] },
  marketing: { phase: 4, title: 'Marketing', items: ['Ideas de campaña, textos, títulos, hashtags y calendario de contenido', 'Variaciones de anuncios por público', 'Todo sin publicar nada sin su aprobación'] },
  instagram: { phase: 4, title: 'Instagram', items: ['Publicaciones, carruseles, historias y Reels', 'Publicación vía Instagram Graph API (requiere cuenta profesional y app de Meta con permisos aprobados)'] },
  google: { phase: 4, title: 'Google Ads', items: ['Creatividades Display y textos de anuncios', 'Conexión con Google Ads API (requiere developer token aprobado por Google)', 'YouTube Data API cuando corresponda'] },
};

// ---------------- arranque ----------------
async function boot() {
  window.addEventListener('need-login', showLogin);
  window.addEventListener('hashchange', route);
  try { S.user = await api('GET', '/api/auth/me'); await loadShell(); route(); } catch { showLogin(); }
}
async function showLogin() {
  cleanup?.(); cleanup = null; S.user = null;
  let hasUsers = true;
  try { hasUsers = (await api('GET', '/api/auth/status')).hasUsers; } catch { /* servidor caído */ }
  const email = h('input', { type: 'email', autocomplete: 'username', id: 'l-email' }), pass = h('input', { type: 'password', autocomplete: hasUsers ? 'current-password' : 'new-password', id: 'l-pass' }), name = h('input', { type: 'text', id: 'l-name' });
  const go = async () => {
    try {
      if (hasUsers) await api('POST', '/api/auth/login', { email: email.value, password: pass.value });
      else await api('POST', '/api/auth/register', { email: email.value, name: name.value, password: pass.value });
      S.user = await api('GET', '/api/auth/me'); await loadShell(); location.hash = '#/home'; route();
    } catch (e) { toast(e.message, 'err'); }
  };
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' },
    h('h1', {}, 'Estudio Creativo IA'),
    h('p', { class: 'muted' }, hasUsers ? 'Ingrese para continuar.' : 'Primera vez: cree la cuenta de administrador.'),
    hasUsers ? null : [h('label', {}, 'Su nombre'), name],
    h('label', {}, 'Correo'), email, h('label', {}, hasUsers ? 'Contraseña' : 'Contraseña (mínimo 8 caracteres)'), pass,
    h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn p', id: 'l-go', style: { width: '100%' }, onclick: go }, hasUsers ? 'Entrar' : 'Crear cuenta y entrar')))));
}
async function loadShell() {
  [S.brands, S.formats] = await Promise.all([api('GET', '/api/brands'), api('GET', '/api/formats')]);
  const saved = Number(localStorage.getItem('brandId'));
  S.brandId = S.brands.find((b) => b.id === saved)?.id ?? S.brands[0]?.id ?? null;
}
const brand = () => S.brands.find((b) => b.id === S.brandId) || null;
async function refreshBrands() { S.brands = await api('GET', '/api/brands'); if (!brand()) S.brandId = S.brands[0]?.id ?? null; }

function shell(page, content, { wide = false } = {}) {
  const side = h('nav', { class: 'side' }, h('div', { class: 'logo' }, h('i', {}, '✦'), 'Estudio Creativo IA'),
    h('div', { class: 'nav' }, MENU.map(([key, label, ico, ph]) => h('a', { href: `#/${key}`, class: page === key ? 'on' : '', onclick: () => side.classList.remove('open') }, h('span', {}, ico), label, ph ? h('span', { class: 'ph' }, `Fase ${ph}`) : null))));
  const sel = h('select', { id: 'brand-select', style: { width: 'auto', minWidth: '180px' }, onchange: (e) => { S.brandId = Number(e.target.value); localStorage.setItem('brandId', S.brandId); route(); } },
    S.brands.map((b) => h('option', { value: b.id, selected: b.id === S.brandId }, b.name)));
  const top = h('div', { class: 'top' }, h('button', { class: 'burger', 'aria-label': 'Menú', onclick: () => side.classList.toggle('open') }, '☰'),
    h('span', { class: 'muted small' }, 'Marca:'), S.brands.length ? sel : h('span', { class: 'badge warn' }, 'Sin marcas'), h('span', { class: 'grow' }),
    h('span', { class: 'muted small uname' }, S.user?.name), h('button', { class: 'btn sm', onclick: async () => { await api('POST', '/api/auth/logout'); showLogin(); } }, 'Salir'));
  root.replaceChildren(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, h('div', { class: `content${wide ? ' wide' : ''}`, id: 'page' }, content))));
}

async function route() {
  if (!S.user) return;
  cleanup?.(); cleanup = null;
  const [, page = 'home', arg] = (location.hash.split('?')[0] || '#/home').split('/');
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  try {
    if (page === 'design' && arg) {
      shell('design', h('div', { class: 'muted' }, 'Cargando editor…'), { wide: true });
      cleanup = await renderEditor($('#page'), arg, { brand: brand(), brands: S.brands, starter: query.get('starter') === '1' });
      return;
    }
    const pages = { home: pHome, identity: pIdentity, images: pImages, design: pDesignList, library: pLibrary, connectors: pConnectors, projects: pProjects, settings: pSettings };
    if (COMING[page]) return shell(page, pComing(COMING[page]));
    const fn = pages[page] || pHome;
    shell(pages[page] ? page : 'home', h('div', { class: 'muted' }, 'Cargando…'));
    $('#page').replaceChildren(await fn());
  } catch (e) { fail(e); if (e.status !== 401) $('#page') && $('#page').replaceChildren(h('div', { class: 'note' }, e.message)); }
}

// ---------------- páginas ----------------
function pComing(c) {
  return h('div', {}, h('h1', {}, c.title), h('div', { class: 'note info', style: { margin: '12px 0' } }, `Este módulo todavía no está construido: se desarrolla en la Fase ${c.phase}. No hay botones aquí para no simular funciones que no existen.`),
    h('div', { class: 'card' }, h('h3', {}, 'Lo que incluirá'), h('ul', {}, c.items.map((i) => h('li', {}, i)))));
}

async function pHome() {
  const d = await api('GET', '/api/dashboard');
  const stat = (label, v, href, sub) => h('a', { href, class: 'card', style: { textDecoration: 'none', color: 'inherit' } }, h('div', { class: 'muted small' }, label), h('div', { class: 'stat' }, v), sub ? h('div', { class: 'small muted' }, sub) : null);
  const designCard = (x) => h('a', { href: `#/design/${x.id}`, class: 'card item', style: { textDecoration: 'none', color: 'inherit' } }, h('img', { class: 'thumb', src: x.preview_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', alt: '' }), h('div', { class: 't' }, x.name), statusBadge(x.status));
  const assetCard = (a) => h('a', { href: a.url, target: '_blank', class: 'card item', style: { textDecoration: 'none', color: 'inherit' } }, (a.thumb_url ? h('img', { class: 'thumb', src: a.thumb_url, alt: '' }) : h('div', { class: 'thumb', style: { display: 'grid', placeItems: 'center', fontSize: '40px' } }, '📄')), h('div', { class: 't' }, a.name), statusBadge(a.status));
  const section = (title, items, render, empty) => h('div', { style: { marginTop: '22px' } }, h('h2', {}, title), items.length ? h('div', { class: 'grid gauto' }, items.map(render)) : h('div', { class: 'empty' }, empty));
    return h('div', {},
    h('h1', {}, `Hola, ${S.user.name}`), h('p', { class: 'muted' }, 'Elija una marca arriba, cargue una fotografía y produzca el material.'),
    h('div', { class: 'grid g4', style: { marginTop: '14px' } },
      stat('Imágenes creadas', d.counts.images, '#/images', `${d.counts.images_pending} por revisar`), stat('Diseños', d.counts.designs, '#/projects', `${d.counts.designs_pending} pendientes de aprobar`),
      stat('Videos creados', d.counts.videos, '#/video', 'Disponible en Fase 2'), stat('Archivos exportados', d.counts.exports, '#/library')),
    h('div', { class: 'grid g2', style: { marginTop: '16px' } },
      h('div', { class: 'card' }, h('h3', {}, 'Conectores activos'), d.connectors_active.length ? h('ul', { style: { margin: 0 } }, d.connectors_active.map((c) => h('li', {}, c))) : h('span', { class: 'muted' }, 'Ninguno'), h('p', {}, h('a', { href: '#/connectors' }, 'Ver todos los conectores'))),
      h('div', { class: 'card' }, h('h3', {}, 'Uso de motores y costos'), d.usage.length ? h('table', {}, h('tbody', {}, d.usage.map((u) => h('tr', {}, h('td', {}, u.connector), h('td', {}, `${u.ops} usos`), h('td', {}, 'Gratis'))))) : h('span', { class: 'muted' }, 'Sin uso todavía.'),
        h('p', { class: 'small muted' }, 'Costo acumulado: US$ 0. Todos los motores incluidos son gratuitos y se ejecutan en su equipo; no hay servicios de pago activados.'))),
    section('Diseños pendientes de aprobar', d.pending_designs, designCard, 'No hay diseños pendientes.'),
    section('Proyectos recientes', d.recent_designs, designCard, 'Aún no hay diseños. Cree uno en Diseño gráfico.'),
    section('Imágenes creadas', d.recent_images, assetCard, 'Aún no hay imágenes generadas.'),
    section('Archivos exportados', d.recent_exports, assetCard, 'Aún no hay exportaciones.'));
}

// ----- Identidad y logos -----
async function pIdentity() {
  await refreshBrands();
  const wrap = h('div', {}); const b = brand();
  const newBrand = async () => { const n = await promptModal('Nombre de la nueva marca'); if (!n) return; try { const nb = await api('POST', '/api/brands', { name: n }); S.brandId = nb.id; localStorage.setItem('brandId', nb.id); route(); } catch (e) { fail(e); } };
  wrap.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', {}, h('h1', {}, 'Identidad y logos'), h('p', { class: 'muted' }, 'Datos de la marca activa y su logo oficial.')), h('button', { class: 'btn p', onclick: newBrand }, '＋ Nueva marca')));
  if (!b) { wrap.append(h('div', { class: 'empty' }, 'Cree su primera marca.')); return wrap; }

  const colors = structuredClone(b.colors);
  const colorsBox = h('div'); const drawColors = () => colorsBox.replaceChildren(...colors.map((c, i) => h('div', { class: 'row', style: { marginBottom: '6px' } },
    h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000', oninput: (e) => { c.hex = e.target.value; } }), h('input', { type: 'text', value: c.name, placeholder: 'Nombre (ej. Azul principal)', style: { flex: 1 }, oninput: (e) => { c.name = e.target.value; } }),
    h('button', { class: 'btn sm bad', onclick: () => { colors.splice(i, 1); drawColors(); } }, 'Quitar'))), h('button', { class: 'btn sm', onclick: () => { colors.push({ name: '', hex: '#6d5efc' }); drawColors(); } }, '＋ Color'));
  drawColors();
  const field = (label, val, ph = '') => { const i = h('input', { type: 'text', value: val || '', placeholder: ph }); return { el: h('div', {}, h('label', {}, label), i), get: () => i.value }; };
  const name = field('Nombre de la marca', b.name), tit = field('Tipografía de títulos', b.fonts.titulos, 'Ej. Arial'), txt = field('Tipografía de textos', b.fonts.textos, 'Ej. Verdana');
  const biz = ['actividad', 'telefono', 'correo', 'direccion', 'horario', 'sitio_web'].map((k) => [k, field({ actividad: 'Actividad comercial', telefono: 'Teléfono / WhatsApp', correo: 'Correo', direccion: 'Dirección', horario: 'Horario', sitio_web: 'Sitio web' }[k], b.business[k])]);
  const soc = ['instagram', 'facebook', 'tiktok', 'youtube'].map((k) => [k, field(k[0].toUpperCase() + k.slice(1), b.socials[k], '@usuario o enlace')]);
  const style = h('textarea', { placeholder: 'Ej. limpio, profesional, fondos claros…' }, b.style); style.value = b.style;
  const save = async () => {
    try {
      const body = { name: name.get(), colors, fonts: { titulos: tit.get(), textos: txt.get() }, style: style.value, business: Object.fromEntries(biz.map(([k, f]) => [k, f.get()]).filter(([, v]) => v)), socials: Object.fromEntries(soc.map(([k, f]) => [k, f.get()]).filter(([, v]) => v)) };
      await api('PUT', `/api/brands/${b.id}`, body); await refreshBrands(); toast('Marca guardada', 'ok'); route();
    } catch (e) { fail(e); }
  };

  // logos
  const logos = (await api('GET', `/api/assets?brand_id=${b.id}&kind=logo`));
  const variant = h('select', { id: 'logo-variant' }, ['principal', 'horizontal', 'vertical', 'cuadrado', 'transparente'].map((v) => h('option', { value: v }, v)));
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', id: 'logo-file' });
  const upLogo = async () => {
    if (!file.files[0]) return toast('Elija el archivo del logo', 'err');
    const f = new FormData(); f.append('file', file.files[0]); f.append('kind', 'logo'); f.append('brand_id', b.id); f.append('variant', variant.value); f.append('name', `${b.name} - logo ${variant.value}`);
    try { await api('POST', '/api/assets', f); toast('Logo oficial guardado sin modificaciones', 'ok'); await refreshBrands(); route(); } catch (e) { fail(e); }
  };
  wrap.append(h('div', { class: 'grid g2', style: { marginTop: '14px' } },
    h('div', { class: 'card' }, h('h2', {}, 'Logo oficial'),
      h('div', { class: 'note info' }, 'El logo se guarda exactamente como usted lo entrega. El sistema no lo modifica, deforma ni sustituye: solo lo coloca (escalado proporcional) en los diseños.'),
      h('div', { class: 'grid gauto', style: { marginTop: '12px' } }, logos.length ? logos.map((l) => h('div', { class: 'item card' }, h('img', { class: 'thumb', src: l.thumb_url, alt: l.name }), h('div', { class: 't' }, l.meta.variant || 'principal'), l.id === b.logo_asset_id ? h('span', { class: 'badge ok' }, 'Vigente') : null, h('div', { class: 'small muted' }, `${l.width}×${l.height}`)))
        : h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'Aún no hay logo. Suba el logo oficial.')),
      h('label', {}, 'Subir logo (PNG, JPG, WEBP o SVG; transparente recomendado)'), file, h('label', {}, 'Variante'), variant,
      h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn p', id: 'logo-up', onclick: upLogo }, 'Subir logo oficial')),
      h('p', { class: 'small muted' }, 'Pendiente (requiere su autorización): generar versiones nuevas del logo o un manual de identidad automático.')),
    h('div', { class: 'card' }, h('h2', {}, 'Datos de la marca'), name.el,
      h('label', {}, 'Paleta de colores'), colorsBox, h('div', { class: 'grid g2' }, tit.el, txt.el), h('label', {}, 'Estilo visual'), style,
      h('h3', { style: { marginTop: '14px' } }, 'Datos comerciales (solo los que usted escriba)'), h('div', { class: 'grid g2' }, biz.map(([, f]) => f.el)),
      h('h3', { style: { marginTop: '14px' } }, 'Redes sociales'), h('div', { class: 'grid g2' }, soc.map(([, f]) => f.el)),
      h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn p', id: 'brand-save', onclick: save }, 'Guardar marca')))));
  return wrap;
}

// ----- Generador de imágenes -----
const IMG_MODEL_RE = /flux|z-image|diffusion|sdxl|\bsd\b/i;
async function pImages() {
  const b = brand(); const conns = (await api('GET', '/api/connectors')).active;
  const oll = conns.find((c) => c.id === 'ollama'), sd = conns.find((c) => c.id === 'sd-webui');
  const models = oll.models || [];
  const textModels = models.filter((m) => !IMG_MODEL_RE.test(m.name)), imgModels = models.filter((m) => IMG_MODEL_RE.test(m.name));
  const st = { provider: 'local-compose', src: null, last: null };
  const modelSel = (id, list, pref) => h('select', { id, value: list.some((m) => m.name === pref) ? pref : undefined }, list.length ? list.map((m) => h('option', { value: m.name }, m.name)) : [h('option', { value: '' }, 'No hay modelos instalados')]);

  const srcBox = h('div'); const out = h('div');
  async function pick() { const a = await pickAsset({ kinds: ['product', 'photo', 'material', 'other', 'logo', 'generated'], brandId: null, title: 'Foto original' }); if (a) { st.src = a; drawSrc(); } }
  const drawSrc = () => srcBox.replaceChildren(st.src ? h('div', { class: 'row' }, h('img', { src: st.src.thumb_url, style: { width: '72px', height: '72px', objectFit: 'contain', borderRadius: '8px', background: '#f0f1f7' }, alt: '' }), h('div', {}, h('div', { class: 'small' }, st.src.name), h('button', { class: 'btn sm', onclick: pick }, 'Cambiar'))) : h('button', { class: 'btn', id: 'pick-src', onclick: pick }, 'Elegir foto original del producto'));
  drawSrc();
  const fmt = h('select', { id: 'fmt' }, Object.entries(S.formats).map(([k, f]) => h('option', { value: k }, f.label)));
  const bgType = h('select', { id: 'bgtype' }, h('option', { value: 'solid' }, 'Color liso'), h('option', { value: 'gradient' }, 'Degradado'));
  const bc = (b?.colors || []).map((c) => c.hex);
  const c1 = h('input', { type: 'color', id: 'c1', value: bc[0] && /^#[0-9a-f]{6}$/i.test(bc[0]) ? bc[0] : '#ffffff' }), c2 = h('input', { type: 'color', id: 'c2', value: '#dbe7ff' });
  const head = h('input', { type: 'text', id: 'headline', placeholder: 'Ej. Tóner para su impresora' }), sub = h('input', { type: 'text', id: 'subline', placeholder: 'Opcional' });
  const useLogo = h('input', { type: 'checkbox', id: 'uselogo', checked: Boolean(b?.logo), disabled: !b?.logo });

  // --- asistente de textos (Ollama) ---
  const suggestOut = h('div');
  const aiNotes = h('textarea', { id: 'ai-notes', placeholder: 'Lo que usted sabe del producto: nombre, uso, para quién… (la IA no inventará precios ni características)' });
  const aiModel = modelSel('ai-model', textModels.length ? textModels : models, oll.defaults?.text); const aiImg = h('input', { type: 'checkbox', id: 'ai-img' });
  async function suggest() {
    suggestOut.replaceChildren(h('p', { class: 'muted small' }, 'Pensando… (depende de su equipo)'));
    try {
      const r = await api('POST', '/api/ai/suggest-copy', { brand_id: b?.id, model: aiModel.value, notes: aiNotes.value, source_asset_id: st.src?.id, use_image: aiImg.checked && Boolean(st.src) });
      suggestOut.replaceChildren(...r.options.map((o) => h('div', { class: 'card', style: { padding: '10px', marginTop: '8px' } }, h('b', {}, o.titular), h('div', { class: 'small muted' }, o.apoyo),
        h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: () => { head.value = o.titular; sub.value = o.apoyo; toast('Texto aplicado. Revíselo antes de generar.', 'ok'); } }, 'Usar este'))),
        h('p', { class: 'small muted' }, `Modelo: ${r.model}.${r.discarded ? ` Se descartaron ${r.discarded} opción(es) con cifras que usted no entregó.` : ''} Revise siempre los textos.`));
    } catch (e) { suggestOut.replaceChildren(); fail(e); }
  }
  const assistant = oll.configured
    ? h('details', { style: { marginTop: '12px' }, open: true }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Asistente de textos (Ollama, gratis y local)'),
      h('label', {}, 'Notas del producto'), aiNotes, h('label', {}, 'Modelo'), aiModel,
      h('label', { class: 'row', style: { fontWeight: 400 } }, aiImg, 'Que la IA mire la foto (solo modelos con visión, ej. gemma4)'),
      h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn', id: 'ai-go', onclick: suggest }, 'Sugerir textos')), suggestOut)
    : h('div', { class: 'note', style: { marginTop: '12px' } }, `Asistente de textos no disponible: ${oll.note} Vea Conectores para instalarlo (gratis).`);

  const localBox = h('div', {}, h('label', {}, 'Fondo'), h('div', { class: 'row' }, bgType, c1, c2), h('label', {}, 'Titular'), head, h('label', {}, 'Texto de apoyo'), sub,
    h('label', { class: 'row', style: { fontWeight: 400 } }, useLogo, b?.logo ? 'Incluir logo oficial' : 'Incluir logo (la marca no tiene logo cargado)'), assistant);

  // --- IA de imagen local ---
  const ollModel = modelSel('oll-model', imgModels.length ? imgModels : models), ollPrompt = h('textarea', { id: 'oll-prompt', placeholder: 'Describa la imagen (escenario, estilo, luz…)' });
  const ollBox = h('div', {}, h('div', { class: 'note' }, 'Generación de imagen de Ollama: función EXPERIMENTAL (nació en macOS; en otros sistemas puede no estar disponible). Si falla, use Stable Diffusion o la composición local.'),
    h('label', {}, 'Modelo de imagen instalado'), ollModel, h('label', {}, 'Descripción'), ollPrompt);
  const sdMode = h('select', { id: 'sd-mode' }, h('option', { value: 'text2img' }, 'Crear desde texto'), h('option', { value: 'edit' }, 'Variar la foto original (img2img)')), sdPrompt = h('textarea', { id: 'sd-prompt', placeholder: 'Describa la imagen…' }), sdNeg = h('input', { type: 'text', id: 'sd-neg', placeholder: 'Opcional: borroso, deformado, texto ilegible' });
  const sdBox = h('div', {}, h('label', {}, 'Tipo'), sdMode, h('label', {}, 'Descripción'), sdPrompt, h('label', {}, 'Evitar'), sdNeg);
  const aiWarn = h('div', { class: 'note', style: { marginTop: '10px' } }, 'La IA puede alterar el producto, sus etiquetas o su envase. Para conservar el producto tal cual use «Composición local». Compare siempre con el original antes de aprobar.');

  const NOTES = {
    'local-compose': h('div', { class: 'note info' }, 'Gratis. Conserva su foto original intacta (solo la escala).'),
    'ollama-image': h('div', { class: oll.configured ? 'note info' : 'note' }, oll.configured ? `Ollama conectado. ${oll.note}` : `Ollama no disponible: ${oll.note}`),
    'sd-webui': h('div', { class: sd.configured ? 'note info' : 'note' }, sd.configured ? sd.note : `Stable Diffusion no disponible: ${sd.note}`),
  };
  const provSeg = h('div', { class: 'seg' }); const dyn = h('div');
  const mkSeg = () => {
    const btn = (id, label, key) => h('button', { class: st.provider === key ? 'on' : '', id, onclick: () => { st.provider = key; mkSeg(); } }, label);
    provSeg.replaceChildren(btn('prov-local', 'Composición local', 'local-compose'), btn('prov-oll', 'IA: Ollama', 'ollama-image'), btn('prov-sd', 'IA: Stable Diffusion', 'sd-webui'));
    dyn.replaceChildren(NOTES[st.provider], st.provider === 'local-compose' ? localBox : st.provider === 'ollama-image' ? [ollBox, aiWarn] : [sdBox, aiWarn]);
  };
  mkSeg();
  const genBtn = h('button', { class: 'btn p', id: 'gen', onclick: () => generate() }, 'Generar');

  async function generate() {
    const body = { brand_id: b?.id, provider: st.provider, source_asset_id: st.src?.id, format: fmt.value };
    if (st.provider === 'local-compose') Object.assign(body, { bg_type: bgType.value, bg_colors: [c1.value, c2.value], headline: head.value, subline: sub.value, use_logo: useLogo.checked });
    else if (st.provider === 'ollama-image') Object.assign(body, { model: ollModel.value, prompt: ollPrompt.value });
    else Object.assign(body, { mode: sdMode.value, prompt: sdPrompt.value, negative: sdNeg.value });
    genBtn.disabled = true; genBtn.textContent = 'Generando… (la IA local puede tardar)';
    try { const a = await api('POST', '/api/images/generate', body); st.last = a; showResult(a); }
    catch (e) { fail(e); } finally { genBtn.disabled = false; genBtn.textContent = 'Generar'; }
  }
  async function setStatus(a, status) { try { const u = await api('PATCH', `/api/assets/${a.id}`, { status }); st.last = u; showResult(u); toast(status === 'approved' ? 'Imagen aprobada' : 'Imagen rechazada', 'ok'); } catch (e) { fail(e); } }
  async function toEditor(a) {
    try {
      const json = { version: '5.3.0', background: '#ffffff', objects: [{ type: 'image', version: '5.3.0', left: 0, top: 0, width: a.width, height: a.height, src: a.url }] };
      const d = await api('POST', '/api/designs', { name: `Diseño sobre ${a.name}`, width: a.width, height: a.height, format: a.meta.format, brand_id: b?.id, json }); location.hash = `#/design/${d.id}`;
    } catch (e) { fail(e); }
  }
  function showResult(a) {
    out.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h2', {}, 'Resultado'), statusBadge(a.status)),
      h('div', { class: 'cmp' }, st.src ? h('figure', {}, h('figcaption', {}, 'ORIGINAL'), h('img', { src: st.src.url, alt: 'original' })) : null, h('figure', {}, h('figcaption', {}, 'RESULTADO'), h('img', { id: 'result-img', src: a.url, alt: 'resultado' }))),
      a.meta.productModified ? h('div', { class: 'note', style: { marginTop: '10px' } }, `Producto: ${a.meta.productModified}`) : h('p', { class: 'small muted' }, a.source === 'local-compose' ? 'El producto no fue modificado (solo escalado proporcionalmente).' : 'Imagen creada desde texto: no contiene su producto real.'),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn ok', id: 'approve-img', onclick: () => setStatus(a, 'approved') }, 'Aprobar'), h('button', { class: 'btn bad', onclick: () => setStatus(a, 'rejected') }, 'Rechazar'),
        h('button', { class: 'btn', onclick: () => generate() }, 'Volver a generar'), h('a', { class: 'btn', href: `/api/assets/${a.id}/download` }, 'Descargar'),
        h('button', { class: 'btn p', disabled: a.status !== 'approved', title: a.status !== 'approved' ? 'Apruebe la imagen para usarla en un diseño' : '', onclick: () => toEditor(a) }, 'Abrir en el editor'))));
  }
  return h('div', {}, h('h1', {}, 'Generador de imágenes'), h('p', { class: 'muted' }, `Marca: ${b?.name || '—'}. Motores gratuitos y locales. Nada se exporta ni publica sin su aprobación.`),
    h('div', { class: 'grid g2', style: { marginTop: '12px', alignItems: 'start' } },
      h('div', { class: 'card' }, h('label', {}, 'Motor'), provSeg, h('label', {}, 'Foto original'), srcBox, h('label', {}, 'Formato'), fmt, dyn, h('div', { style: { marginTop: '14px' } }, genBtn)), out));
}

// ----- Diseño gráfico (inicio) y proyectos -----
async function createDesignModal() {
  const name = h('input', { type: 'text', id: 'nd-name', value: 'Nuevo diseño' });
  const fmt = h('select', { id: 'nd-fmt' }, Object.entries(S.formats).map(([k, f]) => h('option', { value: k }, f.label)));
  const tpls = await api('GET', '/api/designs?template=1');
  const tpl = h('select', { id: 'nd-tpl' }, h('option', { value: '' }, 'Con diseño base (título, texto, botón y logo)'), h('option', { value: 'blank' }, 'En blanco'), tpls.map((t) => h('option', { value: t.id }, `Plantilla: ${t.name} (${t.width}×${t.height})`)));
  const m = modal(h('div', {}, h('h2', {}, 'Nuevo diseño'), h('label', {}, 'Nombre'), name, h('label', {}, 'Formato'), fmt, h('label', {}, 'Punto de partida'), tpl,
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn p', id: 'nd-go', onclick: async () => {
        try {
          const body = { name: name.value, format: fmt.value, brand_id: brand()?.id };
          if (tpl.value && tpl.value !== 'blank') { body.from_design_id = Number(tpl.value); }
          const d = await api('POST', '/api/designs', body); m.close(); location.hash = `#/design/${d.id}${tpl.value === '' ? '?starter=1' : ''}`;
        } catch (e) { fail(e); }
      } }, 'Crear y abrir editor'))));
}
async function pDesignList() {
  const list = await api('GET', '/api/designs' + (brand() ? `?brand_id=${brand().id}` : ''));
  return h('div', {}, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', {}, h('h1', {}, 'Diseño gráfico'), h('p', { class: 'muted' }, 'Posts, historias, banners, flyers y más. Exporta PNG, JPG y PDF.')), h('button', { class: 'btn p', id: 'new-design', onclick: createDesignModal }, '＋ Nuevo diseño')),
    list.length ? h('div', { class: 'grid gauto', style: { marginTop: '14px' } }, list.map(designCard)) : h('div', { class: 'empty', style: { marginTop: '14px' } }, 'Aún no hay diseños para esta marca. Cree el primero.'));
}
function designCard(d) {
  return h('div', { class: 'card item' }, h('a', { href: `#/design/${d.id}` }, h('img', { class: 'thumb', src: d.preview_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', alt: '' })),
    h('div', { class: 't' }, d.name), h('div', { class: 'small muted' }, `${d.width}×${d.height} · v${d.version}`), !d.is_template ? statusBadge(d.status) : h('span', { class: 'badge brand' }, 'Plantilla'),
    h('div', { class: 'acts' }, h('a', { class: 'btn sm', href: `#/design/${d.id}` }, 'Abrir'),
      h('button', { class: 'btn sm', onclick: async () => { try { const c = await api('POST', '/api/designs', { from_design_id: d.id, name: `${d.name} (copia)`, brand_id: d.brand_id }); location.hash = `#/design/${c.id}`; } catch (e) { fail(e); } } }, d.is_template ? 'Usar' : 'Duplicar'),
      h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmModal(`¿Eliminar «${d.name}»?`, 'Eliminar', true)) { try { await api('DELETE', `/api/designs/${d.id}`); route(); } catch (e) { fail(e); } } } }, 'Eliminar')));
}
async function pProjects() {
  const [ds, ts] = await Promise.all([api('GET', '/api/designs'), api('GET', '/api/designs?template=1')]);
  const groups = [['Pendientes de aprobar', ds.filter((d) => d.status !== 'approved')], ['Aprobados', ds.filter((d) => d.status === 'approved')], ['Plantillas reutilizables', ts]];
  return h('div', {}, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h1', {}, 'Proyectos'), h('button', { class: 'btn p', onclick: createDesignModal }, '＋ Nuevo diseño')),
    groups.map(([t, items]) => h('div', { style: { marginTop: '20px' } }, h('h2', {}, `${t} (${items.length})`), items.length ? h('div', { class: 'grid gauto' }, items.map(designCard)) : h('div', { class: 'empty' }, 'Nada por aquí.'))),
    h('p', { class: 'small muted', style: { marginTop: '18px' } }, 'Videos y campañas aparecerán aquí a partir de las Fases 2 y 4.'));
}

// ----- Biblioteca -----
async function pLibrary() {
  const f = { kind: '', q: '', all: false };
  const grid = h('div', { class: 'grid gauto' });
  const kindSel = h('select', { id: 'lib-kind', style: { width: 'auto' }, onchange: (e) => { f.kind = e.target.value; load(); } }, h('option', { value: '' }, 'Todos los tipos'), Object.entries(KIND_LABEL).map(([k, v]) => h('option', { value: k }, v)));
  const q = h('input', { type: 'text', placeholder: 'Buscar por nombre', style: { width: '220px' }, oninput: (e) => { f.q = e.target.value; clearTimeout(q._t); q._t = setTimeout(load, 250); } });
  const scope = h('select', { style: { width: 'auto' }, onchange: (e) => { f.all = e.target.value === 'all'; load(); } }, h('option', { value: 'brand' }, `Solo ${brand()?.name || 'marca activa'}`), h('option', { value: 'all' }, 'Todas las marcas'));
  const upKind = h('select', { id: 'up-kind', style: { width: 'auto' } }, ['product', 'photo', 'background', 'material', 'other'].map((k) => h('option', { value: k }, KIND_LABEL[k])));
  const upFile = h('input', { type: 'file', id: 'up-file', multiple: true, accept: 'image/png,image/jpeg,image/webp,image/svg+xml' });
  async function upload() {
    if (!upFile.files.length) return toast('Elija uno o más archivos', 'err');
    let n = 0;
    for (const file of upFile.files) { const fd = new FormData(); fd.append('file', file); fd.append('kind', upKind.value); if (brand()) fd.append('brand_id', brand().id); fd.append('name', file.name); try { await api('POST', '/api/assets', fd); n++; } catch (e) { fail(e); } }
    if (n) toast(`${n} archivo(s) subido(s). Los originales se conservan sin cambios.`, 'ok'); upFile.value = ''; load();
  }
  async function load() {
    const p = new URLSearchParams(); if (!f.all && brand()) p.set('brand_id', brand().id); if (f.kind) p.set('kind', f.kind); if (f.q) p.set('q', f.q);
    const items = await api('GET', `/api/assets?${p}`);
    grid.replaceChildren(...(items.length ? items.map((a) => h('div', { class: 'card item' },
      a.mime === 'application/pdf' ? h('div', { class: 'thumb', style: { display: 'grid', placeItems: 'center', fontSize: '40px' } }, '📄') : h('a', { href: a.url, target: '_blank' }, h('img', { class: 'thumb', src: a.thumb_url, alt: a.name, loading: 'lazy' })),
      h('div', { class: 't', title: a.name }, a.name), h('div', { class: 'row', style: { gap: '4px' } }, h('span', { class: 'badge' }, KIND_LABEL[a.kind] || a.kind), a.official ? h('span', { class: 'badge ok' }, 'Oficial') : null, statusBadge(a.status)),
      h('div', { class: 'small muted' }, `${a.width ? a.width + '×' + a.height + ' · ' : ''}${fmtSize(a.bytes)}`),
      h('div', { class: 'acts' }, h('a', { class: 'btn sm', href: `/api/assets/${a.id}/download` }, 'Descargar'),
        h('button', { class: 'btn sm bad', onclick: async () => {
          if (!(await confirmModal(a.official ? `«${a.name}» es un archivo OFICIAL de marca. ¿Eliminarlo definitivamente?` : `¿Eliminar «${a.name}»?`, 'Eliminar', true))) return;
          try { await api('DELETE', `/api/assets/${a.id}${a.official ? '?confirm=1' : ''}`); load(); } catch (e) { fail(e); }
        } }, 'Eliminar')))) : [h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'No hay archivos con estos filtros.')]));
  }
  load();
  return h('div', {}, h('h1', {}, 'Biblioteca de archivos'),
    h('div', { class: 'card', style: { margin: '12px 0' } }, h('h3', {}, 'Subir fotografías y materiales'), h('div', { class: 'row' }, upKind, upFile, h('button', { class: 'btn p', id: 'up-go', onclick: upload }, 'Subir')), h('p', { class: 'small muted' }, 'PNG, JPG, WEBP o SVG hasta 25 MB. Los originales nunca se modifican; los resultados se guardan como archivos nuevos.')),
    h('div', { class: 'row', style: { marginBottom: '12px' } }, scope, kindSel, q), grid);
}

// ----- Conectores -----
const HOWTO = {
  ollama: ['1. Instale Ollama (gratis): app en ollama.com/download, o en PowerShell: irm https://ollama.com/install.ps1 | iex', '2. Descargue el modelo recomendado para PC sin GPU (texto + imágenes): ollama pull gemma4:e2b', '3. Compruebe que todo responda: npm run check:ollama. Luego recargue esta página.', 'Imágenes con Ollama es EXPERIMENTAL (hoy nació en macOS). Si no está disponible en su sistema, use Stable Diffusion.'],
  'sd-webui': ['1. Instale Stable Diffusion WebUI (AUTOMATIC1111, Forge o SD.Next) e inícielo con la opción --api.', '2. Defina en .env: SD_WEBUI_URL=http://127.0.0.1:7860', '3. Reinicie Estudio Creativo IA. Requiere GPU para velocidad razonable.'],
};
const COMPARE = [
  ['Composición local (sharp)', 'Foto original + fondo de marca + texto + logo', 'No aplica (integrado)', 'Gratis', 'Ninguno externo', 'Fiel al original', 'Conserva el producto intacto', 'No crea escenas nuevas ni quita fondos'],
  ['Ollama (modelos locales)', 'Textos (asistente), visión de fotos; imagen experimental', 'Sí, local (integrado)', 'Gratis', 'Los define su equipo (memoria/GPU)', 'Según el modelo', 'Privado, sin internet, sin cuotas', 'Imagen experimental; licencia distinta por modelo'],
  ['Stable Diffusion WebUI', 'Imagen desde texto / variación de foto', 'Sí, local (integrado)', 'Gratis (software libre)', 'Su GPU', 'Buena con buen modelo', 'Muchos modelos abiertos', 'Pide GPU; revisar licencia del modelo; puede alterar productos'],
  ['ComfyUI', 'Flujos de imagen avanzados', 'Sí, local', 'Gratis', 'Su GPU', 'Alta', 'Muy flexible', 'No integrado aún (Fase 2)'],
  ['rembg / modelos de recorte', 'Quitar fondos', 'Local (librería)', 'Gratis', 'Su equipo', 'Buena en objetos simples', 'Sin costo por imagen', 'No integrado aún (Fase 2)'],
  ['FFmpeg', 'Montaje, cortes, subtítulos, MP4', 'Local', 'Gratis (software libre)', 'Su equipo', 'Profesional', 'Control total', 'No integrado aún (Fase 2)'],
  ['Whisper (local)', 'Subtítulos desde audio', 'Local', 'Gratis (modelos abiertos)', 'Su equipo', 'Alta', 'Sin cuotas', 'No integrado aún (Fase 2)'],
  ['Texto a voz local (ej. Piper)', 'Locuciones en español', 'Local', 'Gratis', 'Su equipo', 'Buena', 'Sin cuotas', 'VERIFICAR licencia de la voz/motor para uso comercial (Fase 3)'],
  ['Música', 'Fondo musical', 'Local o biblioteca libre', 'Gratis', '—', '—', '—', 'VERIFICAR licencia comercial: algunos modelos abiertos solo permiten uso no comercial'],
  ['Instagram Graph API / Google Ads API', 'Publicar y gestionar campañas', 'Sí (APIs gratuitas)', 'API gratuita; la publicidad se paga aparte', 'Aprobación de Meta / Google', '—', 'Publicación desde la plataforma', 'Requiere cuentas y permisos aprobados (Fase 4)'],
];
async function pConnectors() {
  const { active, planned } = await api('GET', '/api/connectors');
  return h('div', {}, h('h1', {}, 'Conectores'), h('p', { class: 'muted' }, 'Motores gratuitos y de código abierto que corren en su equipo. Cada uno es un módulo independiente: se pueden sumar o cambiar sin rehacer la plataforma. Nada se simula: si un motor no responde, aparece «No disponible».'),
    h('div', { class: 'note info', style: { margin: '12px 0' } }, 'Política: no hay servicios de pago activados. Ningún servicio de pago se incorpora sin su autorización expresa.'),
    h('div', { class: 'grid g2', style: { marginTop: '12px' } }, active.map((c) => h('div', { class: 'card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, c.label), h('span', { class: `badge ${c.configured ? 'ok' : 'warn'}` }, c.configured ? 'Disponible' : 'No disponible')),
      h('p', { class: 'small' }, c.note),
      c.models?.length ? h('p', { class: 'small' }, h('b', {}, 'Modelos instalados: '), c.models.map((m) => m.name).join(', ')) : null,
      h('p', { class: 'small muted' }, h('b', {}, 'Costo: '), c.info.cost), h('p', { class: 'small muted' }, h('b', {}, 'Límites: '), c.info.limits),
      !c.configured && HOWTO[c.id] ? h('details', {}, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Cómo activarlo'), h('ul', { class: 'small' }, HOWTO[c.id].map((x) => h('li', {}, x)))) : null,
      h('a', { class: 'small', href: c.info.docs, target: '_blank', rel: 'noopener' }, 'Documentación oficial')))),
    h('h2', { style: { marginTop: '24px' } }, 'Próximos conectores (aún no integrados)'),
    h('div', { class: 'card tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Servicio', 'Categoría', 'Fase', 'Nota'].map((x) => h('th', {}, x)))), h('tbody', {}, planned.map((p) => h('tr', {}, h('td', {}, p.label), h('td', {}, p.category), h('td', {}, `Fase ${p.phase}`), h('td', {}, p.note)))))),
    h('h2', { style: { marginTop: '24px' } }, 'Comparativa de motores gratuitos'),
    h('div', { class: 'note', style: { marginBottom: '10px' } }, 'Tabla orientativa. Donde dice VERIFICAR, confirme la licencia en el sitio oficial antes de uso comercial. Los modelos de IA tienen licencias distintas: algunos prohíben el uso comercial.'),
    h('div', { class: 'card tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Servicio', 'Funciones', 'API', 'Precio', 'Límites', 'Calidad', 'Ventajas', 'Desventajas'].map((x) => h('th', {}, x)))), h('tbody', {}, COMPARE.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))))));
}

// ----- Configuración -----
async function pSettings() {
  const wrap = h('div', {}, h('h1', {}, 'Configuración'));
  wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', {}, 'Su cuenta'), h('p', {}, `${S.user.name} · ${S.user.email} · ${S.user.role === 'admin' ? 'Administrador' : 'Usuario'}`)));
  if (S.user.role === 'admin') {
    const users = await api('GET', '/api/users');
    const em = h('input', { type: 'email', id: 'u-email' }), nm = h('input', { type: 'text', id: 'u-name' }), pw = h('input', { type: 'password', id: 'u-pass' });
    wrap.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Usuarios'), h('table', {}, h('tbody', {}, users.map((u) => h('tr', {}, h('td', {}, u.name), h('td', {}, u.email), h('td', {}, u.role))))),
      h('h3', { style: { marginTop: '14px' } }, 'Agregar usuario'), h('div', { class: 'grid g3' }, h('div', {}, h('label', {}, 'Nombre'), nm), h('div', {}, h('label', {}, 'Correo'), em), h('div', {}, h('label', {}, 'Contraseña (mín. 8)'), pw)),
      h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn p', id: 'u-add', onclick: async () => { try { await api('POST', '/api/users', { name: nm.value, email: em.value, password: pw.value }); toast('Usuario creado', 'ok'); route(); } catch (e) { fail(e); } } }, 'Crear usuario'))),
      h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Copias de seguridad'), h('p', { class: 'small muted' }, 'Crea una copia de la base de datos en data/backups. Los archivos subidos están en data/uploads (copie esa carpeta, o use «npm run backup» que copia todo).'),
        h('button', { class: 'btn', id: 'backup', onclick: async () => { try { const r = await api('POST', '/api/backup'); toast(`Copia creada: ${r.file}`, 'ok'); } catch (e) { fail(e); } } }, 'Crear copia de la base de datos')));
  }
  wrap.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Claves y credenciales'), h('p', { class: 'small muted' }, 'Las claves API se configuran solo en el servidor (archivo .env o variables de entorno). Nunca se envían al navegador ni se guardan en el código.')));
  return wrap;
}

boot();
