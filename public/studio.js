'use strict';
/* Páginas: Video y Reels, Música y audio, Voz IA, Marketing / Instagram / Google. Usa h(), api(), toast()... de ui.js y S/brand() de app.js */

const IMG_KINDS = ['product', 'photo', 'background', 'material', 'other', 'generated', 'export', 'logo'];
const copyText = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado', 'ok'); } catch { const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, t); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copiado', 'ok'); } };
const ffmpegHelp = 'Instale FFmpeg (gratis): Windows → winget install Gyan.FFmpeg · macOS → brew install ffmpeg · Linux → sudo apt install ffmpeg. Luego reinicie Estudio.';

/* ---------------- VIDEO Y REELS ---------------- */
async function pVideo(mode) {
  const b = brand();
  const [conns, vfmts, audios, past] = await Promise.all([api('GET', '/api/connectors'), api('GET', '/api/video-formats'), api('GET', '/api/assets?kind=audio'), api('GET', '/api/assets?kind=video')]);
  const ff = conns.active.find((c) => c.id === 'ffmpeg');
  const st = { layout: 'card', line: '', scenes: [], transition: 'fade', tsec: 0.5, motion: true, musicId: '', musicVol: 0.5, voiceId: '', voiceVol: 1, logo: false, wa: Boolean(b?.business?.whatsapp_pedidos), job: null };
  try { const sc = JSON.parse(sessionStorage.getItem('reelScript') || 'null'); if (sc) { sessionStorage.removeItem('reelScript'); st.scenes = sc.escenas.map((e) => ({ asset: null, seconds: e.segundos, caption: e.texto_en_pantalla })); st.name = sc.titulo; st.fromScript = true; } } catch { /* sin guion */ }
  const fmt = h('select', { id: 'v-format', value: mode === 'reels' ? 'reel' : 'reel' }, Object.entries(vfmts).filter(([k]) => mode !== 'reels' || k === 'reel').map(([k, f]) => h('option', { value: k }, f.label)));
  const nameInp = h('input', { type: 'text', id: 'v-name', placeholder: 'Nombre del video (opcional)', value: st.name || '' });
  const list = h('div'); const summary = h('div', { class: 'muted small' }); const out = h('div'); const bar = h('div');

  const total = () => { const n = st.scenes.length; const td = st.transition === 'fade' && n > 1 ? st.tsec : 0; return Math.max(0, st.scenes.reduce((a, s) => a + s.seconds, 0) - (n - 1) * td); };
  function drawScenes() {
    list.replaceChildren(...(st.scenes.length ? st.scenes.map((s, i) => h('div', { class: 'card', style: { padding: '10px', marginBottom: '8px' } }, h('div', { class: 'row' },
      s.asset ? h('img', { src: s.asset.thumb_url, alt: '', style: { width: '56px', height: '56px', objectFit: 'contain', borderRadius: '8px', background: '#f0f1f7', cursor: 'pointer' }, onclick: () => pickFor(i) }) : h('button', { class: 'btn sm', onclick: () => pickFor(i) }, 'Elegir foto'),
      h('div', { style: { flex: 1, minWidth: '160px' } }, h('input', { type: 'text', class: 'v-caption', placeholder: 'Texto en pantalla (opcional)', value: s.caption, oninput: (e) => { s.caption = e.target.value; } })),
      h('select', { class: 'v-rot', title: 'Girar foto', style: { width: '92px' }, value: s.rotate || 0, onchange: (e) => { s.rotate = Number(e.target.value); } }, [0, 90, 180, 270].map((d) => h('option', { value: d }, d ? `Girar ${d}°` : 'Sin girar'))),
      h('select', { class: 'v-zoom', title: 'Acercar foto', style: { width: '92px' }, value: s.zoom || 1, onchange: (e) => { s.zoom = Number(e.target.value); } }, [1, 1.15, 1.3, 1.5].map((z) => h('option', { value: z }, z === 1 ? 'Sin zoom' : `Zoom ${z}×`))),
      h('label', { style: { margin: 0, fontWeight: 400 } }, 'Seg.'), h('input', { type: 'number', class: 'v-secs', min: 1, max: 15, step: 0.5, value: s.seconds, style: { width: '70px' }, oninput: (e) => { s.seconds = Number(e.target.value) || 3; sum(); } }),
      h('button', { class: 'btn sm', disabled: i === 0, title: 'Subir', onclick: () => { [st.scenes[i - 1], st.scenes[i]] = [st.scenes[i], st.scenes[i - 1]]; drawScenes(); } }, '↑'),
      h('button', { class: 'btn sm', disabled: i === st.scenes.length - 1, title: 'Bajar', onclick: () => { [st.scenes[i + 1], st.scenes[i]] = [st.scenes[i], st.scenes[i + 1]]; drawScenes(); } }, '↓'),
      h('button', { class: 'btn sm bad', title: 'Quitar', onclick: () => { st.scenes.splice(i, 1); drawScenes(); } }, '✕')))) : [h('div', { class: 'empty' }, 'Aún no hay escenas. Agregue fotos de su biblioteca.')]));
    sum();
  }
  const sum = () => summary.replaceChildren(`${st.scenes.length} escena(s) · duración total ≈ ${total().toFixed(1)} s${st.transition === 'fade' && st.scenes.length > 1 ? ' (ya descontadas las transiciones)' : ''}`);
  async function pickFor(i) { const a = await pickAsset({ kinds: IMG_KINDS, brandId: null, title: 'Elegir foto para la escena' }); if (a) { st.scenes[i].asset = a; drawScenes(); } }
  async function addScene() { const a = await pickAsset({ kinds: IMG_KINDS, brandId: null, title: 'Agregar escena: elegir foto' }); if (a) { st.scenes.push({ asset: a, seconds: 3, caption: '' }); drawScenes(); } }

  const audioSel = (id, role, key) => h('select', { id, value: st[key], onchange: (e) => { st[key] = e.target.value; } }, h('option', { value: '' }, role === 'music' ? 'Sin música' : 'Sin voz'),
    audios.filter((a) => (role === 'voice') === Boolean(a.meta.voice) || role === 'any').map((a) => h('option', { value: a.id }, `${a.name} (${a.meta.duration ?? '?'} s)${a.meta.license_confirmed ? '' : ' ⚠ sin licencia'}`)));
  const vol = (key, id) => h('input', { type: 'range', id, min: 0, max: 1.5, step: 0.05, value: st[key], oninput: (e) => { st[key] = Number(e.target.value); } });
  const trans = h('select', { id: 'v-trans', value: st.transition, onchange: (e) => { st.transition = e.target.value; sum(); } }, h('option', { value: 'fade' }, 'Fundido suave'), h('option', { value: 'none' }, 'Corte directo'));
  const motion = h('input', { type: 'checkbox', id: 'v-motion', checked: true, onchange: (e) => { st.motion = e.target.checked; } });
  const logo = h('input', { type: 'checkbox', id: 'v-logo', checked: false, disabled: !b?.logo, onchange: (e) => { st.logo = e.target.checked; } });
  const wa = h('input', { type: 'checkbox', id: 'v-wa', checked: st.wa, disabled: !b?.business?.whatsapp_pedidos, onchange: (e) => { st.wa = e.target.checked; } });

  const makeBtn = (label, draft, id, cls) => h('button', { class: `btn ${cls}`, id, disabled: !ff.configured, onclick: () => start(draft) }, label);
  async function start(draft) {
    const bad = st.scenes.findIndex((s) => !s.asset);
    if (bad >= 0) return toast(`La escena ${bad + 1} necesita una foto.`, 'err');
    const body = { brand_id: b?.id, name: nameInp.value, format: fmt.value, scenes: st.scenes.map((s) => ({ asset_id: s.asset.id, seconds: s.seconds, caption: s.caption, rotate: s.rotate || 0, zoom: s.zoom || 1 })), layout: st.layout, line: st.line, transition: st.transition, transition_seconds: st.tsec, motion: st.motion,
      music_asset_id: st.musicId || undefined, music_volume: st.musicVol, voice_asset_id: st.voiceId || undefined, voice_volume: st.voiceVol, use_logo: st.logo, use_whatsapp: st.wa, draft };
    out.replaceChildren(); document.querySelectorAll('#v-prev,#v-final').forEach((x) => { x.disabled = true; });
    const prog = h('div', { style: { height: '10px', background: '#e3e5ef', borderRadius: '99px', overflow: 'hidden' } }, h('div', { id: 'v-bar', style: { height: '100%', width: '2%', background: 'var(--brand)', transition: 'width .3s' } }));
    bar.replaceChildren(h('p', { class: 'small muted' }, draft ? 'Creando vista previa rápida…' : 'Creando el video final… puede tardar unos minutos en un PC sin GPU.'), prog);
    try {
      const { job_id } = await api('POST', '/api/videos', body);
      for (;;) {
        await new Promise((r) => setTimeout(r, 700));
        const j = await api('GET', `/api/videos/jobs/${job_id}`); const el = $('#v-bar'); if (el) el.style.width = `${Math.max(2, Math.round(j.progress * 100))}%`;
        if (j.status === 'done') { st.last = j.asset; showResult(j.asset); break; }
        if (j.status === 'error') throw new Error(j.error);
      }
    } catch (e) { fail(e); } finally { bar.replaceChildren(); document.querySelectorAll('#v-prev,#v-final').forEach((x) => { x.disabled = !ff.configured; }); }
  }
  async function setStatus(a, status) { try { const u = await api('PATCH', `/api/assets/${a.id}`, { status }); showResult(u); toast(status === 'approved' ? 'Video aprobado' : 'Video rechazado', 'ok'); } catch (e) { fail(e); } }
  function showResult(a) {
    out.replaceChildren(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h2', {}, a.meta.draft ? 'Vista previa' : 'Resultado'), statusBadge(a.status)),
      h('video', { id: 'v-player', controls: true, playsinline: true, src: a.url, style: { maxWidth: '100%', maxHeight: '70vh', borderRadius: '10px', background: '#000', display: 'block', margin: '0 auto' } }),
      h('p', { class: 'small muted' }, `${a.width}×${a.height} · ${a.meta.duration} s · ${fmtSize(a.bytes)}`),
      ...(a.meta.warnings || []).map((w) => h('div', { class: 'note', style: { marginTop: '6px' } }, w)),
      a.meta.draft ? h('div', { class: 'note info', style: { marginTop: '6px' } }, 'Esto es una vista previa de baja calidad. Si le gusta, pulse «Crear video final».') : null,
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'btn ok', id: 'v-approve', disabled: a.meta.draft, onclick: () => setStatus(a, 'approved') }, 'Aprobar'), h('button', { class: 'btn bad', disabled: a.meta.draft, onclick: () => setStatus(a, 'rejected') }, 'Rechazar'),
        h('a', { class: 'btn', href: `/api/assets/${a.id}/download` }, 'Descargar MP4'))));
  }

  drawScenes();
  const title = mode === 'reels' ? 'Reels' : 'Estudio de video';
  return h('div', {}, h('h1', {}, title), h('p', { class: 'muted' }, `${b?.name || ''}. Arme el video con sus fotos reales. Todo se hace en su equipo, gratis. Nada se publica sin su aprobación.`),
    ff.configured ? null : h('div', { class: 'note', style: { margin: '10px 0' } }, `FFmpeg no está disponible: ${ffmpegHelp}`),
    st.fromScript ? h('div', { class: 'note info', style: { margin: '10px 0' } }, 'Cargué el guion: elija una foto para cada escena.') : null,
    h('div', { class: 'grid g2', style: { marginTop: '12px', alignItems: 'start' } },
      h('div', { class: 'card' }, h('h2', {}, '1. Escenas'), list, h('div', { class: 'row' }, h('button', { class: 'btn', id: 'v-add', onclick: addScene }, '＋ Agregar escena')), summary),
      h('div', { class: 'card' }, h('h2', {}, '2. Ajustes'), h('label', {}, 'Nombre'), nameInp, h('label', {}, 'Formato'), fmt,
        h('label', {}, 'Estilo'), h('select', { id: 'v-layout', value: st.layout, onchange: (e) => { st.layout = e.target.value; } }, h('option', { value: 'card' }, 'Tarjeta Print Clean (recomendado)'), h('option', { value: 'simple' }, 'Simple: foto sobre fondo')),
        h('label', {}, 'Instagram en la banda (no se mezclan)'), h('select', { id: 'v-line', onchange: (e) => { st.line = e.target.value; } }, h('option', { value: '' }, 'Sin Instagram'), h('option', { value: 'suministros' }, 'Suministros'), h('option', { value: 'aseo' }, 'Aseo y limpieza')),
        h('label', {}, 'Transición entre escenas'), trans, h('label', { class: 'row', style: { fontWeight: 400 } }, motion, 'Movimiento suave (zoom lento) en cada foto'),
        h('label', { class: 'row', style: { fontWeight: 400 } }, logo, b?.logo ? 'Incluir logo oficial' : 'Incluir logo (cárguelo en Identidad y logos)'),
        h('label', { class: 'row', style: { fontWeight: 400 } }, wa, b?.business?.whatsapp_pedidos ? `Incluir WhatsApp de pedidos (${b.business.whatsapp_pedidos})` : 'Incluir WhatsApp (cárguelo en Identidad y logos)'),
        h('h3', { style: { marginTop: '14px' } }, '3. Audio'), h('label', {}, 'Música (solo audios con licencia confirmada)'), audioSel('v-music', 'music', 'musicId'), h('label', {}, 'Volumen de la música'), vol('musicVol', 'v-mvol'),
        h('label', {}, 'Locución / voz'), audioSel('v-voice', 'voice', 'voiceId'), h('label', {}, 'Volumen de la voz'), vol('voiceVol', 'v-vvol'),
        h('p', { class: 'small muted' }, audios.length ? 'Suba más audios en «Música y audio» o «Voz IA».' : 'No hay audios todavía: suba música con licencia en «Música y audio».'),
        h('div', { class: 'row', style: { marginTop: '12px' } }, makeBtn('Vista previa rápida', true, 'v-prev', ''), makeBtn('Crear video final', false, 'v-final', 'p')))),
    bar, out,
    h('h2', { style: { marginTop: '24px' } }, `Videos creados (${past.length})`),
    past.length ? h('div', { class: 'grid gauto' }, past.map((a) => h('div', { class: 'card item' }, a.thumb_url ? h('a', { href: a.url, target: '_blank' }, h('img', { class: 'thumb', src: a.thumb_url, alt: a.name })) : null, h('div', { class: 't', title: a.name }, a.name), h('div', { class: 'small muted' }, `${a.meta.duration ?? '?'} s · ${fmtSize(a.bytes)}`), statusBadge(a.status), a.meta.draft ? h('span', { class: 'badge' }, 'Vista previa') : null,
      h('div', { class: 'acts' }, h('a', { class: 'btn sm', href: `/api/assets/${a.id}/download` }, 'Descargar'), h('button', { class: 'btn sm', onclick: () => { st.last = a; showResult(a); window.scrollTo({ top: out.offsetTop - 80, behavior: 'smooth' }); } }, 'Ver'))))) : h('div', { class: 'empty' }, 'Aún no hay videos.'));
}

/* ---------------- MÚSICA Y AUDIO / VOZ IA ---------------- */
function audioList(items, reload, { voice }) {
  return items.length ? h('div', { class: 'grid g2' }, items.map((a) => h('div', { class: 'card', style: { padding: '12px' } },
    h('div', { class: 't', style: { fontWeight: 600 } }, a.name), h('div', { class: 'small muted' }, `${a.meta.duration ?? '?'} s${a.meta.license_note ? ' · ' + a.meta.license_note : ''}`),
    h('audio', { controls: true, src: a.url, style: { width: '100%', marginTop: '6px' } }),
    h('div', { class: 'row', style: { marginTop: '6px' } }, a.meta.license_confirmed ? h('span', { class: 'badge ok' }, 'Licencia comercial confirmada') : h('span', { class: 'badge warn' }, 'Licencia sin confirmar'),
      !a.meta.license_confirmed ? h('button', { class: 'btn sm', onclick: async () => { if (await confirmModal('¿Confirma que tiene derechos de uso comercial de este audio (voz y motor verificados)?', 'Sí, confirmo')) { try { await api('POST', `/api/assets/${a.id}/confirm-license`, {}); reload(); } catch (e) { fail(e); } } } }, 'Confirmar licencia') : null,
      h('a', { class: 'btn sm', href: `/api/assets/${a.id}/download` }, 'Descargar'),
      h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmModal(`¿Eliminar «${a.name}»?`, 'Eliminar', true)) { try { await api('DELETE', `/api/assets/${a.id}`); reload(); } catch (e) { fail(e); } } } }, 'Eliminar'))))) : h('div', { class: 'empty' }, voice ? 'Aún no hay locuciones.' : 'Aún no hay audios.');
}
function audioUploadCard({ voice, reload }) {
  const file = h('input', { type: 'file', id: 'au-file', accept: 'audio/mpeg,audio/wav,audio/mp4,audio/ogg,.mp3,.wav,.m4a,.ogg' });
  const lic = h('input', { type: 'checkbox', id: 'au-lic' }); const note = h('input', { type: 'text', id: 'au-note', placeholder: voice ? 'Ej. grabación propia de Michael' : 'Ej. pista libre de derechos, origen y licencia' });
  const go = async () => {
    if (!file.files[0]) return toast('Elija el archivo de audio', 'err');
    const f = new FormData(); f.append('file', file.files[0]); f.append('kind', 'audio'); if (brand()) f.append('brand_id', brand().id); f.append('license_confirmed', lic.checked ? '1' : '0'); f.append('license_note', note.value); if (voice) f.append('voice', '1'); f.append('name', file.files[0].name);
    try { await api('POST', '/api/assets', f); toast('Audio guardado', 'ok'); reload(); } catch (e) { fail(e); }
  };
  return h('div', { class: 'card' }, h('h3', {}, voice ? 'Subir su propia grabación' : 'Subir música o efectos'), h('label', {}, 'Archivo (MP3, WAV, M4A u OGG)'), file,
    h('label', { class: 'row', style: { fontWeight: 400, alignItems: 'flex-start' } }, lic, 'Confirmo que tengo derechos de uso comercial de este audio (no se usa música protegida sin autorización).'),
    h('label', {}, 'Origen / licencia'), note, h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn p', id: 'au-go', onclick: go }, 'Subir audio')));
}
async function pMusic() {
  const render = async () => { const items = (await api('GET', '/api/assets?kind=audio')).filter((a) => !a.meta.voice); box.replaceChildren(audioList(items, render, { voice: false })); };
  const box = h('div'); await render();
  return h('div', {}, h('h1', {}, 'Música y audio'), h('p', { class: 'muted' }, 'Suba pistas con licencia comercial para usarlas en sus videos.'),
    h('div', { class: 'note', style: { margin: '10px 0' } }, 'Estudio todavía no genera música con IA: la mayoría de los modelos abiertos prohíben el uso comercial. Use música libre de derechos o con licencia que usted verificó.'),
    audioUploadCard({ voice: false, reload: render }), h('h2', { style: { marginTop: '20px' } }, 'Biblioteca de audio'), box);
}
async function pVoice() {
  const conns = (await api('GET', '/api/connectors')).active; const piper = conns.find((c) => c.id === 'piper');
  const render = async () => { const items = (await api('GET', '/api/assets?kind=audio')).filter((a) => a.meta.voice); box.replaceChildren(audioList(items, render, { voice: true })); };
  const box = h('div'); await render();
  const text = h('textarea', { id: 'voice-text', placeholder: 'Escriba la locución (máx. 1500 caracteres). Evite números que no estén confirmados.' }); const name = h('input', { type: 'text', id: 'voice-name', placeholder: 'Nombre (opcional)' });
  const gen = h('button', { class: 'btn p', id: 'voice-go', disabled: !piper.configured, onclick: async () => {
    gen.disabled = true; gen.textContent = 'Generando…';
    try { await api('POST', '/api/voice', { text: text.value, name: name.value, brand_id: brand()?.id }); toast('Locución creada. Revise y confirme la licencia de la voz.', 'ok'); render(); } catch (e) { fail(e); } finally { gen.disabled = !piper.configured; gen.textContent = 'Generar locución'; }
  } }, 'Generar locución');
  return h('div', {}, h('h1', {}, 'Voz IA'), h('p', { class: 'muted' }, 'Locuciones para sus videos, gratis y en su equipo.'),
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card' }, h('h3', {}, 'Generar con voz sintética (Piper)'),
        piper.configured ? h('div', { class: 'note info' }, piper.note) : h('div', { class: 'note' }, h('b', {}, 'Piper no está configurado. '), 'Opcional: descargue Piper y una voz en español, y defina PIPER_PATH y PIPER_MODEL en .env (guía en docs/VIDEO_Y_AUDIO.md). Mientras tanto, suba su propia grabación.'),
        h('label', {}, 'Texto'), text, h('label', {}, 'Nombre'), name, h('div', { style: { marginTop: '10px' } }, gen), h('p', { class: 'small' }, h('a', { href: '#/marketing' }, 'Escribir el guion con IA en Marketing'))),
      audioUploadCard({ voice: true, reload: render })),
    h('h2', { style: { marginTop: '20px' } }, 'Locuciones'), box);
}

/* ---------------- MARKETING / INSTAGRAM / GOOGLE ---------------- */
const MK_PRESET = {
  marketing: { title: 'Marketing', kinds: ['campaign_ideas', 'captions', 'reel_script', 'calendar', 'ad_variants'], intro: 'Ideas, textos, guiones y calendarios con IA local (Ollama).' },
  instagram: { title: 'Instagram', kinds: ['captions', 'reel_script', 'calendar'], intro: 'Textos de publicaciones, guiones de Reels y calendario. Máx. 2.200 caracteres y 30 hashtags por publicación.' },
  google: { title: 'Google Ads', kinds: ['ad_variants'], intro: 'Variantes de anuncios: título hasta 30 caracteres y descripción hasta 90 (formato de anuncios responsivos de búsqueda).' },
};
async function pMarketing(preset) {
  const P = MK_PRESET[preset]; const b = brand();
  const [conns, labels] = await Promise.all([api('GET', '/api/connectors'), api('GET', '/api/ai/marketing-kinds')]);
  const oll = conns.active.find((c) => c.id === 'ollama'); const models = (oll.models || []).filter((m) => !/flux|z-image|diffusion|sdxl|\bsd\b/i.test(m.name));
  const kind = h('select', { id: 'mk-kind' }, P.kinds.map((k) => h('option', { value: k }, labels[k])));
  const line = h('select', { id: 'mk-line' }, h('option', { value: '' }, 'Sin línea específica'), h('option', { value: 'suministros' }, 'Suministros de impresora (tóner y tintas)'), h('option', { value: 'aseo' }, 'Aseo y limpieza'));
  const audience = h('input', { type: 'text', id: 'mk-aud', placeholder: 'Ej. oficinas y empresas de Santiago' });
  const notes = h('textarea', { id: 'mk-notes', placeholder: 'Lo que usted sabe y confirmó: producto, novedad, promoción con sus datos reales… La IA no inventará precios, cifras ni características.' });
  const modelSel = h('select', { id: 'mk-model', value: models.some((m) => m.name === oll.defaults?.text) ? oll.defaults.text : undefined }, models.length ? models.map((m) => h('option', { value: m.name }, m.name)) : [h('option', { value: '' }, 'No hay modelos instalados')]);
  const out = h('div');
  const go = h('button', { class: 'btn p', id: 'mk-go', disabled: !oll.configured || !models.length, onclick: async () => {
    go.disabled = true; go.textContent = 'Pensando… (puede tardar en un PC sin GPU)'; out.replaceChildren();
    try { const r = await api('POST', '/api/ai/marketing', { brand_id: b?.id, kind: kind.value, model: modelSel.value, line: line.value, audience: audience.value, notes: notes.value }); render(r); }
    catch (e) { fail(e); } finally { go.disabled = !oll.configured || !models.length; go.textContent = 'Generar'; }
  } }, 'Generar');
  const cnt = (t, max) => h('span', { class: `small ${t.length > max ? 'badge bad' : 'muted'}` }, ` ${t.length}/${max}`);
  const copyBtn = (t) => h('button', { class: 'btn sm', onclick: () => copyText(t) }, 'Copiar');
  function render(r) {
    const foot = h('p', { class: 'small muted' }, `Modelo: ${r.model}.${r.discarded ? ` Se descartaron ${r.discarded} opción(es) que rompían reglas (palabras prohibidas, cifras inventadas o límites).` : ''} Revise todo antes de usar. Estudio no publica: copie y publique desde su panel.`);
    let body;
    if (r.kind === 'captions') body = r.items.map((o, i) => h('div', { class: 'card', style: { marginTop: '10px' } }, h('b', {}, `Opción ${i + 1}`), h('p', { style: { whiteSpace: 'pre-wrap' } }, o.texto, cnt(o.texto, r.limits.igCaption)), h('p', { class: 'small' }, o.hashtags.join(' ')), h('p', { class: 'small muted' }, `Llamado a la acción: ${o.llamado_a_la_accion}`), copyBtn(`${o.texto}\n\n${o.hashtags.join(' ')}`)));
    else if (r.kind === 'ad_variants') body = r.items.map((o, i) => h('div', { class: 'card', style: { marginTop: '10px' } }, h('b', {}, `Variante ${i + 1}`), h('p', {}, h('b', {}, o.titulo), cnt(o.titulo, r.limits.adTitle)), h('p', {}, o.descripcion, cnt(o.descripcion, r.limits.adDescription)), h('p', { class: 'small muted' }, `Botón: ${o.cta}`), copyBtn(`${o.titulo}\n${o.descripcion}`)));
    else if (r.kind === 'reel_script') { const sc = r.items[0]; body = [h('div', { class: 'card', style: { marginTop: '10px' } }, h('b', {}, sc.titulo), h('table', {}, h('thead', {}, h('tr', {}, ['#', 'Texto en pantalla', 'Locución', 'Seg.'].map((x) => h('th', {}, x)))), h('tbody', {}, sc.escenas.map((e, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, e.texto_en_pantalla), h('td', {}, e.locucion), h('td', {}, e.segundos))))),
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn p', id: 'mk-to-reel', onclick: () => { sessionStorage.setItem('reelScript', JSON.stringify(sc)); location.hash = '#/reels'; } }, 'Crear Reel con este guion'), copyBtn(sc.escenas.map((e, i) => `${i + 1}. ${e.texto_en_pantalla} — ${e.locucion}`).join('\n'))))]; }
    else if (r.kind === 'calendar') body = [h('div', { class: 'card', style: { marginTop: '10px' } }, h('table', {}, h('thead', {}, h('tr', {}, ['Día', 'Formato', 'Idea', 'Texto'].map((x) => h('th', {}, x)))), h('tbody', {}, r.items[0].dias.map((d) => h('tr', {}, h('td', {}, d.dia), h('td', {}, d.formato), h('td', {}, d.idea), h('td', {}, d.texto))))), h('div', { style: { marginTop: '10px' } }, copyBtn(r.items[0].dias.map((d) => `${d.dia} (${d.formato}): ${d.idea}\n${d.texto}`).join('\n\n'))))];
    else body = r.items.map((o) => h('div', { class: 'card', style: { marginTop: '10px' } }, h('b', {}, o.nombre), h('p', { class: 'small' }, `Objetivo: ${o.objetivo}`), h('p', { class: 'small' }, `Público: ${o.publico}`), h('p', {}, o.mensaje), copyBtn(`${o.nombre}\nObjetivo: ${o.objetivo}\nPúblico: ${o.publico}\n${o.mensaje}`)));
    out.replaceChildren(h('h2', { style: { marginTop: '18px' } }, r.label), ...body, foot);
  }
  return h('div', {}, h('h1', {}, P.title), h('p', { class: 'muted' }, P.intro),
    oll.configured && models.length ? null : h('div', { class: 'note', style: { margin: '10px 0' } }, `La IA de textos no está disponible: ${oll.configured ? 'no hay modelos instalados (ollama pull gemma4:e2b).' : oll.note} Guía en Conectores y docs/OLLAMA.md.`),
    h('div', { class: 'grid g2', style: { alignItems: 'start', marginTop: '10px' } },
      h('div', { class: 'card' }, P.kinds.length > 1 ? [h('label', {}, 'Qué quiere crear'), kind] : null, h('label', {}, 'Línea / cuenta (no se mezclan)'), line, h('label', {}, 'Público objetivo'), audience, h('label', {}, 'Notas confirmadas'), notes, h('label', {}, 'Modelo'), modelSel, h('div', { style: { marginTop: '12px' } }, go)),
      h('div', {}, h('div', { class: 'note info' }, 'Reglas aplicadas por el sistema: nunca «original» en tóner/tintas; sin precios, descuentos ni cifras que usted no haya escrito en las notas; límites de cada plataforma.'), out)));
}
