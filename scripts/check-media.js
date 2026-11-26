'use strict';
// Comprobador de video y voz: npm run check:media
require('../server/env').loadEnv();
const connectors = require('../server/connectors');
(async () => {
  const list = await connectors.list(process.env);
  let bad = false;
  for (const id of ['ffmpeg', 'piper']) {
    const c = list.find((x) => x.id === id);
    console.log(`${c.configured ? '✓' : id === 'ffmpeg' ? '✗' : '–'} ${c.label}: ${c.note}`);
    if (id === 'ffmpeg' && !c.configured) bad = true;
  }
  if (bad) { console.error('\nFFmpeg es necesario para crear videos. Windows: winget install Gyan.FFmpeg · macOS: brew install ffmpeg · Linux: sudo apt install ffmpeg'); process.exit(1); }
  console.log('\nVideo listo. Piper (voz) es opcional: sin él puede subir sus propias grabaciones.');
})();
