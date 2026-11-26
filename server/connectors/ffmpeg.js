'use strict';
/**
 * Conector FFMPEG (gratuito, código abierto, local): montaje de video, audio y conversión a MP4.
 * Usa el ffmpeg instalado en su equipo (o FFMPEG_PATH). Nunca se invoca mediante shell: los argumentos van como lista.
 */
const path = require('node:path');
const { spawn } = require('node:child_process');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const ffmpegBin = (env) => env.FFMPEG_PATH || 'ffmpeg';
const ffprobeBin = (env) => env.FFPROBE_PATH || (env.FFMPEG_PATH ? path.join(path.dirname(env.FFMPEG_PATH), path.basename(env.FFMPEG_PATH).replace(/ffmpeg/i, 'ffprobe')) : 'ffprobe');
const INSTALL = 'Instálelo (gratis): Windows → winget install Gyan.FFmpeg · macOS → brew install ffmpeg · Linux → sudo apt install ffmpeg. Luego reinicie Estudio.';

function run(bin, args, { timeout = 30000, onStdoutLine } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); } catch (e) { return reject(httpErr(503, `No se pudo ejecutar ${bin}. ${INSTALL}`)); }
    let out = '', err = '', buf = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(httpErr(504, 'FFmpeg tardó demasiado y se canceló.')); }, timeout);
    child.stdout.on('data', (d) => { out += d; if (onStdoutLine) { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onStdoutLine(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } } });
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    child.on('error', (e) => { clearTimeout(timer); reject(httpErr(503, e.code === 'ENOENT' ? `FFmpeg no está instalado. ${INSTALL}` : `Error al ejecutar FFmpeg: ${e.message}`)); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ out, err }) : reject(httpErr(500, `FFmpeg falló (código ${code}): ${err.split('\n').filter(Boolean).slice(-3).join(' | ')}`)); });
  });
}

/** Información de un archivo multimedia (duración, streams). Lanza 400 si no es multimedia válida. */
async function probe(file, env = process.env) {
  let r;
  try { r = await run(ffprobeBin(env), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 20000 }); }
  catch (e) { if (e.status === 503) throw e; throw httpErr(400, 'El archivo no es un audio o video válido.'); }
  const j = JSON.parse(r.out || '{}');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio'), v = (j.streams || []).find((s) => s.codec_type === 'video');
  return { format: j.format?.format_name || '', duration: Number(j.format?.duration) || 0, hasAudio: Boolean(a), hasVideo: Boolean(v), width: v?.width, height: v?.height, vcodec: v?.codec_name, acodec: a?.codec_name };
}

module.exports = {
  id: 'ffmpeg', label: 'FFmpeg (montaje de video y audio)', category: 'Video y audio', paid: false, capabilities: ['video.render', 'audio.mix', 'media.probe'],
  async status(env) {
    try { const r = await run(ffmpegBin(env), ['-version'], { timeout: 8000 }); return { configured: true, note: r.out.split('\n')[0] }; }
    catch (e) { return { configured: false, note: e.message }; }
  },
  info: { cost: 'Gratis (software libre).', limits: 'Los define su equipo. Un Reel de 30 s tarda desde segundos hasta un par de minutos según su procesador.', docs: 'https://ffmpeg.org/' },
  run, probe, ffmpegBin, ffprobeBin,
};
