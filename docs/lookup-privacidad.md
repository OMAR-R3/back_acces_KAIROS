# Privacidad de GET /api/visits/lookup

> Este informe describe la primera etapa compatible. La implementación aislada
> posterior, su contrato y el requisito de activación están en
> [lookup-integracion.md](lookup-integracion.md). El modo predeterminado sigue
> siendo vulnerable; todavía no se ha activado la autorización obligatoria.

## Alcance de esta corrección

La ruta sigue siendo pública. Conocer un correo sigue permitiendo consultar las
visitas asociadas: esta corrección reduce exposición accidental y abuso, pero
**no cierra la vulnerabilidad de acceso a visitas ajenas**.

No están disponibles los repositorios web de intranet y extranet. Por eso no se
eliminan campos ni se introduce una verificación obligatoria que sus clientes
actuales no podrían enviar. No se modifican autenticación general, endpoints del
visitante ni servicio compartido de visitas. La etapa posterior incluye una
migración de base de datos pendiente de aplicar, exclusiva de lookup.

Base de trabajo: main y origin/main sincronizados en
`d87a20527cbe63a724d007139954a7f228ef7ccd`; rama `fix/lookup-privacidad`.

## Contrato y protecciones

- GET con un único parámetro `correo`, normalizado con trim y minúsculas.
- Longitud normalizada máxima de 254 caracteres; parte local de hasta 64.
  Se aceptan direcciones prácticas ASCII con etiquetas de dominio de hasta 63
  caracteres y al menos un punto, sin espacios ni puntos consecutivos en la
  parte local. No se eliminan etiquetas `+`, puntos ni alias del proveedor.
  No se verifica DNS ni posesión del correo. Direcciones internacionales sin
  codificar o partes locales entre comillas no están soportadas por esta validación.
- 30 solicitudes por IP cada 15 minutos, incluyendo parámetros inválidos.
  Cambiar el correo no reinicia la cuota. Se usa el limitador existente con
  una clave exclusiva de lookup, sin modificar las cuotas de otras rutas.
- HTTP 200: `{ success: true, data: [...] }`; visitante inexistente o sin visitas:
  `{ success: true, data: [] }`.
- HTTP 400 para parámetros inválidos; HTTP 429 para cuota agotada, con
  `Retry-After: 900` (espera conservadora de una ventana completa).
- Los fallos de consulta pasan de HTTP 400 con mensaje interno a HTTP 500 con
  un mensaje público fijo. No se incluyen excepciones, consultas ni credenciales.
- Las respuestas del manejador GET incluyen `Cache-Control: no-store`,
  `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.
  Esto no borra cachés anteriores ni evita que un proxy registre la URL solicitada.

Campos antes y después, sin cambios:

| Nivel | Campos |
| --- | --- |
| Visita | id, fecha, hora_inicio, motivo, estado, created_at |
| Departamentos | nombre, ubicacion |

`getVisitsByCorreo` ya usa una selección explícita, sin comodines. No se agregan
nombre, apellidos, teléfono, correo, documentos, identificador del visitante o QR.
No se puede justificar retirar más campos sin inspeccionar sus consumidores.
La proyección exacta del servicio queda protegida por una prueba de regresión.

## Compatibilidad y riesgos pendientes

Se mantienen URL, método, nombres de campos, orden y envoltorio de éxito. Los
clientes deberán manejar 429 y 500. Solicitudes antes aceptadas con correos
malformados, demasiado largos o parámetros repetidos ahora reciben 400.
La sintaxis de correo admitida debe contrastarse con los formularios web antes
del despliegue, especialmente si permiten direcciones internacionales.

El README del backend documenta lookup como público para extranet; no se puede
confirmar el uso de cada campo en las interfaces ausentes. `resend-qr` requiere
visita_id y correo: se conserva id para no romper un posible flujo de selección
y reenvío. No se modifica ese endpoint. La app móvil disponible usa las rutas
autenticadas `/api/visits/me`, no lookup.

El historial, motivos, horarios y departamentos siguen accesibles por correo.
Persisten enumeración distribuida, correlación de visitas y posibles reenvíos
QR no solicitados al correo registrado. No hay evidencia revisada de explotación.

El limitador guarda contadores en memoria por proceso: reinicios y múltiples
instancias reducen su eficacia. Usa `x-forwarded-for`; el proxy debe sustituir
ese encabezado y evitar que se pueda acceder al backend eludiéndolo. Sin IP,
los clientes comparten la cuota `unknown`. Una red institucional con NAT puede
agotar la cuota compartida; hay que validar el umbral con el tráfico real.

CORS no acredita identidad ni impide consultas desde clientes externos al navegador.
No se puede usar el origen de intranet/extranet, una clave embebida en frontend
o un identificador predecible como sustituto de la posesión del correo.

## Cierre completo propuesto (requiere coordinación con extranet)

1. Revisar sus consumidores y acordar una lista mínima de campos, historial y
   volumen necesarios; verificar también si intranet llama a lookup.
2. Incorporar un flujo específico de lookup para demostrar posesión del correo:
   respuesta de solicitud indistinguible exista o no el visitante, código o enlace
   criptográficamente seguro con caducidad, uso único y límites de envío e intentos.
3. Tras verificar, emitir una autorización breve limitada al correo y a lookup;
   comprobarla en cada consulta. No usar correo, fecha o folio como secreto.
   La etapa posterior incorpora almacenamiento y consumo atómico mediante una
   migración aún no aplicada; ver el contrato de integración enlazado arriba.
4. Adaptar la extranet para solicitar y verificar la prueba, manejar expiración,
   reintentos y errores sin revelar existencia de personas. Coordinar el despliegue
   para retirar finalmente la consulta anónima por correo.
5. Revisar proxy, registros, cuotas compartidas entre instancias y pruebas de
   integración de ambos sitios antes de afirmar que la brecha está cerrada.

## Verificación

`tests/unit/visitsLookup.test.js` cubre normalización, sintaxis, límites de longitud,
parámetros duplicados, contrato, lista vacía, errores públicos, cabeceras y cuota
real por IP con expiración e independencia entre IPs.
`tests/unit/visitsLookupService.test.js` cubre las dos consultas, filtro por visitante,
proyección explícita, orden, ausencia de visitante y fallos de base de datos.
Las pruebas usan mocks: no consultan datos reales ni envían correos.

Resultados locales: `npm test` pasa con 4 archivos y 65 pruebas (35 nuevas).
`node --check` pasa para los tres archivos JavaScript nuevos o modificados y
`git diff --check` no informa problemas. El Node de NVM no tenía versión activa;
se utilizó el Node ya instalado en `C:/Program Files/nodejs` (v24.16.0), sin
modificar la configuración del equipo.

`npm run build` inicialmente encontró un error de permisos al resolver la raíz
del workspace. Reintentado con acceso ampliado, compiló correctamente, pero no
completó la recopilación de datos de rutas: falta `SUPABASE_URL` al cargar
`/api/auth/reset-password`. No se crearon credenciales ni se modificaron otras
rutas para superar ese bloqueo. El build también advierte de `turbopack: false`
y múltiples lockfiles en la configuración existente.

ESLint no está instalado y no hay configuración ni script de lint en el proyecto;
no se añade una dependencia/configuración ajena al alcance para simular ese check.
La revisión de criterios de ClickUp queda pendiente: no se proporcionaron sus
criterios ni un enlace a la tarea, así que no se afirma su cumplimiento.
