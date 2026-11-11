# Validación y consumo del QR

`POST /api/visits/validate-qr` requiere HTTPS, `Content-Type: application/json`,
`x-api-key: <clave>` y un cuerpo con exclusivamente `{ "token": "<UUID v4>" }`.
El cuerpo está limitado a 1024 bytes. No admite identidad del checador ni fechas
del cliente. La ruta `/api/visits/validate` también consume accesos, con sesión
y roles internos; consulta [su contrato](validar-qr-legado.md). El checador externo
debe usar `/api/visits/validate-qr` con su API key.

## Configuración

- `CHECKER_API_KEY`: secreto exclusivo, aleatorio, de al menos 32 bytes y como
  máximo 512 bytes. Usar, por ejemplo, 32 bytes aleatorios codificados en hex.
  Configurar en el backend y en el componente confiable del checador. Nunca usar
  una variable `NEXT_PUBLIC_`, incluirlo en JavaScript público, URL o logs.
  Rotar cambiándolo en ambos extremos. Una clave compartida identifica al
  servicio checador, no a cada dispositivo físico.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: las variables existentes del
  backend. No entregar la clave de Supabase al checador.

No se aceptan JWT, cookies ni roles como sustituto de la API key. La ausencia o
configuración inválida de la clave cierra el acceso con un error genérico.

## Respuestas

Todas tienen `Cache-Control: no-store` y únicamente
`{ "success": boolean, "resultado": "..." }`.

| HTTP | resultado | Significado |
| --- | --- | --- |
| 200 | `valido` | Se registró un acceso nuevo. |
| 422 | `expirado` | Pasó el límite superior de vigencia. |
| 409 | `utilizado` | La visita ya tiene acceso registrado. |
| 400 | `invalido` | Entrada incorrecta, QR desconocido/reemplazado, visita no aprobada o aún fuera de la ventana por anticipación. |
| 401 | `no_autorizado` | API key ausente o incorrecta. |
| 429 | `no_autorizado` | Cuota excedida; `Retry-After: 60`. |
| 503 | `error_servicio` | Configuración, RPC o almacenamiento no disponibles. |

Un rechazo no escribe un acceso. Una respuesta perdida después del commit puede
dar `utilizado` al reintentar: no significa que se haya concedido un segundo acceso.
No se devuelven tokens, datos personales ni mensajes internos de Supabase.

## Dependencia de base de datos

La tabla de `2026-11-06_tabla_accesos_qr.sql` ya está aplicada. La nueva migración
`2026-11-07_validar_consumir_qr.sql` **debe aplicarse por separado antes de usar
el endpoint**. El desarrollo de esta feature no la ejecuta.

La RPC `validate_and_consume_visit_qr(text)` usa SECURITY INVOKER, search_path
vacío y EXECUTE exclusivo de service_role. Se mantienen RLS y la restricción
UNIQUE(visita_id). El backend privilegiado debe ser el único consumidor; RLS no
limita a service_role. La migración concede los permisos de tabla y secuencia
necesarios para el esquema de la migración original.

La función bloquea la visita y verifica el QR actual, aprobación, ausencia de
acceso y vigencia antes del INSERT. El bloqueo serializa validaciones y cambios
de estado/QR. El INSERT usa ON CONFLICT(visita_id) DO NOTHING, sin UPDATE ni
sobrescritura; devuelve `utilizado` si otra operación ganó. Errores de otro tipo
se propagan como error de servicio y revierten la transacción. Tokens duplicados
en datos legacy también fallan de forma cerrada.

`fecha` debe representar una fecha local y `hora_inicio` una hora local sin zona
de America/Mexico_City. La RPC convierte esa combinación con reglas IANA y toma
clock_timestamp() después del bloqueo. Los límites ±30 minutos son inclusivos y
cruzan medianoche correctamente. `utils/qrVigencia.js` utiliza también una ventana
de ±30 minutos, Intl/IANA y conserva segundos, pero no existe equivalencia temporal
absoluta entre ambas implementaciones:

- JavaScript trunca fracciones a milisegundos; PostgreSQL conserva microsegundos.
- El endpoint del visitante usa el reloj de Node y la RPC el de PostgreSQL.
  Un desfase entre servidores puede producir diferencias de estado.
- En transiciones históricas de horario, el helper puede elegir una ocurrencia
  distinta para horas ambiguas y rechaza horas inexistentes; PostgreSQL aplica
  sus propias reglas de resolución. No usar esos horarios para nuevas visitas.
- Versiones distintas de ICU/tzdata pueden interpretar zonas de forma diferente.

La RPC es la autoridad para conceder el acceso; la ventana mostrada al visitante
es informativa. Mantener los relojes sincronizados e ICU/tzdata actualizados.

El helper admite `fecha` como `AAAA-MM-DD` y también como timestamp ISO con
separador T o espacio, segundos, fracción opcional y zona opcional. Conserva el
día escrito en los primeros diez caracteres, como el helper original y los
endpoints de historial/detalle; no lo convierte a otro día mediante UTC. Valida
el calendario y el sufijo para no aceptar cadenas arbitrarias. `hora_inicio`
admite `HH:MM`, `HH:MM:SS` o hasta seis decimales de segundo, sin zona.

El repositorio confirma que POST /visits/me valida fechas AAAA-MM-DD y normaliza
horas a HH:MM:SS; los registros multipart envían ambos campos sin conversión.
visitService los inserta y recupera directamente. Esto sugiere date y time sin
zona, pero no demuestra tipos SQL: también podrían existir columnas de texto u
otras conversiones. No hay DDL de Visitas ni muestras reales de Supabase.
El soporte de timestamp conserva compatibilidad de presentación, sin demostrar
equivalencia con el cast SQL: si fecha fuera timestamptz, fecha::date dependería
de la zona de la sesión PostgreSQL. Confirmar los tipos y serialización reales
antes de habilitar la RPC en producción.

## Limitación de solicitudes

Se reutiliza checkRateLimit con un bucket GLOBAL fijo por proceso para esta
ruta: 120 solicitudes/minuto, antes de autenticar. Incluye credenciales
incorrectas y no utiliza x-forwarded-for, x-real-ip ni la clave suministrada.
Cambiar cabeceras no permite abrir nuevos buckets. La cuota es compartida por
todos los checadores; un atacante puede agotar temporalmente esta cuota.

El Map no se comparte entre instancias y se pierde al reiniciar. Con N procesos
puede admitirse hasta N veces la cuota; no es un límite global distribuido.
En producción con varias instancias, añadir un límite compartido en el punto de
entrada o almacenamiento con incrementos atómicos. El proxy debe reemplazar
cabeceras de IP y restringir el acceso directo al backend. También debe limitar
tamaño y duración de solicitudes. El límite local es una capa adicional.
