# Vitrina

Catálogo en un link + pedidos por WhatsApp/Messenger para negocios pequeños. Node.js 22 + Express + EJS + SQLite (sin servicios externos).

- Negocios: catálogo público (`/t/su-negocio`), productos con foto, categorías, inventario, cupones, horario, domicilio, QR, imagen para publicar, pedidos, clientes y reportes.
- Administrador: usuarios, planes (Gratis/Básico/Pro con precios y límites editables), ajustes.
- Cobro en línea: cada negocio conecta su propia cuenta de Mercado Pago (Access Token cifrado); el cliente paga en el catálogo y el dinero va directo al negocio. El pago se verifica consultándolo a Mercado Pago, nunca por lo que diga la URL.
- Planes: prueba gratis (días, productos y espacio configurables; una sola por persona: correo normalizado y WhatsApp, aunque borren la cuenta; máx. 3 por IP al día) → Básico / Pro. Sin plan vigente el catálogo se pausa (no se borra nada). Se asignan desde Admin → Usuarios (cobro de planes manual por ahora).
- Espacio: cada imagen se reduce en el servidor (WebP, máx. 1000 px) con `sharp`; cuota de MB por plan; limpieza diaria de imágenes huérfanas; Admin → Resumen muestra el uso y permite eliminar cuentas vencidas (acción manual).

## Instalación (servidor)
Ver las instrucciones entregadas con el zip. Variables en `.env` (ver `.env.example`).

## Pruebas
`npm test` (240 comprobaciones de extremo a extremo).

## Administrador (6 opciones)
- **Tablero:** accesos directos y resumen.
- **Sitio web** (pestañas): Páginas y secciones (constructor con botones) · Textos del sistema (ingreso, catálogo, mensaje de WhatsApp, correos, errores) · Logos y colores (logo claro/oscuro, ícono de pestaña, menú y pie).
- **Planes y cobros** (pestañas): Planes y precios · Claves de cobro (Mercado Pago y PayPal para cobrar los planes).
- **Negocios:** quién se registró, asignar planes, extender pruebas, pausar.
- **Administradores:** quién puede entrar al panel; agregar, cambiar contraseña, bloquear o eliminar.
- **Ajustes:** WhatsApp y correo de contacto, abrir/cerrar registros.

## Rendimiento (medido con 2.000 negocios y 19.800 productos)
- En reposo: ~71 MB de RAM y 0,25 % de CPU. Bajo 30–40 visitas simultáneas: pico de 150–200 MB, 0 errores.
- Catálogos e inicio se sirven desde una caché comprimida (30 s, se invalida al editar): ~2.000 req/s el inicio, ~2.400 un catálogo chico y 166 req/s uno de 900 productos (12 % de CPU).
- Subidas de imágenes: máx. 2 procesándose a la vez (memoria acotada).
- Recomendado en PM2: `pm2 restart vitrina --max-memory-restart 350M` (reinicia solo si algún día se pasa de 350 MB).
