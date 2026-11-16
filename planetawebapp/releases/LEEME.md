# Último ZIP aprobado (el más actualizado)

`planetapp-ULTIMO-850070.zip` (850070 bytes, cliente `index-DrZvXl5Z.js`) es la versión que debe instalarse y la base para todo cambio nuevo.

Incluye todo lo de la rama `claude/youthful-tesla-8yw845` más trabajo hecho en otra sesión:
recuperar contraseña por correo (Brevo/Resend), cuadro «Cuenta y contraseña», respaldo de marcadores con ESPN (`server/espn.js`),
`server/check-sites.js` (revisa coordenadas de lugares contra Wikipedia), mapa 2D vectorial en vista previa (`?preview&desk`), colores por defecto del tema.

IMPORTANTE: el código fuente del cliente (`src/`) de este repositorio NO tiene esos cambios nuevos; solo está compilado dentro del ZIP.
El servidor (`server/*.js`) sí quedó actualizado con los archivos de este ZIP.
No recompilar el cliente desde `src/` sin antes recuperar el código fuente de la otra sesión: se perderían esas funciones.
