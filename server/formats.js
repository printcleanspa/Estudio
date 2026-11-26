'use strict';
// Formatos de salida. Medidas estándar de la industria; antes de cargar anuncios revise los requisitos vigentes de cada plataforma.
const FORMATS = {
  'ig-1x1':   { label: 'Instagram 1:1 (1080x1080)', w: 1080, h: 1080, group: 'Instagram' },
  'ig-4x5':   { label: 'Instagram 4:5 (1080x1350)', w: 1080, h: 1350, group: 'Instagram' },
  'ig-story': { label: 'Historia / Reel 9:16 (1080x1920)', w: 1080, h: 1920, group: 'Instagram' },
  'g-land':   { label: 'Google Display 1.91:1 (1200x628)', w: 1200, h: 628, group: 'Google' },
  'g-square': { label: 'Google Display cuadrado (1200x1200)', w: 1200, h: 1200, group: 'Google' },
  'g-rect':   { label: 'Google Display 300x250', w: 300, h: 250, group: 'Google' },
  'g-leader': { label: 'Banner 728x90', w: 728, h: 90, group: 'Google' },
  'web-hero': { label: 'Sitio web 1920x1080', w: 1920, h: 1080, group: 'Web' },
  'flyer-a4': { label: 'Flyer A4 (2480x3508)', w: 2480, h: 3508, group: 'Impresión' },
};
module.exports = { FORMATS };
