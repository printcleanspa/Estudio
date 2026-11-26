# Configurar Ollama (solo local y gratis)

Decisión vigente: **solo modelos locales y gratuitos**. No se usan modelos en la nube de Ollama (requieren plan de pago o créditos).
Equipo de referencia: **PC básico, sin tarjeta gráfica**.

## 1. Instalar Ollama
- **Windows** (PowerShell): `irm https://ollama.com/install.ps1 | iex`
- **macOS / Linux**: `curl -fsSL https://ollama.com/install.sh | sh`
- O descargue la app: https://ollama.com/download (abra la app; en Linux sin app, ejecute `ollama serve`).

## 2. Descargar el modelo recomendado
```
ollama pull gemma4:e2b
```
Es el modelo más pequeño de la familia Gemma 4: entiende **texto e imágenes** (sirve para el asistente de textos y para que la IA mire la foto del producto). Según la biblioteca de Ollama pesa entre 4,6 y 7,5 GB y tiene ventana de 128K.

**Sin GPU:** Ollama usa la memoria RAM y el procesador; funciona, pero más lento. Su guía recomienda unos 8 GB de VRAM o memoria unificada (Mac); con menos usa la RAM del sistema y las respuestas tardan más. Si su PC tiene 8 GB de RAM o menos, cierre otros programas mientras lo usa.

Cómo ver su hardware: Windows → Administrador de tareas → Rendimiento (Memoria y GPU). Mac → menú Apple → Acerca de este Mac. GPUs compatibles: https://docs.ollama.com/gpu.md

## 3. Comprobar que todo funciona
```
npm run check:ollama
```
Muestra si Ollama responde, qué modelos tiene instalados y cuántos segundos tarda una respuesta real en **su** equipo.

## 4. Conectar con Estudio Creativo IA
Copie `.env.example` a `.env` (ya trae `OLLAMA_TEXT_MODEL=gemma4:e2b`), reinicie con `npm start` y abra **Conectores**: Ollama debe decir *Disponible*.

## Qué hace cada cosa en este equipo
| Necesidad | Motor | Nota |
|---|---|---|
| Titulares, textos, guiones | Ollama `gemma4:e2b` | Lento pero gratis y privado |
| Que la IA mire la foto | Ollama `gemma4:e2b` (visión) | Marque «Que la IA mire la foto» |
| Imagen de producto | **Composición local** | Recomendado: rápida y conserva el producto |
| Imagen con IA desde texto | Stable Diffusion / Ollama (experimental) | **Requieren GPU**: en un PC sin GPU serán muy lentos |

## Si algún día quiere la nube de Ollama (no activada)
- Se usa el sufijo `:cloud` (ej. `gemma4:cloud`) tras `ollama signin`, o la API en `https://ollama.com` con una clave creada por **usted** en https://ollama.com/settings/keys. La clave va solo en el servidor (`OLLAMA_API_KEY`), nunca en el navegador ni en el código.
- Requiere plan de pago o créditos de uso.
- **Los modelos en la nube no soportan salidas estructuradas** (según la documentación de Ollama); el asistente de textos las usa hoy, así que habría que adaptarlo.
- No se activa nada de esto sin su autorización expresa.

Documentación: https://docs.ollama.com (índice: https://docs.ollama.com/llms.txt)
