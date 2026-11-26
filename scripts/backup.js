'use strict';
// Copia completa (base de datos + archivos subidos) a backups/AAAA-MM-DD_HHMMSS/
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
if (!fs.existsSync(path.join(dataDir, 'estudio.db'))) { console.error('No hay datos que respaldar en', dataDir); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const out = path.join(__dirname, '..', 'backups', stamp);
fs.mkdirSync(out, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'estudio.db'));
db.exec(`VACUUM INTO '${path.join(out, 'estudio.db').replace(/'/g, "''")}'`); db.close();
fs.cpSync(path.join(dataDir, 'uploads'), path.join(out, 'uploads'), { recursive: true });
console.log('Respaldo creado en', out);
require('../server/env').loadEnv();
require('../server/notify').notify(process.env, 'backup.created', { file: stamp }).then((r) => { if (r.sent) console.log('Aviso enviado a n8n.'); });
