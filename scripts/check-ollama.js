'use strict';
// Comprobador de Ollama: npm run check:ollama
// Verifica que Ollama responda, lista los modelos y mide cuánto tarda una respuesta real en SU equipo.
require('../server/env').loadEnv();
const ollama = require('../server/connectors/ollama');
const env = process.env;
const host = (env.OLLAMA_HOST || 'http://127.0.0.1:11434');
const IMG_RE = /flux|z-image|diffusion|sdxl|\bsd\b/i;

(async () => {
  console.log(`Ollama en ${host}`);
  let models;
  try { models = await ollama.models(env); } catch (e) {
    console.error(`\n✗ ${e.message}\n`);
    console.error('Cómo instalarlo (gratis):');
    console.error('  Windows (PowerShell):  irm https://ollama.com/install.ps1 | iex');
    console.error('  macOS / Linux:         curl -fsSL https://ollama.com/install.sh | sh');
    console.error('  o descargue la app en  https://ollama.com/download');
    console.error('Luego, si usa Linux sin la app, inícielo con:  ollama serve');
    process.exit(1);
  }
  console.log(`✓ Ollama responde. Modelos instalados: ${models.length ? models.map((m) => m.name).join(', ') : '(ninguno)'}`);
  const textModels = models.filter((m) => !IMG_RE.test(m.name));
  if (!textModels.length) {
    console.error('\n✗ No hay modelos de texto. Recomendado para un PC sin GPU:  ollama pull gemma4:e2b');
    process.exit(1);
  }
  const wanted = env.OLLAMA_TEXT_MODEL;
  if (wanted && !models.some((m) => m.name === wanted || m.name === `${wanted}:latest`)) {
    console.error(`\n✗ OLLAMA_TEXT_MODEL=${wanted} no está instalado. Ejecute:  ollama pull ${wanted}`);
    process.exit(1);
  }
  const model = wanted || textModels[0].name;
  console.log(`Probando una respuesta real con «${model}» (la primera vez carga el modelo y puede tardar)…`);
  const t0 = Date.now();
  try {
    const out = await ollama.chat({ env, model, prompt: 'Responde solo con la palabra OK.' });
    const s = (Date.now() - t0) / 1000;
    console.log(`✓ Respondió en ${s.toFixed(1)} s: ${out.trim().slice(0, 80)}`);
    console.log(s < 20 ? 'Velocidad: buena.' : s < 90 ? 'Velocidad: aceptable (el asistente de textos tardará unos segundos).' : 'Velocidad: lenta. Pruebe un modelo más pequeño o repita (la 1.ª vez carga el modelo).');
  } catch (e) { console.error(`\n✗ ${e.message}`); process.exit(1); }
  console.log('\nTodo listo. Inicie la plataforma con:  npm start');
})();
