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

Si Ollama o Stable Diffusion no están, la plataforma funciona igual con la composición local. La pantalla **Conectores** muestra el estado real de cada motor.
Los modelos de IA tienen licencias distintas: algunos no permiten uso comercial. Revise la ficha de cada modelo antes de publicar.

## Flujo básico

1. **Identidad y logos** → suba el logo oficial (se guarda sin modificarse) y complete colores, tipografías y datos.
2. **Biblioteca** → suba las fotografías originales de sus productos.
3. **Generador de imágenes** → elija la foto y el formato; compare original vs. resultado; **apruebe**.
4. **Diseño gráfico** → edite en el lienzo (textos, imágenes, logo, colores), guarde versiones, **apruebe** y exporte PNG/JPG/PDF.

## Pruebas

```bash
npm test                                   # API (14 pruebas) + navegador real (2) si Playwright está disponible
```

## Seguridad

- Las claves API viven solo en el servidor (`.env`, ignorado por git). Nunca llegan al navegador.
- Contraseñas con scrypt; sesiones con cookie HttpOnly; todas las rutas de datos exigen sesión.
- Para publicar en internet use HTTPS y `COOKIE_SECURE=1`.

## Respaldos

`npm run backup` copia la base de datos y todos los archivos a `backups/`. Los datos viven en `data/` (fuera de git).
