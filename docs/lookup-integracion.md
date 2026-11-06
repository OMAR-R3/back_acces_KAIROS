# Integración y activación de la autorización de lookup

## Estado y límite de la entrega

No se puede garantizar al mismo tiempo que un cliente actual que solo envía
correo continúe funcionando sin cambios y que deje de acceder a visitas ajenas.
Es imprescindible adaptar los consumidores antes de exigir una prueba de correo.

La implementación permanece aislada por configuración, sin activación en producción.
Mientras el modo sea legacy o prepare, la brecha sigue ABIERTA. No existe un
segundo endpoint de historial, ni se declara resuelto el problema por disponer
de rutas de verificación. No se ha aplicado la migración ni configurado secretos.

## Modos (LOOKUP_ACCESS_MODE, configuración del servidor)

| Valor | Consulta GET lookup | Rutas de credenciales |
| --- | --- | --- |
| Ausente o legacy | Comportamiento anterior, anónimo y vulnerable | 503, deshabilitadas |
| prepare | Comportamiento anterior, anónimo y vulnerable | Habilitadas para integrar |
| enforced | Exige sesión lookup válida vinculada al correo consultado | Habilitadas |
| Cualquier otro valor, incluido vacío | 500 sin consultar historial | 503 |

La configuración no depende de Origin, headers especiales, cookies del móvil,
IP de intranet, folio, QR o parámetros del cliente. No hay fallback anónimo si
la base de datos o la autorización falla en enforced. La desactivación deliberada
del modo reabre la brecha; debe tratarse como una excepción de seguridad.

## Componentes y persistencia

- `utils/lookupPolicy.js`: modo, cabeceras y validación de correo compartida.
- `services/lookupAccessService.js`: secretos criptográficos y operaciones RPC.
- `utils/lookupAccessHttp.js`: validación de JSON (máximo 2048 bytes), cuotas por
  IP y respuestas públicas. Las tres rutas nuevas delegan en este manejador.
- `services/emailService.js`: correo de código en texto plano, sin historial.
- `db/migrations/2026-11-06_lookup_access.sql`: tablas lookup_challenges y
  lookup_sessions, RLS y funciones solo ejecutables con service_role.
- GET lookup conserva el contrato de éxito y exige la credencial solo en enforced.

Se usa crypto de Node, Nodemailer y Supabase existentes; no hay nuevas dependencias.
No se modifican JWT, autenticación móvil, endpoints del visitante, registro,
aprobación, validación QR, reenvío QR ni el servicio compartido de visitas.

Se requiere `LOOKUP_CODE_SECRET` independiente de JWT_SECRET, generado mediante
CSPRNG (al menos 32 bytes de entropía; el código verifica longitud mínima de 32
bytes). Debe ser igual en todas las instancias, gestionado como secreto y no
registrado. Los códigos se guardan con HMAC-SHA256 ligado al desafío; secretos
del navegador y sesiones se guardan como SHA-256 de valores aleatorios de 256 bits.
Rotar LOOKUP_CODE_SECRET invalida códigos pendientes, no sesiones ya emitidas.

La migración consume el desafío, incrementa intentos y crea la sesión en una
transacción con bloqueo de fila. Las cuotas de envío se comprueban bajo bloqueos
transaccionales por correo e IP: no se reinician al cambiar de proceso.
No se reutiliza reset_tokens ni se guarda el código o token en claro.

## Contrato para intranet y extranet

### 1. Solicitar código

`POST /api/visits/lookup/request-code`

```json
{ "correo": "persona@example.com" }
```

Content-Type: application/json. Respuesta 202:

```json
{
  "success": true,
  "message": "Si la solicitud puede procesarse, recibirás un código",
  "challengeId": "UUID del desafío",
  "browserSecret": "secreto aleatorio de 43 caracteres"
}
```

Conservar challengeId y browserSecret solo en memoria del navegador que inició
el intento. No enviarlos a analítica, logs, URL o almacenamiento persistente.
Se envía un código de ocho dígitos, conservando ceros iniciales, a cualquier
correo válido solicitado sin consultar si existe un visitante. También se
responde 202 si se suprime el envío por cuota o falla SMTP; esas credenciales
pueden ser inutilizables. No se promete entrega por aceptar la solicitud.

### 2. Verificar

`POST /api/visits/lookup/verify-code`

```json
{
  "challengeId": "UUID recibido",
  "browserSecret": "secreto recibido",
  "code": "01234567"
}
```

El código es STRING, no número. Caduca a los diez minutos, admite cinco intentos
con el secreto de navegador correcto y solo se consume una vez, incluso bajo
verificación concurrente. Reenviar crea un desafío independiente y no amplía la
vida ni reinicia los intentos de otro. Códigos anteriores no se invalidan por
una nueva solicitud: se evita que terceros los invaliden provocando envíos.

Respuesta 200:

```json
{ "success": true, "accessToken": "secreto de 43 caracteres", "expiresIn": 900 }
```

Solo autoriza lookup para ese correo. Guardar el token en memoria, nunca en URL,
localStorage o logs. Descartar el código y las credenciales del desafío. Una
recarga de página requiere nueva verificación; la sesión no se renueva al usarse.

### 3. Consultar el historial existente

`GET /api/visits/lookup?correo=persona%40example.com`

Enviar `Authorization: Bearer <accessToken>`. CORS ya permite Authorization;
no requiere cookies, por lo que no modifica auth_token ni depende de cookies
de terceros. Revisar el preflight real con ambos sitios.

En enforced, token ausente, desconocido, caducado, revocado o de otro correo:
401. Fallo de almacenamiento: 500 sin historial. Un JWT móvil o interno y un QR
no sustituyen esta credencial.

Éxito: `{ "success": true, "data": [...] }`, con la selección y orden previos:
id, fecha, hora_inicio, motivo, estado, created_at, Departamentos(nombre, ubicacion).
Un correo verificado sin visitas recibe data: []. No se eliminan campos sin
auditar los consumidores. En prepare el GET todavía ignora la credencial y
permite anónimos: NO usar ese modo para certificar la autorización.

### 4. Cerrar sesión

`POST /api/visits/lookup/logout`, con el mismo Bearer. Responde 200
`{ "success": true }`, incluso si el token ya no existe. No altera sesiones de
la aplicación móvil o intranet. La interfaz debe borrar inmediatamente el token
y los resultados de pantalla; si falla la petición, la sesión vive hasta caducar.

### Errores, cabeceras y límites

- 400: correo/cuerpo inválido, JSON malformado o mayor de 2048 bytes.
- 401: prueba inválida, agotada o expirada; en GET enforced, falta autorización.
- 429: cuota local por IP, Retry-After: 900.
- 503: verificación deshabilitada, mal configurada o almacenamiento no disponible.
- Las respuestas de estos manejadores incluyen no-store, nosniff y no-referrer.
- Cuotas locales existentes, por 15 minutos: solicitud 5/IP, verificación y logout
  20/IP por operación; GET mantiene 30/IP. Incluyen intentos inválidos.
- Cuotas compartidas en DB, ventana móvil de una hora: 3 envíos/correo y 10/IP.
  Se reserva cuota antes de intentar SMTP; los fallos de entrega también cuentan.

## Migración y condición EXACTA de activación

1. Desplegar código con legacy o sin variable. No cambia los consumidores
   existentes. Registrar la vulnerabilidad como ABIERTA, con responsable y plazo.
2. Probar y aplicar explícitamente la migración en un entorno aislado y luego
   en el destino. No se aplica al arrancar la aplicación. Configurar correo y
   LOOKUP_CODE_SECRET; comprobar permisos y RPC de PostgREST en ese entorno.
3. Habilitar prepare para integrar. Adaptar AMBOS consumidores o confirmar con
   sus responsables que no llaman a lookup. No se dispone de sus repositorios:
   esta condición aún NO está acreditada.
4. En staging con enforced ejecutar pruebas de navegador y DB: anónimos denegados,
   código correcto, incorrecto, expirado, replay y concurrencia, cambio de correo,
   revocación, caída de DB sin fallback, CORS/preflight, lista vacía y reenvío QR.
   Verificar las pantallas y todos los campos utilizados en ambas interfaces.
5. Solo con evidencias satisfactorias de 2–4, aprobación coordinada de responsables
   de ambos consumidores y autorización de despliegue, establecer
   LOOKUP_ACCESS_MODE=enforced en TODAS las instancias/réplicas y reiniciarlas.
   Retirar versiones anteriores, purgar cachés anteriores y bloquear accesos a
   instancias legacy. Una sola réplica legacy mantiene una vía de evasión.
6. Comprobar desde fuera que el GET anónimo ya no entrega historial y que ninguna
   ruta nueva u origen alternativo lo permite sin autorización. Mantener el
   modo enforced durante la observación y monitorizar fallos sin datos personales.

La condición de cierre es que TODOS los accesos a este endpoint pasen por
enforced, sin fallback, con integración verificada en ambos consumidores y
pruebas reales satisfactorias. Una variable de entorno por sí sola no demuestra
que estos requisitos se hayan cumplido. No hay activación automática ni fecha
de corte implícita. Nada de esto se ha ejecutado en producción en esta tarea.

Si es necesario revertir, preferir un 503 temporal conservando enforced y las
protecciones. Volver a legacy/prepare restaura compatibilidad anónima pero REABRE
la brecha; requiere una decisión explícita y no puede declararse solución segura.

## Operación y riesgos pendientes

- El código acredita posesión del buzón, no identidad civil. Buzones compartidos,
  datos históricos mal asociados y cuentas comprometidas siguen siendo riesgos.
- El registro móvil existente puede establecer contraseña en visitantes sin
  cuenta sin verificar correo. Requiere revisión separada; no se modifica aquí.
  No debe afirmarse que proteger lookup sanea toda la plataforma.
- El reenvío QR público conserva sus mensajes y posibles envíos no solicitados.
- Proteger el proxy: sustituir x-forwarded-for y evitar acceso directo al backend.
  Las cuotas de IP dependen de ello. Hay límites por correo/desafío en DB, pero
  un atacante distribuido aún puede generar envíos a muchas direcciones distintas.
  Validar presupuesto/alertas del proveedor y controles adicionales antes de activar
  las rutas de correo en producción. SMTP no dispone aquí de cola ni reintentos.
- Los tokens Bearer robados sirven hasta caducar/revocarse: HTTPS, exclusión de
  logs/analítica y prevención de XSS son requisitos de integración. No admitir
  credenciales en query string. No crear una excepción por Origin o por rol móvil.
- Compartir browserSecret entre pestañas/dispositivos reduce la protección del
  intento; la interfaz debe conservarlo localmente en memoria.
- Las cuotas pueden afectar a usuarios tras NAT y a correos con reintentos de
  entrega. Validar esos umbrales con tráfico real y proporcionar mensajes claros.
- La tabla de desafíos contiene correos. Programar limpieza al menos diaria con
  la herramienta operativa ya usada por el despliegue (no se verificó scheduler):

```sql
delete from public.lookup_challenges where created_at < now() - interval '24 hours';
delete from public.lookup_sessions where expires_at < now();
```

No borrar desafíos dentro de la ventana de una hora, porque participan en la cuota.
Eliminar código, correo, token y secreto del navegador de logs, copias de soporte
y eventos de telemetría. Validar retención y backups de las tablas nuevas.

## Pruebas y límites de la verificación local

`npm test` ejecuta pruebas unitarias de política, rutas, criptografía/RPC y
regresiones existentes. Los mocks NO prueban el bloqueo real de PostgreSQL.
La suite `tests/integration/lookupAccessDatabase.test.js` requiere PostgreSQL y
psql, que no están instalados en este entorno. Es un bloqueo de verificación
para activar, no evidencia de que SQL haya pasado.

Para reproducir en una base PostgreSQL 14+ DESECHABLE y local llamada lookup_test:

1. Crear roles anon y authenticated sin login y service_role sin login con
   BYPASSRLS (como en Supabase) si no existen; usar un administrador solo para
   el entorno desechable. No usar Supabase productivo.
2. Aplicar la migración con `psql -X -v ON_ERROR_STOP=1 -d <URL-local> -f
   db/migrations/2026-11-06_lookup_access.sql`.
3. Definir LOOKUP_TEST_DATABASE_URL con esa URL local terminada en /lookup_test y
   ejecutar `npm test`. El runner rechaza otros hosts y otros nombres de base.
4. La suite prueba privilegios, intentos, caducidad, scopes, revocación, cuotas
   compartidas y consumo concurrente desde dos conexiones. Los datos de pruebas
   se revierten o eliminan. No aplica ni borra la migración automáticamente.
5. Verificar además RPC reales de Supabase/PostgREST, envío de correo y navegadores
   de intranet/extranet en staging. Estas integraciones no están disponibles aquí.

Resultado local de esta etapa: 123 pruebas aprobadas; cuatro pruebas PostgreSQL
omitidas por falta de psql/base local. Build de producción completado usando
SUPABASE_URL=https://example.invalid y una clave ficticia solo en el proceso de
compilación, con modo legacy. Esto comprueba compilación, no conectividad ni
funcionamiento del proveedor. Persisten avisos previos de turbopack y múltiples
lockfiles. `npm run lint` no puede ejecutarse: no existe el script ni instalación
de ESLint. `git diff --check` pasa. No se añaden dependencias para ocultar estas
limitaciones.

No se certifican criterios de ClickUp ausentes ni compatibilidad de interfaces
cuyo código no está disponible. No se realizaron commit, push, PR o despliegue.
