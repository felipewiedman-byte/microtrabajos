# Vitrina

Catálogo en un link + pedidos por WhatsApp/Messenger para negocios pequeños. Node.js 22 + Express + EJS + SQLite (sin servicios externos).

- Negocios: catálogo público (`/t/su-negocio`), productos con foto, categorías, inventario, cupones, horario, domicilio, QR, imagen para publicar, pedidos, clientes y reportes.
- Administrador: usuarios, planes (Gratis/Básico/Pro con precios y límites editables), ajustes.
- Cobro en línea: cada negocio conecta su propia cuenta de Mercado Pago (Access Token cifrado); el cliente paga en el catálogo y el dinero va directo al negocio. El pago se verifica consultándolo a Mercado Pago, nunca por lo que diga la URL.
- Planes: se asignan desde Admin → Usuarios (cobro manual por ahora; la pasarela de pago es el siguiente paso).

## Instalación (servidor)
Ver las instrucciones entregadas con el zip. Variables en `.env` (ver `.env.example`).

## Pruebas
`npm test` (134 comprobaciones de extremo a extremo).
