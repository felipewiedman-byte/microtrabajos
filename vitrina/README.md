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
`npm test` (212 comprobaciones de extremo a extremo).

## Administrador (todo editable)
- **Planes:** nombre, precio, productos, espacio, días de prueba, descuentos por 3/12 meses, qué incluye cada uno y textos de las tarjetas.
- **Páginas:** constructor de secciones (portada, pasos, funciones, texto con imagen, planes, preguntas, llamado a la acción, texto libre, HTML), con botones, orden, duplicar y páginas nuevas (/p/nombre). El inicio, términos y privacidad también se editan.
- **Marca:** nombre, color, dos logos (fondo claro y oscuro), ícono de la pestaña (.ico/.png), menú y pie.
- **Pagos:** tus claves de Mercado Pago y PayPal (cifradas) para cobrar los planes; el plan se activa solo tras verificar el pago contra la API. Interruptor para el cobro opcional de cada negocio a sus clientes.
