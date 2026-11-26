# Video, audio y voz

Todo corre en su equipo y es gratis. **Nada se publica**: Estudio crea y guarda; usted publica desde su panel.

## 1. Instalar FFmpeg (necesario para video)
- Windows (PowerShell): `winget install Gyan.FFmpeg`  · macOS: `brew install ffmpeg`  · Linux: `sudo apt install ffmpeg`
- Compruebe: `npm run check:media`. Si no está en el PATH, defina `FFMPEG_PATH` en `.env`.

## 2. Crear un Reel
1. **Biblioteca:** suba sus fotos reales (se conservan intactas).
2. **Reels** → *Agregar escena* (una foto por escena), texto en pantalla opcional y segundos (1–15).
3. Ajustes: transición (fundido/corte), zoom suave, logo oficial, WhatsApp de pedidos, música y voz.
4. **Vista previa rápida** (mitad de tamaño) → si le gusta, **Crear video final** (MP4 H.264 + AAC, 30 fps).
5. **Aprobar** y **Descargar MP4**. La vista previa no se puede aprobar.
- Formatos: Reel/Historia 9:16 (1080×1920), cuadrado 1:1 (1080×1080), horizontal 16:9 (1920×1080). Máximo 20 escenas y 180 s.
- En un PC sin GPU, un video final de 30 s puede tardar desde unos segundos hasta unos minutos.
- La foto del producto no se altera: se escala dentro de un fondo de marca. La escena puede llevar un texto corto abajo.

## 3. Música y audio
- *Música y audio* → suba MP3, WAV, M4A u OGG y **confirme la licencia comercial** (obligatorio). El sistema valida que sea audio real.
- Estudio **no genera música con IA**: la mayoría de los modelos abiertos prohíben el uso comercial. Use pistas libres de derechos o con licencia verificada por usted.

## 4. Voz IA
- **Su propia grabación:** *Voz IA* → *Subir su propia grabación*.
- **Voz sintética local (Piper, opcional):** descargue Piper y una voz en español (https://github.com/OHF-Voice/piper1-gpl) y defina en `.env`:
  `PIPER_PATH=/ruta/piper` y `PIPER_MODEL=/ruta/voz-es.onnx`. **Cada voz tiene su licencia**: verifíquela y use *Confirmar licencia* solo si permite uso comercial.
- Las locuciones respetan las palabras prohibidas de la marca (ej. «original»).

## 5. Marketing, Instagram y Google Ads (Ollama)
Requiere Ollama (docs/OLLAMA.md). Genera: textos de publicación (≤2.200 caracteres, ≤30 hashtags), guiones de Reel (con botón *Crear Reel con este guion*), calendario semanal, variantes de anuncio (título ≤30 y descripción ≤90 caracteres) e ideas de campaña.
Reglas aplicadas por código: sin palabras prohibidas, sin cifras/porcentajes/precios que usted no escribió en las notas, sin mezclar las líneas (tóner/tintas vs. aseo), y respetando los límites de cada plataforma.

## Límites actuales
- Subtítulos: se escriben por escena (texto en pantalla). Subtítulos automáticos con Whisper: pendiente.
- Video generado por IA (desde texto) y música generada por IA: pendientes (exigen GPU potente y licencias).
- Probado con FFmpeg real; Ollama y Piper se probaron simulados.
