# Estado del proyecto — Fase 1

## Funciona y está probado (13 pruebas automáticas, incluido navegador real)
- Autenticación (registro del primer admin, login, logout, usuarios adicionales, límite de intentos).
- Marcas: crear/editar, colores, tipografías, estilo, redes, datos comerciales. Marca inicial Print Clean SPA vacía de datos inventados.
- Logo oficial: carga con variantes, guardado sin modificar (SHA-256 verificado), confirmación para borrar.
- Biblioteca: subida múltiple, filtros, búsqueda, descarga, borrado; validación de que sean imágenes reales (PNG/JPG/WEBP/SVG ≤ 25 MB).
- Generador de imágenes:
  - **Composición local (gratis)**: foto original + fondo de marca + titular + logo; tamaño exacto por formato; el producto no se altera (verificado por píxel).
  - **OpenAI Images**: texto→imagen y edición; confirmación de costo antes de cada llamada; consumo registrado. *Probado contra un servidor simulado de pruebas; NO contra la API real (falta su clave).*
  - Comparación original vs. resultado, aprobar/rechazar/regenerar/descargar.
- Editor gráfico: texto, formas, imágenes de biblioteca, logo, colores de marca, duplicar, orden, centrar, versiones (restaurar), plantillas, duplicados.
- Exportación PNG/JPG/PDF solo de diseños aprobados; verificada con archivos reales (firma y medidas).
- Panel de inicio, consumo/costos, conectores con estado real, respaldo.

## No incluido todavía (no hay botones falsos: las pantallas lo indican)
- Fase 2–5: video, Reels, música, voz, marketing, Instagram, Google Ads, Drive, automatización.
- Quitar/sustituir fondos de fotos (requiere modelo local o API; evaluar en Fase 2).
- Generar variantes de logo o manual de identidad automático (requiere su autorización: el logo no debe alterarse).
- Retoque/corrección de iluminación.
- Tabla comparativa de proveedores: orientativa; los precios marcados VERIFICAR deben confirmarse en los sitios oficiales antes de contratar.

## Limitaciones conocidas
- Las tipografías disponibles dependen de las fuentes instaladas en el servidor/equipo.
- El texto de la composición local se dibuja con fuentes del servidor; el editor usa las del navegador.
- Una sola organización (usuarios comparten todas las marcas).
