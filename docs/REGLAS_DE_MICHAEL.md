# Reglas de Michael (obligatorias)

Fuente: ficha técnica entregada por Michael Roman. Aplican a Estudio Creativo IA y a toda automatización.

1. **Nada se publica, envía ni activa (anuncios) sin su SÍ explícito.**
2. **Nunca escribir «original» en tóner/tintas:** usar «alternativo» o «compatible». *(Aplicado: la marca tiene la palabra prohibida «original» y el asistente de textos descarta cualquier opción que la use.)*
3. **No mezclar las cuentas de Instagram** (suministros de tóner/tintas vs. aseo y limpieza).
4. **Logo B** (círculo blanco con borde azul, «print clean»). Nunca el logo de remolino de colores.
5. Respuestas cortas y directas; instrucciones paso a paso, de a una.
6. Guardar en Google Drive **solo trabajo terminado**, no borradores.
7. No seguir cuentas en masa en Instagram. No borrar archivos de Drive sin que él elija.
8. Datos secretos (claves, tokens): en bloques de código, nunca en documentos compartidos ni en el repositorio.

## Datos del negocio cargados en la marca «Print Clean SPA»
Actividad (tóner y tintas alternativos/compatibles + artículos de aseo), WhatsApp de pedidos (se puede incluir en las imágenes), WhatsApp del local, dirección y horario, y las dos cuentas de Instagram. Se cargan solo si están vacíos; lo que usted edite en *Identidad y logos* nunca se pisa.

## n8n
- **n8n principal (producción):** el de Michael en `sslip.io` (Panel Centro de Mando, publicador de Instagram, Drive a panel). Estudio **no tiene acceso** todavía: falta una conexión segura (conector MCP de n8n o exportación de flujos).
- n8n de la nube (`print-clean.app.n8n.cloud`): contiene 3 flujos de Estudio en borrador (avisos, plan semanal, recordatorio de respaldo). Ver docs/N8N.md.
