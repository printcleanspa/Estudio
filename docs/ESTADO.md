# Estado del proyecto — Fase 1

**Cambio vigente:** se eliminó OpenAI. Todo es gratuito y local (composición local, Ollama, Stable Diffusion WebUI). No hay servicios de pago.

## Funciona y está probado (19 pruebas automáticas, incluido navegador real)
- Autenticación (registro del primer admin, login, logout, usuarios adicionales, límite de intentos).
- Marcas: crear/editar, colores, tipografías, estilo, redes, datos comerciales. Marca inicial Print Clean SPA vacía de datos inventados.
- Logo oficial: carga con variantes, guardado sin modificar (SHA-256 verificado), confirmación para borrar.
- Biblioteca: subida múltiple, filtros, búsqueda, descarga, borrado; validación de que sean imágenes reales (PNG/JPG/WEBP/SVG ≤ 25 MB).
- Generador de imágenes:
  - **Composición local (gratis)**: foto original + fondo de marca + titular + logo; tamaño exacto por formato; el producto no se altera (verificado por píxel).
  - **Ollama (gratis, local)**: *asistente de textos* (titulares y apoyos; con modelo de visión puede mirar la foto). Descarta automáticamente opciones con cifras que usted no entregó. Imagen con Ollama: **experimental** (ver límites).
  - **Stable Diffusion WebUI (gratis, local)**: imagen desde texto y variación de foto (API compatible con AUTOMATIC1111/Forge).
  - *Estos motores se probaron contra servidores simulados que replican la forma de sus APIs; **no contra un Ollama ni un Stable Diffusion reales** (no hay GPU ni instalación en el entorno de desarrollo). Primera prueba real: en su equipo.*
  - Comparación original vs. resultado, aprobar/rechazar/regenerar/descargar.
- Editor gráfico: texto, formas, imágenes de biblioteca, logo, colores de marca, duplicar, orden, centrar, versiones (restaurar), plantillas, duplicados.
- Exportación PNG/JPG/PDF solo de diseños aprobados; verificada con archivos reales (firma y medidas).
- Panel de inicio, consumo/costos, conectores con estado real, respaldo.

## No incluido todavía (no hay botones falsos: las pantallas lo indican)
- Fase 2–5: video, Reels, música, voz, marketing, Instagram, Google Ads, Drive, automatización.
- Quitar/sustituir fondos de fotos (requiere modelo local o API; evaluar en Fase 2).
- Generar variantes de logo o manual de identidad automático (requiere su autorización: el logo no debe alterarse).
- Retoque/corrección de iluminación.
- Comparativa de motores: orientativa; lo marcado VERIFICAR (licencias de voz/música/modelos) debe confirmarse antes de uso comercial.

## Limitaciones conocidas
- Las tipografías disponibles dependen de las fuentes instaladas en el servidor/equipo.
- El texto de la composición local se dibuja con fuentes del servidor; el editor usa las del navegador.
- Una sola organización (usuarios comparten todas las marcas).
- **Imagen con Ollama es experimental**: según la documentación de Ollama (enero 2026) nació en macOS, con Windows/Linux «próximamente». El formato de respuesta usado (`/api/generate`, imagen en la última línea) proviene de documentación de terceros, no oficial; puede cambiar. Si no funciona en su sistema, use Stable Diffusion o la composición local.
- Los modelos de IA locales tienen licencias propias (algunos sin uso comercial) y la calidad depende de su equipo.
- **Ollama real aún sin probar:** la CLI no pudo instalarse en el entorno de desarrollo (la red bloquea ollama.com) ni hay GPU. Lo verificado es contra un servidor simulado; la primera prueba real es `npm run check:ollama` en su equipo.
- **n8n:** 3 flujos creados como borradores (avisos, plan semanal, recordatorio de respaldo); los avisos desde Estudio están probados contra un webhook simulado, **no contra su n8n real** hasta que usted publique el flujo y pegue la URL. Detalles en docs/N8N.md.

## Actualización: video, audio, voz y marketing
- **Video/Reels (FFmpeg real, probado):** escenas desde fotos reales, texto, transición, zoom, música, locución, logo y WhatsApp → MP4 H.264/AAC; vista previa y versión final; aprobación; descarga; reproducción por partes.
- **Música:** subida con licencia comercial obligatoria y validación de audio real.
- **Voz:** Piper local opcional (probado con un Piper simulado) o grabación propia; palabras prohibidas respetadas.
- **Marketing/Instagram/Google:** 5 tipos de contenido con guardias por código (palabras prohibidas, cifras inventadas —incluidos % y precios—, límites de plataforma). *Probado con Ollama simulado.*
- Estudio **no publica** (Instagram/Google/Drive los maneja el panel de Michael en Cowork).
- Pendiente: subtítulos automáticos (Whisper), video y música generados por IA.
