# Validación QR con sesión: endpoint legado

`POST /api/visits/validate` consume el QR usando exclusivamente la RPC existente
`validate_and_consume_visit_qr`, mediante `services/qrAccessService.js`.

Autenticación: sesión JWT válida en cookie `auth_token`; el middleware compartido
admite también `Authorization: Bearer <JWT>`. Roles: `guardia`, `recepcionista` y
`administrador`. No utiliza la API key del checador externo.

Cuerpo compatible: `{ "token": "<UUID v4>", "usuario_id": 123 }`.
`usuario_id` sigue siendo opcional y únicamente activa el log legado: la identidad
registrada siempre proviene de la sesión, nunca del cuerpo. Se admiten campos
adicionales por compatibilidad. El token se normaliza a minúsculas.

| HTTP | resultado | Comportamiento |
| --- | --- | --- |
| 200 | valido | La RPC confirmó un nuevo acceso. |
| 400 | invalido | Cuerpo/token incorrecto, token desconocido o reemplazado, visita no aprobada o intento anterior a la ventana. |
| 422 | expirado | Intento posterior al final de la ventana. |
| 409 | utilizado | Ya existe un acceso para la visita. |
| 401 | no_autorizado | Sesión ausente, inválida o expirada. |
| 403 | prohibido | Rol no autorizado. |
| 503 | error_servicio | RPC, transporte o respuesta del servicio no disponibles. |

Todas las respuestas incluyen `Cache-Control: no-store`, `success`, `valid` y
`resultado`. Solo `valido` establece ambos booleanos en `true`. Los rechazos
incluyen `error` genérico, sin detalles internos ni datos personales.

Se conserva `data: visita` en el éxito mediante una consulta informativa posterior
al consumo. Esa consulta no concede acceso. Si falla (por ejemplo, por un cambio
de estado concurrente), se devuelve `data: null` y se conserva el éxito ya
confirmado. El log también es de mejor esfuerzo. Los consumidores deben admitir
`data: null`; no se dispone del código de la intranet en este repositorio para
verificar su manejo de este caso. Los nuevos estados HTTP son intencionales.

PostgreSQL verifica aprobación, token actual y ventana inclusiva de ±30 minutos
respecto de fecha/hora local en `America/Mexico_City`. Antes del inicio responde
`invalido`; después del final, `expirado`. El acceso registrado tiene precedencia
y devuelve `utilizado`. El bloqueo de fila y la restricción única por visita
impiden un segundo consumo, incluso concurrente. No se calcula otra ventana en
Node ni se duplica la lógica con `qrVigencia.js`.

Requiere las migraciones existentes de `Accesos_QR` y la RPC, y los permisos de
`service_role`. Esta tarea no aplica ni modifica migraciones. Deben confirmarse
los tipos SQL de fecha/hora y el despliegue de la RPC antes de habilitar el flujo.
Una respuesta perdida tras el commit puede producir `utilizado` al reintentar;
un error de transporte no demuestra que PostgreSQL haya revertido el consumo.

Vitest verifica la autenticación y roles, el contrato HTTP, el uso del servicio
real con RPC simulada, la propagación de resultados secuenciales/concurrentes y
el cierre seguro ante errores. Los mocks no prueban el reloj, los límites
temporales, permisos, bloqueos ni atomicidad de PostgreSQL. Esas garantías requieren
pruebas con una base aislada real; no se ejecutan contra producción.
