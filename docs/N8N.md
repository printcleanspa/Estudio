# Automatización con n8n

Estudio Creativo IA avisa a n8n (webhook saliente) y n8n envía correos con su Gmail. **Nada se publica solo.**

## Flujos creados en su n8n (print-clean.app.n8n.cloud) — borradores
| Flujo | Qué hace | Cómo se dispara |
|---|---|---|
| **Estudio – Avisos** | Correo cuando: hay una **imagen pendiente de aprobar**, se **aprueba un diseño**, se **exporta** un archivo o se crea un **respaldo** | Webhook que llama Estudio |
| **Estudio – Plan de contenido semanal** | Correo con el esqueleto de la semana y los pasos a seguir (sin datos inventados) | Lunes 08:00 |
| **Estudio – Recordatorio de respaldo** | Correo recordando ejecutar `npm run backup` y copiar `backups/` | Viernes 18:00 |

## Para activar los avisos de Estudio
1. En n8n abra **Estudio – Avisos** y publíquelo (activarlo).
2. Copie la **URL de producción** del nodo *Aviso desde Estudio* (termina en `/webhook/estudio-avisos-…`).
3. Péguela en su `.env`:  `N8N_WEBHOOK_URL=<esa URL>`  (y `PUBLIC_BASE_URL` con la dirección donde abre Estudio).
4. Reinicie Estudio.

**Trate la URL como una contraseña**: quien la conozca puede enviarle avisos. Por eso va solo en `.env` (no se sube a GitHub).
Estudio envía solo texto (evento, marca, nombre, formato); nunca imágenes, claves ni contraseñas. Si n8n está caído, Estudio sigue funcionando normal.

## Límites actuales
- **Respaldo automático a Google Drive: pendiente.** Su n8n no tiene credencial de Google Drive y Estudio corre en su computador (n8n en la nube no puede leer sus archivos). Por ahora: recordatorio semanal + aviso al crear el respaldo.
- El calendario semanal es un **esqueleto fijo**, no generado por IA: n8n en la nube no puede llamar al Ollama de su computador.
- Los correos salen a la dirección de la cuenta de n8n; cámbiela en el nodo *Gmail* si quiere otra.
- No hay aún aviso de «diseño guardado como borrador»: solo imágenes pendientes, diseños aprobados, exportaciones y respaldos.
