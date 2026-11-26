'use strict';
/* Editor gráfico (Fabric.js). Guarda versiones, exige aprobación para exportar. */
const FONTS = ['Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Inter', 'sans-serif', 'serif'];

async function renderEditor(root, designId, { brand, brands, starter }) {
  let design = await api('GET', `/api/designs/${designId}`);
  const W = design.width, H = design.height;
  let zoom = 1, dirty = false, loading = true, canvas;
  const designBrand = brands.find((b) => b.id === design.brand_id) || brand;
  const brandFonts = Object.values(designBrand?.fonts || {}).filter(Boolean);
  const fontList = [...new Set([...brandFonts, ...FONTS])];

  const canvasEl = h('canvas');
  const stage = h('div', { class: 'stage' }, canvasEl);
  const props = h('div', { class: 'pane' });
  const nameInp = h('input', { type: 'text', value: design.name });
  const statusEl = h('span');
  const btnSave = h('button', { class: 'btn p', onclick: () => save() }, 'Guardar');
  const btnApprove = h('button', { class: 'btn ok', onclick: () => approve() }, 'Aprobar');
  const btnExp = (fmt) => h('button', { class: 'btn', 'data-exp': fmt, onclick: () => exportAs(fmt) }, fmt.toUpperCase());
  const expBtns = ['png', 'jpg', 'pdf'].map(btnExp);

  function refreshBar() {
    statusEl.replaceChildren(dirty ? h('span', { class: 'badge warn' }, 'Cambios sin guardar') : statusBadge(design.status), ` v${design.version}`);
    btnApprove.disabled = dirty || design.status === 'approved';
    expBtns.forEach((b) => { b.disabled = dirty || design.status !== 'approved'; b.title = design.status !== 'approved' ? 'Apruebe el diseño para exportar' : ''; });
  }
  const markDirty = () => { if (loading) return; dirty = true; refreshBar(); };

  // ---------- acciones ----------
  const serialize = () => JSON.parse(JSON.stringify(canvas.toJSON(['name'])).split(location.origin).join(''));
  async function save() {
    try {
      canvas.discardActiveObject(); canvas.renderAll();
      const mult = Math.min(1, 600 / Math.max(W, H)) / zoom;
      const preview = canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: mult });
      design = await api('PUT', `/api/designs/${design.id}`, { name: nameInp.value, json: serialize(), preview });
      dirty = false; refreshBar(); toast('Diseño guardado', 'ok');
    } catch (e) { fail(e); }
  }
  async function approve() {
    try {
      if (dirty) await save();
      design = await api('PATCH', `/api/designs/${design.id}/status`, { status: 'approved' }).then((d) => ({ ...design, ...d }));
      refreshBar(); toast('Diseño aprobado. Ya puede exportarlo.', 'ok');
    } catch (e) { fail(e); }
  }
  function fullResPng() {
    canvas.discardActiveObject();
    canvas.setZoom(1); canvas.setDimensions({ width: W, height: H });
    const url = canvas.toDataURL({ format: 'png', multiplier: 1 });
    applyZoom(); return url;
  }
  async function exportAs(fmt) {
    try {
      const a = await api('POST', `/api/designs/${design.id}/export`, { format: fmt, version: design.version, dataUrl: fullResPng() });
      toast(`Exportado ${fmt.toUpperCase()}. Queda en la Biblioteca.`, 'ok');
      const link = h('a', { href: `/api/assets/${a.id}/download` }); document.body.append(link); link.click(); link.remove();
    } catch (e) { fail(e); }
  }

  // ---------- zoom ----------
  function applyZoom() {
    const box = stage.getBoundingClientRect();
    const availW = Math.max(200, (box.width || 800) - 40), availH = Math.max(200, (box.height || 600) - 40);
    zoom = Math.min(availW / W, availH / H, 1);
    canvas.setZoom(zoom); canvas.setDimensions({ width: Math.round(W * zoom), height: Math.round(H * zoom) });
    canvas.renderAll();
  }

  // ---------- objetos ----------
  const brandColor = (i, fb) => designBrand?.colors?.[i]?.hex || fb;
  const place = (o) => { o.set({ left: W / 2, top: H / 2, originX: 'center', originY: 'center' }); canvas.add(o); canvas.setActiveObject(o); canvas.requestRenderAll(); };
  const addText = (txt = 'Escriba aquí', opt = {}) => { const t = new fabric.Textbox(txt, { width: W * 0.8, fontSize: Math.round(W * 0.06), fontFamily: fontList[0], fill: '#111111', textAlign: 'center', ...opt }); place(t); return t; };
  const addRect = () => place(new fabric.Rect({ width: W * 0.4, height: H * 0.15, fill: brandColor(0, '#6d5efc'), rx: 12, ry: 12 }));
  const addCircle = () => place(new fabric.Circle({ radius: Math.min(W, H) * 0.12, fill: brandColor(1, brandColor(0, '#f59e0b')) }));
  function addImageUrl(url, { fit = 0.6, then } = {}) {
    fabric.Image.fromURL(url, (img) => {
      if (!img || !img.width) return toast('No se pudo cargar la imagen', 'err');
      const s = Math.min((W * fit) / img.width, (H * fit) / img.height); img.scale(s); place(img); then?.(img);
    });
  }
  async function addLibraryImage() { const a = await pickAsset({ brandId: null, title: 'Elegir imagen de la biblioteca' }); if (a) addImageUrl(a.url); }
  function addLogo() {
    if (!designBrand?.logo) return toast('Esta marca no tiene logo oficial cargado (Identidad y logos).', 'err');
    addImageUrl(designBrand.logo.url, { fit: 0.25 });
  }
  function setBg(color) { canvas.setBackgroundColor(color, () => canvas.renderAll()); markDirty(); }

  function starterLayout() {
    canvas.setBackgroundColor('#ffffff', () => {});
    const bar = new fabric.Rect({ left: 0, top: 0, width: W, height: H * 0.04, fill: brandColor(0, '#6d5efc'), selectable: true }); canvas.add(bar);
    const t = new fabric.Textbox('Título principal', { left: W * 0.1, top: H * 0.12, width: W * 0.8, fontSize: Math.round(W * 0.08), fontWeight: 'bold', fontFamily: fontList[0], fill: '#111111', textAlign: 'center' }); canvas.add(t);
    const s = new fabric.Textbox('Texto de apoyo de la promoción', { left: W * 0.1, top: H * 0.26, width: W * 0.8, fontSize: Math.round(W * 0.04), fontFamily: fontList[0], fill: '#444444', textAlign: 'center' }); canvas.add(s);
    const btn = new fabric.Rect({ left: W * 0.25, top: H * 0.84, width: W * 0.5, height: H * 0.08, fill: brandColor(0, '#6d5efc'), rx: 14, ry: 14 }); canvas.add(btn);
    const bt = new fabric.Textbox('Llamado a la acción', { left: W * 0.25, top: H * 0.84 + H * 0.02, width: W * 0.5, fontSize: Math.round(W * 0.035), fontWeight: 'bold', fontFamily: fontList[0], fill: '#ffffff', textAlign: 'center' }); canvas.add(bt);
    if (designBrand?.logo) addImageUrl(designBrand.logo.url, { fit: 0.2, then: (img) => { img.set({ left: W * 0.1, top: H * 0.07 + img.getScaledHeight() / 2 }); canvas.renderAll(); } });
  }

  // ---------- panel de propiedades ----------
  function row(label, ...ctl) { return h('div', {}, h('label', {}, label), h('div', { class: 'row' }, ctl)); }
  function renderProps() {
    const o = canvas.getActiveObject();
    const kids = [h('h3', {}, 'Propiedades')];
    const swatches = (designBrand?.colors || []).map((c) => h('span', { class: 'swatch', title: c.name || c.hex, style: { background: c.hex }, onclick: () => { if (o) { o.set('fill', c.hex); canvas.renderAll(); markDirty(); renderProps(); } else setBg(c.hex); } }));
    if (!o) {
      kids.push(h('p', { class: 'muted small' }, 'Seleccione un elemento para editarlo, o cambie el fondo.'),
        row('Color de fondo', h('input', { type: 'color', value: typeof canvas.backgroundColor === 'string' && canvas.backgroundColor.startsWith('#') ? canvas.backgroundColor : '#ffffff', oninput: (e) => setBg(e.target.value) })));
      if (swatches.length) kids.push(h('label', {}, 'Colores de la marca'), h('div', { class: 'row' }, swatches));
    } else {
      const isText = o.type === 'textbox' || o.type === 'i-text' || o.type === 'text';
      if (isText) {
        kids.push(h('label', {}, 'Tipografía'), h('select', { value: o.fontFamily, onchange: (e) => { o.set('fontFamily', e.target.value); canvas.renderAll(); markDirty(); } }, fontList.map((f) => h('option', { value: f }, f))),
          row('Tamaño', h('input', { type: 'number', min: 8, max: 600, value: Math.round(o.fontSize), style: { width: '90px' }, oninput: (e) => { o.set('fontSize', Number(e.target.value) || 12); canvas.renderAll(); markDirty(); } }),
            h('button', { class: 'btn sm', onclick: () => { o.set('fontWeight', o.fontWeight === 'bold' ? 'normal' : 'bold'); canvas.renderAll(); markDirty(); } }, 'B'),
            ...['left', 'center', 'right'].map((al, i) => h('button', { class: 'btn sm', onclick: () => { o.set('textAlign', al); canvas.renderAll(); markDirty(); } }, ['⟸', '≡', '⟹'][i]))));
      }
      if (o.type !== 'image') kids.push(row('Color', h('input', { type: 'color', value: typeof o.fill === 'string' && /^#[0-9a-f]{6}$/i.test(o.fill) ? o.fill : '#000000', oninput: (e) => { o.set('fill', e.target.value); canvas.renderAll(); markDirty(); } })), swatches.length ? h('div', { class: 'row' }, swatches) : null);
      kids.push(row('Opacidad', h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: o.opacity ?? 1, oninput: (e) => { o.set('opacity', Number(e.target.value)); canvas.renderAll(); markDirty(); } })),
        h('label', {}, 'Orden y posición'),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => { canvas.bringToFront(o); markDirty(); } }, 'Al frente'),
          h('button', { class: 'btn sm', onclick: () => { canvas.sendToBack(o); markDirty(); } }, 'Al fondo'),
          h('button', { class: 'btn sm', onclick: () => { canvas.centerObjectH(o); o.setCoords(); canvas.renderAll(); markDirty(); } }, 'Centrar ↔'),
          h('button', { class: 'btn sm', onclick: () => { canvas.centerObjectV(o); o.setCoords(); canvas.renderAll(); markDirty(); } }, 'Centrar ↕')),
        h('div', { class: 'row', style: { marginTop: '10px' } },
          h('button', { class: 'btn sm', onclick: duplicate }, 'Duplicar'),
          h('button', { class: 'btn sm bad', onclick: removeSel }, 'Eliminar')));
    }
    props.replaceChildren(...kids.filter(Boolean));
  }
  function duplicate() { const o = canvas.getActiveObject(); if (!o) return; o.clone((c) => { c.set({ left: o.left + 30, top: o.top + 30 }); canvas.add(c); canvas.setActiveObject(c); canvas.requestRenderAll(); }); }
  function removeSel() { canvas.getActiveObjects().forEach((o) => canvas.remove(o)); canvas.discardActiveObject(); canvas.requestRenderAll(); }

  // ---------- versiones / plantillas ----------
  async function showVersions() {
    const vs = await api('GET', `/api/designs/${design.id}/versions`);
    const m = modal(h('div', {}, h('h2', {}, 'Versiones guardadas'), h('p', { class: 'muted small' }, `Versión actual: v${design.version}. Restaurar crea una nueva versión (no se pierde nada).`),
      vs.length ? h('table', {}, h('tbody', {}, vs.map((v) => h('tr', {}, h('td', {}, `v${v.version}`), h('td', {}, fmtDate(v.created_at)), h('td', {}, h('button', { class: 'btn sm', onclick: async () => { try { await api('POST', `/api/designs/${design.id}/restore/${v.version}`); m.close(); toast('Versión restaurada', 'ok'); location.reload(); } catch (e) { fail(e); } } }, 'Restaurar')))))) : h('div', { class: 'empty' }, 'Aún no hay versiones anteriores.'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cerrar'))));
  }
  async function saveTemplate() {
    if (dirty) await save();
    const name = await promptModal('Nombre de la plantilla', `Plantilla ${nameInp.value}`); if (!name) return;
    try { await api('POST', `/api/designs/${design.id}/template`, { name }); toast('Plantilla guardada (Proyectos → Plantillas)', 'ok'); } catch (e) { fail(e); }
  }
  async function dup() {
    if (dirty) await save();
    try { const d = await api('POST', '/api/designs', { from_design_id: design.id, name: `${nameInp.value} (copia)`, brand_id: design.brand_id }); location.hash = `#/design/${d.id}`; } catch (e) { fail(e); }
  }

  // ---------- montaje ----------
  const tool = (label, fn) => h('button', { class: 'btn', onclick: fn }, label);
  const left = h('div', { class: 'pane' }, h('h3', {}, 'Agregar'), h('div', { class: 'tools' },
    tool('＋ Texto', () => addText()), tool('▭ Rectángulo', addRect), tool('○ Círculo', addCircle),
    tool('🖼 Imagen de biblioteca', addLibraryImage), tool('★ Logo de la marca', addLogo)),
    h('p', { class: 'muted small', style: { marginTop: '14px' } }, `Lienzo: ${W}×${H} px`),
    h('p', { class: 'muted small' }, 'Doble clic en un texto para editarlo. Suprimir borra el elemento seleccionado.'));

  root.replaceChildren(
    h('div', { class: 'edbar' },
      h('a', { class: 'btn', href: '#/projects' }, '← Proyectos'), nameInp, statusEl, h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn', onclick: showVersions }, 'Versiones'), h('button', { class: 'btn', onclick: dup }, 'Duplicar'), h('button', { class: 'btn', onclick: saveTemplate }, 'Guardar como plantilla'),
      btnSave, btnApprove, h('span', { class: 'muted small' }, 'Exportar:'), ...expBtns),
    h('div', { class: 'ed' }, left, stage, props));
  nameInp.addEventListener('input', markDirty);

  canvas = new fabric.Canvas(canvasEl, { preserveObjectStacking: true, backgroundColor: '#ffffff', width: 400, height: 400 });
  ['object:modified', 'object:added', 'object:removed', 'text:changed'].forEach((ev) => canvas.on(ev, markDirty));
  ['selection:created', 'selection:updated', 'selection:cleared'].forEach((ev) => canvas.on(ev, renderProps));
  const onKey = (e) => {
    if (!canvas || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
    const o = canvas.getActiveObject(); if (o?.isEditing) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { removeSel(); e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { duplicate(); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey);
  const onResize = () => applyZoom(); window.addEventListener('resize', onResize);

  await new Promise((resolve) => canvas.loadFromJSON(design.json, resolve));
  await new Promise((r) => requestAnimationFrame(r));
  applyZoom();
  if (starter && canvas.getObjects().length === 0) starterLayout();
  await new Promise((r) => setTimeout(r, 400)); // deja terminar la carga de imágenes
  loading = false; dirty = Boolean(starter && canvas.getObjects().length > 0 && design.version === 1);
  refreshBar(); renderProps();
  window.__editor = { canvas, get dirty() { return dirty; } }; // útil para pruebas
  return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); canvas.dispose(); delete window.__editor; };
}
