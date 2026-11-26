'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Carga simple de .env (sin dependencias). Nunca se envía al navegador.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { createApp } = require('./app');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const port = Number(process.env.PORT) || 3000;
createApp({ dataDir }).listen(port, () => console.log(`Estudio Creativo IA en http://localhost:${port}  (datos: ${dataDir})`));
