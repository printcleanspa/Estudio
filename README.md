# Estudio Creativo IA

Plataforma web para producir contenido digital de marca (imágenes, diseños, y más adelante video, audio y publicidad).
Primera marca: **Print Clean SPA**.

**Estado: Fase 1 (MVP) implementada y probada. 100 % gratuito y de código abierto: sin servicios de pago.** Ver [docs/ESTADO.md](docs/ESTADO.md) y [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Puesta en marcha

Requisitos: Node.js 22.5 o superior.

```bash
npm install
cp .env.example .env     # opcional: solo para cambiar puertos o direcciones de motores locales
npm start                # http://localhost:3000
```

La primera vez, la pantalla pide crear la cuenta de administrador. Se crea la marca «Print Clean SPA» (sin colores ni datos inventados: usted los completa en *Identidad y logos*).

## Motores de IA (gratuitos, locales)

| Motor | Para qué | Cómo activarlo |
|---|---|---|
| Composición local (integrada) | Foto original + fondo de marca + texto + logo | Siempre activa |
| **Ollama** | Asistente de textos (puede mirar la foto con un modelo de visión). Imagen: *experimental* | Instale Ollama (ollama.com) y un modelo: `ollama pull <modelo>` |
| Stable Diffusion WebUI | Imagen desde texto / variación de foto | Inícielo con `--api` y defina `SD_WEBUI_URL` en `.env` |

**Guía paso a paso para Ollama (PC sin GPU, solo local): [docs/OLLAMA.md](docs/OLLAMA.md)** — compruebe su instalación con `npm run check:ollama`.

Si Ollama o Stable Diffusion no están, la plataforma funciona igual con la composición local. La pantalla **Conectores** muestra el estado real de cada motor.
Los modelos de IA tienen licencias distintas: algunos no permiten uso comercial. Revise la ficha de cada modelo antes de publicar.

**Automatización con n8n (avisos por correo, plan semanal, recordatorio de respaldo): [docs/N8N.md](docs/N8N.md).**

## Video, audio y marketing (gratis, en su equipo)
- **Reels y video:** fotos reales → escenas con texto, transiciones, zoom suave, música, locución, logo y WhatsApp → MP4 (9:16, 1:1 o 16:9). Requiere FFmpeg. Vista previa rápida y versión final. Guía: [docs/VIDEO_Y_AUDIO.md](docs/VIDEO_Y_AUDIO.md). Compruebe con `npm run check:media`.
- **Música:** suba pistas con licencia comercial (cada audio exige confirmarla).
- **Voz IA:** Piper local (opcional) o su propia grabación.
- **Marketing, Instagram, Google Ads:** textos, guiones de Reel, calendario y anuncios con Ollama, respetando sus reglas y los límites de cada plataforma. **Estudio no publica**: usted copia y publica desde su panel.

## Flujo básico

1. **Identidad y logos** → suba el logo oficial (se guarda sin modificarse) y complete colores, tipografías y datos.
2. **Biblioteca** → suba las fotografías originales de sus productos.
3. **Generador de imágenes** → elija la foto y el formato; compare original vs. resultado; **apruebe**.
4. **Diseño gráfico** → edite en el lienzo (textos, imágenes, logo, colores), guarde versiones, **apruebe** y exporte PNG/JPG/PDF.

## Pruebas

```bash
npm test                                   # API + video/audio/marketing + navegador real (Playwright)
```

## Seguridad

- Las claves API viven solo en el servidor (`.env`, ignorado por git). Nunca llegan al navegador.
- Contraseñas con scrypt; sesiones con cookie HttpOnly; todas las rutas de datos exigen sesión.
- Para publicar en internet use HTTPS y `COOKIE_SECURE=1`.

## Respaldos

`npm run backup` copia la base de datos y todos los archivos a `backups/`. Los datos viven en `data/` (fuera de git).
