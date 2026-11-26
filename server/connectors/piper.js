'use strict';
/**
 * Conector PIPER (voz sintética local, gratuita, código abierto): https://github.com/OHF-Voice/piper1-gpl
 * Opcional. Requiere el ejecutable de Piper y un modelo de voz en español descargados por usted:
 *   PIPER_PATH=/ruta/a/piper     PIPER_MODEL=/ruta/a/voz-es.onnx
 * IMPORTANTE: cada voz tiene su propia licencia; verifique que permita uso comercial antes de publicar.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const ready = (env) => Boolean(env.PIPER_PATH && env.PIPER_MODEL && fs.existsSync(env.PIPER_PATH) && fs.existsSync(env.PIPER_MODEL));

async function synth({ env = process.env, text }) {
  if (!ready(env)) throw httpErr(503, 'La voz IA local (Piper) no está configurada. Defina PIPER_PATH y PIPER_MODEL en .env (guía en docs/VIDEO_Y_AUDIO.md), o suba su propia grabación.');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'piper-')), 'voz.wav');
  await new Promise((resolve, reject) => {
    const child = spawn(env.PIPER_PATH, ['--model', env.PIPER_MODEL, '--output_file', out], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    let err = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); reject(httpErr(504, 'Piper tardó demasiado.')); }, 120000);
    child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    child.on('error', (e) => { clearTimeout(timer); reject(httpErr(503, `No se pudo ejecutar Piper: ${e.message}`)); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(httpErr(500, `Piper falló (código ${code}): ${err.trim().split('\n').pop()}`)); });
    child.stdin.end(String(text).replace(/\s+/g, ' ').trim() + '\n');
  });
  if (!fs.existsSync(out)) throw httpErr(500, 'Piper no generó el audio.');
  const buffer = fs.readFileSync(out); fs.rmSync(path.dirname(out), { recursive: true, force: true });
  return { buffer, mime: 'audio/wav' };
}

module.exports = {
  id: 'piper', label: 'Piper (voz sintética local)', category: 'Voz y audio', paid: false, capabilities: ['tts'],
  status: (env) => (ready(env) ? { configured: true, note: 'Piper y el modelo de voz están listos.' } : { configured: false, note: 'Opcional. Defina PIPER_PATH y PIPER_MODEL para generar locuciones en su equipo; o suba sus propias grabaciones.' }),
  info: { cost: 'Gratis (software libre).', limits: 'Calidad según la voz elegida. Licencia según la voz: verifique el uso comercial.', docs: 'https://github.com/OHF-Voice/piper1-gpl' },
  synth,
};
