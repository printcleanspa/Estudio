'use strict';
/**
 * Montaje de video (Reels, historias, videos cuadrados y horizontales) con FFmpeg local.
 * Cada escena se compone primero como imagen (foto original intacta + fondo de marca + texto + logo + WhatsApp)
 * y luego FFmpeg las une con transiciones, movimiento suave, música y voz, y exporta MP4 (H.264 + AAC).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ffmpeg = require('./connectors/ffmpeg');
const { compose, composeCard, composeCutout } = require('./connectors/local-compose');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const VIDEO_FORMATS = {
  reel: { label: 'Reel / Historia 9:16 (1080x1920)', w: 1080, h: 1920 },
  square: { label: 'Cuadrado 1:1 (1080x1080)', w: 1080, h: 1080 },
  wide: { label: 'Horizontal 16:9 (1920x1080)', w: 1920, h: 1080 },
};
const FPS = 30;
const LIMITS = { maxScenes: 20, minSeconds: 1, maxSeconds: 15, maxTotal: 180 };
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * @param {object} p
 * @param {Array<{buffer:Buffer, seconds:number, caption:string}>} p.scenes
 * @param {object} p.format  { w, h }
 * @param {boolean} p.draft  vista previa (mitad de tamaño, más rápido)
 * @param {string} p.transition 'fade'|'none'  @param {number} p.transitionSeconds
 * @param {boolean} p.motion  movimiento suave (zoom)
 * @param {string|null} p.musicFile @param {number} p.musicVolume @param {string|null} p.voiceFile @param {number} p.voiceVolume
 * @param {object} p.style { bg, textColor, font, logoBuffer, footer }
 * @param {Function} p.onProgress (0..1)
 */
async function renderVideo(p) {
  const env = p.env || process.env;
  const n = p.scenes.length;
  if (n < 1 || n > LIMITS.maxScenes) throw httpErr(400, `Use entre 1 y ${LIMITS.maxScenes} escenas.`);
  for (const s of p.scenes) if (!(s.seconds >= LIMITS.minSeconds && s.seconds <= LIMITS.maxSeconds)) throw httpErr(400, `Cada escena debe durar entre ${LIMITS.minSeconds} y ${LIMITS.maxSeconds} segundos.`);
  const scale = p.draft ? 0.5 : 1;
  const W = even(p.format.w * scale), H = even(p.format.h * scale);
  const useFade = p.transition === 'fade' && n > 1;
  const td = useFade ? Math.min(Math.max(Number(p.transitionSeconds) || 0.5, 0.2), 1.5) : 0;
  if (useFade && p.scenes.some((s) => s.seconds <= td + 0.2)) throw httpErr(400, 'Cada escena debe durar más que la transición.');
  const total = p.scenes.reduce((a, s) => a + s.seconds, 0) - (n - 1) * td;
  if (total > LIMITS.maxTotal) throw httpErr(400, `El video no puede superar ${LIMITS.maxTotal} segundos.`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-video-'));
  try {
    // 1) Componer cada escena como imagen (reutiliza la composición local: la foto del producto no se altera)
    const frames = [];
    for (let i = 0; i < n; i++) {
      const s = p.scenes[i];
      const r = p.style.card && p.style.card.mode === 'cutout'
        ? await composeCutout({ width: W, height: H, cutoutBuffer: s.buffer, logoBuffer: p.style.logoBuffer, headline: s.caption || '', subline: s.subcaption || '', badgeTop: s.badgeTop, badgeMain: s.badgeMain, footerLines: s.hideFooter ? [] : p.style.card.footerLines, palette: p.style.card.palette })
        : p.style.card
        ? await composeCard({ width: W, height: H, photoBuffer: s.buffer, logoBuffer: p.style.logoBuffer, headline: s.caption || '', subline: s.subcaption || '', footerLines: s.hideFooter ? [] : p.style.card.footerLines, palette: p.style.card.palette, rotate: s.rotate, zoom: s.zoom, fx: s.fx, fy: s.fy, badgeTop: s.badgeTop, badgeMain: s.badgeMain, ribbon: s.ribbon, compact: Boolean(p.style.card.compact) })
        : await compose({ width: W, height: H, productBuffer: s.buffer, logoBuffer: p.style.logoBuffer, bg: p.style.bg, headline: s.caption || '', subline: '', footer: p.style.footer || '', textColor: p.style.textColor, font: p.style.font, layout: s.caption ? 'text-bottom' : 'center' });
      const f = path.join(tmp, `scene-${i}.png`); fs.writeFileSync(f, r.buffer); frames.push(f);
      if (i === 0) p.thumbBuffer = r.buffer;
    }

    // 2) Construir el comando FFmpeg
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats'];
    for (let i = 0; i < n; i++) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(p.scenes[i].seconds), '-i', frames[i]);
    let idx = n; const musicIdx = p.musicFile ? idx++ : -1; const voiceIdx = p.voiceFile ? idx++ : -1;
    if (p.musicFile) args.push('-stream_loop', '-1', '-i', p.musicFile);
    if (p.voiceFile) args.push('-i', p.voiceFile);

    const f = [];
    for (let i = 0; i < n; i++) {
      const frames30 = Math.round(p.scenes[i].seconds * FPS);
      f.push(p.motion
        ? `[${i}:v]scale=${W * 2}:${H * 2},zoompan=z='min(1+0.0004*on,${p.style.card ? 1.035 : 1.12})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1[v${i}]`
        : `[${i}:v]scale=${W}:${H},fps=${FPS},format=yuv420p,setsar=1[v${i}]`);
      void frames30;
    }
    if (n === 1) f.push('[v0]null[vout]');
    else if (useFade) {
      let acc = p.scenes[0].seconds, prev = 'v0';
      for (let k = 1; k < n; k++) {
        const out = k === n - 1 ? 'vout' : `x${k}`;
        f.push(`[${prev}][v${k}]xfade=transition=fade:duration=${td}:offset=${(acc - td).toFixed(3)}[${out}]`);
        acc += p.scenes[k].seconds - td; prev = out;
      }
    } else f.push(`${p.scenes.map((_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[vout]`);

    const fadeOut = Math.min(1.5, total / 3);
    const tr = total.toFixed(3);
    if (musicIdx >= 0 && voiceIdx >= 0) {
      f.push(`[${musicIdx}:a]atrim=0:${tr},asetpts=PTS-STARTPTS,volume=${p.musicVolume},afade=t=out:st=${(total - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}[m]`);
      f.push(`[${voiceIdx}:a]volume=${p.voiceVolume}[vo]`);
      f.push(`[m][vo]amix=inputs=2:duration=longest:normalize=0,atrim=0:${tr},asetpts=PTS-STARTPTS[aout]`);
    } else if (musicIdx >= 0) {
      f.push(`[${musicIdx}:a]atrim=0:${tr},asetpts=PTS-STARTPTS,volume=${p.musicVolume},afade=t=out:st=${(total - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}[aout]`);
    } else if (voiceIdx >= 0) {
      f.push(`[${voiceIdx}:a]volume=${p.voiceVolume},apad,atrim=0:${tr},asetpts=PTS-STARTPTS[aout]`);
    } else {
      args.push('-f', 'lavfi', '-t', tr, '-i', 'anullsrc=r=44100:cl=stereo'); // pista de audio silenciosa por compatibilidad
      f.push(`[${idx}:a]anull[aout]`);
    }
    const outFile = path.join(tmp, 'salida.mp4');
    args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', p.draft ? '28' : '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', '-t', tr, outFile);

    await ffmpeg.run(ffmpeg.ffmpegBin(env), args, {
      timeout: 15 * 60 * 1000,
      onStdoutLine: (line) => { const m = /^out_time_(?:us|ms)=(\d+)/.exec(line); if (m && p.onProgress) p.onProgress(Math.min(0.99, Number(m[1]) / 1e6 / total)); },
    });
    const buffer = fs.readFileSync(outFile);
    return { buffer, width: W, height: H, duration: total, thumbBuffer: p.thumbBuffer };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = { renderVideo, VIDEO_FORMATS, LIMITS };
