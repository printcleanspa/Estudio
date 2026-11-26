#!/usr/bin/env python3
"""Recorte de fondo GRATUITO y local (OpenCV GrabCut). Sin modelos ni descargas.
Uso:  python3 scripts/cutout.py foto.jpg salida.png X,Y,ANCHO,ALTO
  X,Y,ANCHO,ALTO = rectángulo que encierra TODO el producto (en la foto ya girada). Genera un PNG con transparencia
  y salida_check.jpg para revisar el recorte sobre fondo celeste.
Instalar:  pip install opencv-python-headless numpy pillow
Funciona mejor con producto de colores fuertes sobre fondo liso. Revise siempre el resultado."""
import sys, cv2, numpy as np
from PIL import Image, ImageOps
src, out, rect = sys.argv[1], sys.argv[2], list(map(int, sys.argv[3].split(',')))
im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
img = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
H, W = img.shape[:2]
mask = np.zeros((H, W), np.uint8)
bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
cv2.grabCut(img, mask, tuple(rect), bgd, fgd, 12, cv2.GC_INIT_WITH_RECT)
m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
# limpiar: quedarse con el objeto grande, rellenar huecos, suavizar borde
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
if n > 1:
    big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]); m = np.where(lab == big, 255, 0).astype(np.uint8)
ff = m.copy(); cv2.floodFill(ff, None, (0, 0), 255); m = m | cv2.bitwise_not(ff)   # rellena huecos internos
a = cv2.GaussianBlur(m, (0, 0), 1.6)
rgba = np.dstack([cv2.cvtColor(img, cv2.COLOR_BGR2RGB), a])
Image.fromarray(rgba, 'RGBA').save(out)
# vista de control sobre celeste
bg = Image.new('RGBA', (W, H), (150, 220, 254, 255)); bg.alpha_composite(Image.fromarray(rgba, 'RGBA')); bg.convert('RGB').save(out.replace('.png', '_check.jpg'), quality=88)
print(out, W, H, 'área recortada %.0f%%' % (100 * (m > 0).mean()))
