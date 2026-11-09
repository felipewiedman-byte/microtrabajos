# Haganapp

Marketplace de microtareas digitales con pagos protegidos. Los clientes publican tareas o compran servicios a precio fijo, y los trabajadores se postulan, entregan y cobran. La plataforma gana con comisiones, tarifas de servicio, destacados y planes.

## Funcionalidades

- **Cuentas con doble rol**: contratar y trabajar con la misma cuenta. Perfil público, niveles (Nuevo → Nivel 1 → Nivel 2 → Top) y calificaciones verificadas.
- **12 departamentos** de categorías, búsqueda y filtros (precio, Express, por unidades).
- **Tareas**: modalidad individual o por unidades, archivo de referencia, sección Express y publicaciones destacadas de pago.
- **Servicios a precio fijo** que se compran con un clic.
- **Postulaciones** con propuesta y precio, y límite diario (mayor con plan Pro).
- **Pedidos**: pago protegido, chat con archivos, entregas, correcciones limitadas, aprobación (automática a las 72 h) y calificación.
- **Disputas** resueltas por el administrador: liberar el pago o reembolsar.
- **Billetera**: saldo disponible, saldo en liberación (7 días) y retiros (Nequi, Bancolombia, banco, Mercado Pago, PayPal) con identidad verificada.
- **Antievasión**: oculta automáticamente teléfonos, correos y enlaces de WhatsApp o Telegram.
- **Pagos**: Mercado Pago Checkout Pro (con webhook) y PayPal Orders v2. Los pagos se verifican siempre en el servidor contra la API del proveedor.
- **Planes**: Pro ($4,99, con comisión del 12 %) y Business ($19,99).
- **Panel de administración**: ingresos, GMV, usuarios (suspender, verificar identidad), moderación y denuncias, disputas, retiros, conciliación de reembolsos, tarifas editables, categorías y registro de auditoría.
- **Seguridad**: contraseñas con bcrypt, CSRF, sesiones en base de datos, archivos privados y límite de intentos de acceso.
- Páginas de Términos, Privacidad (Ley 1581), Reembolsos, Seguridad y Ayuda (plantillas para revisión legal).
- Diseño minimalista y responsive.

## Modelo de ingresos (configurable en /admin/configuracion)

| Concepto | Valor inicial |
|---|---|
| Comisión al trabajador | 15 % (12 % con plan Pro) |
| Tarifa al cliente | 5 % (mínimo $0,50) |
| Destacar tarea | $1 por 24 h · $3 por 7 días |
| Plan Pro / Business | $4,99 / $19,99 al mes |

Ejemplo: tarea de $10 → el cliente paga $10,50, el trabajador recibe $8,50 y la plataforma gana $2,00.

## Requisitos e instalación

Requiere Node.js 22.13 o superior. No necesita un servidor de base de datos aparte: usa SQLite, incluido en Node.

```bash
npm install
cp .env.example .env   # complete los valores
npm start              # http://localhost:3000
npm test               # prueba completa del flujo
```

Si no hay pasarelas configuradas, se activa el **pago de prueba** para que pueda probar todo el flujo. El primer arranque crea el administrador definido en `ADMIN_EMAIL` y `ADMIN_PASSWORD` (por defecto `admin@microtrabajo.local` / `admin12345`; cámbielo).

## Puesta en marcha (producción)

1. **Hosting**: Render, Railway o un VPS con Node 22. Monte un **disco persistente** y apunte `DATA_DIR` a él, porque ahí viven la base de datos y los archivos.
2. **Dominio y HTTPS**: defina `BASE_URL` con su dominio en https.
3. **Mercado Pago**: cree una aplicación en mercadopago.com.co/developers, copie el Access Token en `MP_ACCESS_TOKEN` y configure el webhook en `https://su-dominio/webhooks/mercadopago` (evento *Pagos*). Ajuste en el panel la tasa USD→COP.
4. **PayPal**: cree una app en developer.paypal.com, copie Client ID y Secret, y use `PAYPAL_MODE=live` al salir de pruebas.
5. Ponga `DEMO_PAYMENTS=0` y `SEED_DEMO=0`.
6. **Copias de seguridad**: respalde a diario la carpeta `DATA_DIR`.

## Antes de lanzar (requisitos legales)

- Constituir la empresa (SAS), RUT y **facturación electrónica DIAN** por las comisiones y tarifas.
- Revisar con un abogado los Términos, la Privacidad y los Reembolsos, y completar razón social, NIT y correo.
- Los retiros se pagan manualmente desde la cuenta de la empresa y se marcan en el panel. Más adelante se puede automatizar con PayPal Payouts o dispersión de Mercado Pago.

## Sobre Hotmart

Hotmart sirve para vender productos digitales propios (cursos, ebooks), no para retener y repartir pagos entre clientes y trabajadores. Por eso el marketplace usa Mercado Pago y PayPal. Hotmart se podría usar después para vender cursos de capacitación a los trabajadores.

## Estructura

```
server.js           Configuración, sesiones, seguridad
lib/db.js           Esquema SQLite, configuración y datos iniciales
lib/market.js       Reglas del negocio (tarifas, pedidos, billetera)
lib/payments.js     Mercado Pago, PayPal y modo de prueba
routes/             public.js, app.js (usuarios), admin.js
views/              Plantillas EJS
public/             CSS y JS
test/e2e.js         Prueba de punta a punta
```
