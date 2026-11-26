# Arquitectura

## Principios
- **Un solo servidor Node.js**, sin servicios externos obligatorios: se instala y funciona.
- **Conectores independientes** (`server/connectors/`): cada proveedor es un módulo con la misma forma (`id`, `status(env)`, `info`, operaciones). Cambiar de proveedor = agregar/sustituir un módulo; la interfaz y las rutas no cambian.
- **Nada se simula**: sin credenciales un conector queda «no configurado». Los costos no se inventan: se usan los precios que el usuario configura.
- **Aprobación humana**: imágenes generadas (`pending → approved/rejected`) y diseños (`draft → approved`). Exportar exige diseño aprobado y versión vigente; editar tras aprobar devuelve a borrador.
- **Originales intactos**: los archivos subidos se guardan tal cual (hash SHA-256 registrado); los resultados son archivos nuevos con `parent_id` hacia el original.

## Tecnologías
| Capa | Elección | Motivo |
|---|---|---|
| Servidor | Node.js 22 + Express 5 | Simple, un solo lenguaje |
| Base de datos | SQLite (`node:sqlite` integrado) | Sin instalar nada; respaldo = copiar archivo. Migrable a Postgres si crece |
| Imágenes | sharp | Procesamiento local gratuito (escala, composición, miniaturas, JPG) |
| PDF | pdfkit | Exportación PDF local |
| Editor | Fabric.js 5 (incluido en `public/vendor`) | Lienzo con objetos editables, JSON serializable |
| Interfaz | HTML/JS sin framework, responsive | Sin paso de compilación |
| Pruebas | node:test + Playwright | API y flujo real en navegador |

## Estructura
```
server/  app.js (rutas) · db.js (esquema) · auth.js · formats.js · connectors/
public/  index.html · app.js (páginas) · editor.js (editor gráfico) · ui.js · styles.css
tests/   api.test.js · e2e.test.js
data/    (no versionado) estudio.db + uploads/
```

## Modelo de datos
`users`, `sessions`, `brands` (colores, tipografías, estilo, redes, datos comerciales, logo vigente), `assets` (archivos: logo/producto/foto/generada/exportado, con `official`, `status`, `parent_id`, `sha256`), `designs` + `design_versions`, `usage_log` (consumo/costos), `audit_log`.

## Hoja de ruta por fases
1. **Fase 1 (hecha)**: panel, marcas, biblioteca, logos, generación de imágenes (local + OpenAI), editor, exportación.
2. Fase 2: video (FFmpeg local + proveedor de video por API a evaluar), Reels, subtítulos.
3. Fase 3: música con licencia verificada, voz, locuciones.
4. Fase 4: marketing, Instagram Graph API, Google Ads API.
5. Fase 5: automatización, estadísticas, optimización de costos.

Antes de cada integración externa se verifica: API existente, permisos, costos, límites y condiciones.
