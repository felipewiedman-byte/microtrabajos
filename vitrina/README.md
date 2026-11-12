# Vitrina

Catálogo en un link + pedidos por WhatsApp/Messenger para negocios pequeños. Node.js 22 + Express + EJS + SQLite (sin servicios externos).

- Negocios: catálogo público (`/t/su-negocio`), productos con foto, categorías, inventario, cupones, horario, domicilio, QR, imagen para publicar, pedidos, clientes y reportes.
- Administrador: usuarios, planes (Gratis/Básico/Pro con precios y límites editables), ajustes.
- Cobro en línea: cada negocio conecta su propia cuenta de Mercado Pago (Access Token cifrado); el cliente paga en el catálogo y el dinero va directo al negocio. El pago se verifica consultándolo a Mercado Pago, nunca por lo que diga la URL.
- Planes: prueba gratis (días, productos y espacio configurables; 1 por WhatsApp y máx. 3 por IP al día) → Básico / Pro. Sin plan vigente el catálogo se pausa (no se borra nada). Se asignan desde Admin → Usuarios (cobro de planes manual por ahora).
- Espacio: cada imagen se reduce en el servidor (WebP, máx. 1000 px) con `sharp`; cuota de MB por plan; limpieza diaria de imágenes huérfanas; Admin → Resumen muestra el uso y permite eliminar cuentas vencidas (acción manual).

## Instalación (servidor)
Ver las instrucciones entregadas con el zip. Variables en `.env` (ver `.env.example`).

## Pruebas
`npm test` (153 comprobaciones de extremo a extremo).
