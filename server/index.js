'use strict';
const path = require('node:path');
require('./env').loadEnv();
const { createApp } = require('./app');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const port = Number(process.env.PORT) || 3000;
createApp({ dataDir }).listen(port, () => console.log(`Estudio Creativo IA en http://localhost:${port}  (datos: ${dataDir})`));
