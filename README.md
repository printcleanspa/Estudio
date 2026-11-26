# Estudio Creativo IA

Plataforma web para producir contenido digital de marca (imágenes, diseños, y más adelante video, audio y publicidad).
Primera marca: **Print Clean SPA**.

**Estado: Fase 1 (MVP) implementada y probada.** Ver [docs/ESTADO.md](docs/ESTADO.md) y [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Puesta en marcha

Requisitos: Node.js 22.5 o superior.

```bash
npm install
cp .env.example .env     # opcional: solo si usará conectores de pago
npm start                # http://localhost:3000
```

La primera vez, la pantalla pide crear la cuenta de administrador. Se crea la marca «Print Clean SPA» (sin colores ni datos inventados: usted los completa en *Identidad y logos*).

## Flujo básico

1. **Identidad y logos** → suba el logo oficial (se guarda sin modificarse) y complete colores, tipografías y datos.
2. **Biblioteca** → suba las fotografías originales de sus productos.
3. **Generador de imágenes** → elija la foto y el formato; compare original vs. resultado; **apruebe**.
4. **Diseño gráfico** → edite en el lienzo (textos, imágenes, logo, colores), guarde versiones, **apruebe** y exporte PNG/JPG/PDF.

## Pruebas

```bash
npm test                                   # API (12 pruebas) + navegador real si Playwright está disponible
```

## Seguridad

- Las claves API viven solo en el servidor (`.env`, ignorado por git). Nunca llegan al navegador.
- Contraseñas con scrypt; sesiones con cookie HttpOnly; todas las rutas de datos exigen sesión.
- Para publicar en internet use HTTPS y `COOKIE_SECURE=1`.

## Respaldos

`npm run backup` copia la base de datos y todos los archivos a `backups/`. Los datos viven en `data/` (fuera de git).
