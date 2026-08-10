# Épica 3 - Cola

## Resumen

La Épica 3 implementa la cola de turnos de Espera. Permite que un usuario saque
turno desde la app, siga su posición en tiempo real, suba de prioridad
confirmando que está en camino o que llegó, y cancele su turno. Permite también
que el empleado opere la cola: llamar al siguiente, ver la lista activa, agregar
turnos manuales para personas sin app, cancelar cualquier turno y marcar turnos
como atendidos. El orden de la cola respeta una jerarquía de prioridad con FIFO
como desempate.

Alcance total: `34 pts` (12 historias).

Formato de referencia: `docs/story-documentation-standard.md`

## Estado general

- Estado: `completo + refinamientos`.
- Historias implementadas: `HU-3.1`, `HU-3.2`, `HU-3.3`, `HU-3.4`, `HU-3.5`,
  `HU-3.6`, `HU-3.7`, `HU-3.8`, `HU-3.9`, `HU-3.10`, `HU-3.11`, `HU-3.12`.
- Refinamientos: `estado attending`, `promedio real 7 días`, `ventanillas de
  servicio`, `visibilidad de ventanillas`, `ocupación y derivación entre
  ventanillas`, `CRUD completo de ventanillas`.

## Contratos principales de la épica

```text
POST   /api/queue/:queueId/turns                             turn:create
GET    /api/queue/:queueId/turns                             queue:read
GET    /api/queue/:queueId/turns/my-turn                     turn:read_own
POST   /api/queue/:queueId/turns/my-turn/confirm-transit     turn:update_own
POST   /api/queue/:queueId/turns/my-turn/confirm-arrival     turn:update_own
POST   /api/queue/:queueId/turns/manual                      turn:create_manual
POST   /api/queue/:queueId/turns/:turnId/cancel              turn:cancel_any
POST   /api/queue/:queueId/turns/:turnId/attend              turn:attend
POST   /api/queue/turns/call-next                            queue:call_next
POST   /api/queue/turns/cancel                               turn:cancel
GET    /api/queue/:queueId/status                            queue:read
GET    /api/queue/:queueId/turns/history?date=YYYY-MM-DD     queue:read
GET    /api/queue/:queueId/metrics?date=YYYY-MM-DD           queue:read
POST   /api/queue/:queueId/turns/:turnId/redirect             turn:attend
GET    /api/queue/:queueId/windows                            queue:read
POST   /api/queue/:queueId/windows                            queue:configure
PATCH  /api/queue/:queueId/windows/:windowId                  queue:configure
PATCH  /api/queue/:queueId/windows/:windowId/toggle           queue:configure
DELETE /api/queue/:queueId/windows/:windowId                  queue:configure
```

> **Nota de mount**: el router se monta en `/api/queue` (singular) en
> `src/app.ts`. Las versiones anteriores de este documento usaban
> `/api/queue/` (plural) por error.
>
> **Queue bootstrap**: la cola inicial `("Caja principal", prefix "A")` se
> crea automáticamente al aprobar el Business en
> `ApproveBusinessAccountUseCase`. El `activeQueueId` se expone en
> `GET /api/business/me` para que el frontend pueda arrancar sin un paso
> extra de configuración.

## Modelo de datos central

Tablas:

- `queues`: una cola por negocio (extensible a N colas). Migración `20260717100000_add_queues_and_turns`.
- `turns`: turno individual dentro de una cola para una fecha de operación. Misma migración.
- `service_windows`: ventanillas de atención de una cola. Migración `20260729000001_service_windows`.

Entidades de dominio:

```typescript
interface Queue {
  id: string;
  businessId: string;
  name: string;
  prefix: string;     // prefijo del displayNumber, ej. "A"
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ServiceWindowType = "cashier" | "customer_service" | "information" | "admin" | "technical";

interface ServiceWindow {
  id: string;
  queueId: string;
  name: string;           // ej. "Ventanilla 1", "Preferencial"
  type: ServiceWindowType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type TurnStatus   = "waiting" | "called" | "attending" | "cancelled" | "completed";
type TurnPriority = "arrived" | "physical" | "in_transit" | "registered";
type TurnSource   = "app" | "manual" | "qr" | "web";

interface Turn {
  id: string;
  queueId: string;
  businessId: string;
  customerId?: string;
  guestName?: string;
  serviceWindowId?: string;   // asignado en called → attending
  number: number;
  displayNumber: string;
  status: TurnStatus;
  priority: TurnPriority;
  source: TurnSource;
  turnDate: Date;
  calledAt?: Date;
  startedAttentionAt?: Date;  // momento en que el empleado inicia atención
  attendedAt?: Date;          // momento en que finaliza la atención
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

Enums de DB: `TurnStatus`, `TurnPriority`, `TurnSource`, `ServiceWindowType`
(mayúsculas en Postgres; los repos mapean a minúsculas en dominio).

Índices en `turns`:

- `(queueId, status)` — para llamar al siguiente y consultar cola activa.
- `(customerId, status)` — para el chequeo de turno activo cross-business.
- `(businessId, turnDate)` — para agrupar por día de operación.

Índices en `service_windows`:

- `(queueId)` — para listar ventanillas de una cola.

`turnDate` normalizado a medianoche UTC (`todayUTC()`) para consistencia entre
zonas horarias de app y servidor.

## Infraestructura de tiempo real

Todas las acciones que modifican el estado de la cola emiten un evento
`queue:update` al room `queue:{queueId}` de Socket.IO vía
`SocketIOEmitter.emitQueueUpdate(queueId, payload)`. El payload varía por acción
(ver cada historia). Los clientes suscritos al room reciben el evento y pueden
actualizar su vista sin hacer polling.

## Códigos de error

Todos los `AppError` funcionales del módulo (404/409/403) incluyen un `code`
además del `message` en inglés, para que el frontend pueda mapear a texto en
español sin parsear el mensaje. La respuesta HTTP expone ambos campos en el
JSON de error. Los errores de validación de input (Zod) no llevan `code` — su
mensaje ya es específico por campo.

| Código | HTTP | Significado |
|---|---|---|
| `QUEUE_NOT_FOUND` | 404 | La cola no existe. |
| `QUEUE_NOT_ACTIVE` | 409 | La cola existe pero está inactiva (llamar siguiente). |
| `QUEUE_EMPTY` | 409 | No hay turnos en espera para llamar. |
| `QUEUE_NOT_ACCEPTING_TURNS` | 409 | La cola está inactiva (sacar turno / turno manual). |
| `BUSINESS_NOT_FOUND` | 404 | El negocio de la cola no existe (reusa el código de `business`). |
| `BUSINESS_NOT_ACCEPTING_CUSTOMERS` | 409 | El negocio no está `approved`. |
| `BUSINESS_OPERATIONAL_STATUS_BLOCKED` | 409 | El negocio está `paused` o `closed`. |
| `CUSTOMER_HAS_ACTIVE_TURN` | 409 | El cliente ya tiene un turno activo en otro negocio. |
| `TURN_NOT_FOUND` | 404 | El turno no existe o no hay turno activo para ese cliente/cola. |
| `TURN_NOT_OWNED` | 403 | El turno no pertenece al `customerId` que intenta cancelarlo. |
| `TURN_NOT_CANCELLABLE` | 409 | El turno no está en un estado cancelable. |
| `TURN_INVALID_STATUS_FOR_ATTEND` | 409 | Transición inválida (`attend`, `confirm-transit`, `confirm-arrival`, `redirect`). |
| `SERVICE_WINDOW_NOT_FOUND` | 404 | La ventanilla de servicio no existe (o no pertenece a la cola, en `redirect`). |
| `SERVICE_WINDOW_OCCUPIED` | 409 | La ventanilla ya está atendiendo otro turno (`attend`). |
| `SERVICE_WINDOW_IN_USE` | 409 | La ventanilla está atendiendo un turno (`toggle` a inactiva / `delete`). |
| `REDIRECT_SAME_WINDOW` | 400 | Se intentó derivar un turno a la ventanilla en la que ya está. |

---

## HU-3.1 - Sacar turno desde la app

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Permitir que un usuario final con sesión activa saque turno en una cola
específica de un negocio desde la app mobile. El resultado es un turno en
estado `waiting` con un número visible (ej. `A-001`) que el usuario puede
mostrar o consultar mientras espera.

### Criterios de aceptación

- Dado que selecciono un negocio y toco "Sacar turno", cuando la cola está
  abierta, entonces recibo un número de turno único para hoy.
- Dado que ya tengo un turno activo en otro negocio, cuando intento sacar
  turno, entonces veo un mensaje que me pide cancelar el turno anterior.
- Dado que el negocio está pausado o cerrado, cuando intento sacar turno,
  entonces veo que no se aceptan nuevos turnos.
- Dado que dos usuarios sacan turno al mismo tiempo, entonces los números
  asignados son correlativos sin huecos ni duplicados.

### Decisiones de alcance

La HU cubre exclusivamente el camino de sacar turno desde la app con sesión.
Quedan fuera:

- Turno como invitado sin sesión (sin `customerId`): el endpoint acepta
  `customerId` opcional para soportar ese flujo en el futuro, pero HU-3.1
  no lo requiere aún.
- Cola con sistema de prioridad (arrived, physical, in_transit): el campo
  `priority` existe en el modelo pero HU-3.1 siempre asigna `registered`.
- Sacar turno por QR (source `qr`) o web (source `web`): el campo `source`
  existe; HU-3.1 siempre asigna `app`.
- Notificaciones push: diferidas a épicas de notificaciones.
- Estado de cola en tiempo real (Socket.IO): implementado en HU-3.2.

### Contrato backend

```text
POST /api/queue/:queueId/turns
```

Requiere autenticación y permiso `turn:create`.

Request: no requiere body. El `customerId` se extrae del JWT (`request.user.id`).

Respuesta `201`:

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-001",
  "position": 1
}
```

- `displayNumber`: prefijo de la cola + número correlativo del día con padding
  a 3 dígitos (ej. `A-001`, `B-012`).
- `position`: posición en la cola en el momento de creación considerando
  jerarquía de prioridad (ver HU-3.12).

### Reglas de negocio

1. La cola debe existir y tener `isActive = true`.
2. El negocio asociado debe tener `status = approved`.
3. El negocio no puede tener `operationalStatus = paused` ni `closed`.
4. Si se provee `customerId`, el cliente no puede tener un turno activo
   (`waiting` o `called`) en ningún negocio. El mensaje de error indica que
   debe cancelarlo primero.
5. El número de turno se asigna dentro de una transacción con `FOR UPDATE`
   sobre la fila del queue en Postgres, garantizando secuencia sin huecos
   bajo concurrencia alta.
6. La prioridad es siempre `registered` y el source siempre `app`.

### Cobertura

- `tests/unit/queue/CreateTurnUseCase.test.ts`

---

## HU-3.2 - Ver posición en la cola en tiempo real

Story points: `5`

Estado: `implementado`.

### Objetivo de producto

Permitir que el usuario vea su posición actualizada en tiempo real sin necesidad
de recargar la pantalla. Cuando el empleado llama al siguiente turno, la
posición de todos los usuarios en cola avanza automáticamente.

### Criterios de aceptación

- Dado que estoy en la cola, cuando el negocio llama al siguiente turno,
  entonces mi posición se actualiza en pantalla en menos de 1 segundo vía
  WebSocket.
- Dado que pierdo conexión, cuando recupero señal, entonces mi posición se
  sincroniza automáticamente.

### Contrato backend

El backend emite un evento `queue:update` al room `queue:{queueId}` cada vez
que el estado de la cola cambia. El cliente se suscribe al room y refresca su
posición llamando a `GET /api/queue/:queueId/turns/my-turn`.

El room se identifica como `queue:{queueId}`. La emisión se realiza vía
`SocketIOEmitter.emitQueueUpdate(queueId, payload)`.

### Eventos e integraciones

Socket.IO: `SocketIOEmitter` inyectado como dependencia opcional en todos los
use cases que modifican la cola. Si es `null` (tests o entorno sin socket),
la emisión se omite sin romper el flujo.

### Cobertura

Cubierta indirectamente por los tests de `CallNextUseCase`,
`CancelTurnUseCase`, `ConfirmTurnStatusUseCase`, `CancelTurnByEmployeeUseCase`
y `AttendTurnUseCase`, todos los cuales verifican que `emitQueueUpdate` es
llamado con el payload correcto.

---

## HU-3.3 - Tiempo estimado de espera

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Mostrar al usuario cuántos minutos aproximados le quedan de espera, calculado
a partir de su posición en la cola, el tiempo promedio de atención del negocio
y la cantidad de ventanillas activas.

### Criterios de aceptación

- Dado que estoy en la cola, entonces veo el tiempo estimado calculado como:
  `⌈(posición - 1) / ventanillas_activas⌉ × promedio_minutos`.
- Dado que el negocio tiene 0 ventanillas activas, entonces el estimado es
  `null` (sin atención disponible).

### Contrato backend

`GET /api/queue/:queueId/turns/my-turn` devuelve `estimatedWaitMinutes` junto
con la posición (ver HU-3.2). Requiere permiso `turn:read_own`.

Respuesta `200`:

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-003",
  "status": "waiting",
  "position": 3,
  "estimatedWaitMinutes": 10,
  "serviceWindowId": null
}
```

- `estimatedWaitMinutes`: entero en minutos, o `null` si `activeServiceWindows`
  es 0.
- `status: "called" | "attending" | "redirected"` devuelven `position: 0` y
  `estimatedWaitMinutes: 0` — una vez que el turno salió de la fila
  (`waiting`), la posición/estimado de espera dejan de tener sentido y no se
  recalculan (antes de este fix, `attending`/`redirected` caían por error en
  la misma rama que `waiting` y devolvían una posición fantasma).
- `serviceWindowId`: la ventanilla donde el turno está siendo (o va a ser)
  atendido. `null` para `waiting` (todavía no hay ventanilla asignada).

### Reglas de negocio

1. El promedio de atención se calcula sobre los turnos `completed` del día con
   `calledAt` y `attendedAt` registrados.
2. Si no hay turnos completados, se usa el default de `5` minutos.
3. La fórmula es `⌈turnosAdelante / ventanillasActivas⌉ × promedioMinutos`.
4. `activeServiceWindows` se obtiene del `Business` asociado a la cola.
5. Solo un turno en `waiting` recalcula posición/estimado en cada consulta;
   `called`, `attending` y `redirected` devuelven valores fijos (0/0) sin
   volver a consultar `countWaitingAhead`.

### Cobertura

- `tests/unit/queue/GetMyTurnUseCase.test.ts`
- `tests/unit/queue/QueueWaitEstimateService.test.ts`

---

## HU-3.4 - Confirmar en camino

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Permitir que el usuario avise que está en camino al local, subiendo su prioridad
en la cola de `registered` a `in_transit`.

### Criterios de aceptación

- Dado que toco "Estoy en camino", cuando confirmo, entonces mi turno sube de
  prioridad `registered` a `in_transit`.
- Dado que ya confirmé que estoy en camino, entonces el botón cambia a
  "Confirmar llegada".

### Contrato backend

```text
POST /api/queue/:queueId/turns/my-turn/confirm-transit
```

Requiere autenticación y permiso `turn:update_own`. No requiere body.

Respuesta `200`:

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-002",
  "priority": "in_transit"
}
```

Emite `queue:update` con `{ updatedTurnId, updatedPriority }`.

### Reglas de negocio

1. El turno debe estar en estado `waiting` o `called`.
2. La transición es `registered → in_transit`. No se puede confirmar tránsito
   si ya se confirmó llegada.

### Cobertura

- `tests/unit/queue/ConfirmTurnStatusUseCase.test.ts`

---

## HU-3.5 - Confirmar llegada

Story points: `2`

Estado: `implementado`.

### Objetivo de producto

Permitir que el usuario confirme que ya está físicamente en el local, subiendo
su prioridad al máximo: `in_transit → arrived`.

### Criterios de aceptación

- Dado que llego al local y toco "Llegué", cuando confirmo, entonces mi turno
  sube a prioridad `arrived` (máxima).
- Dado que confirmo llegada, entonces el negocio ve en su panel que el usuario
  está físicamente presente.

### Contrato backend

```text
POST /api/queue/:queueId/turns/my-turn/confirm-arrival
```

Requiere autenticación y permiso `turn:update_own`. No requiere body.

Respuesta `200`:

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-002",
  "priority": "arrived"
}
```

Emite `queue:update` con `{ updatedTurnId, updatedPriority }`.

### Reglas de negocio

1. La transición es `in_transit → arrived`. Solo se puede confirmar llegada
   si el turno está en `in_transit`.
2. HU-3.4 y HU-3.5 comparten `ConfirmTurnStatusUseCase` con un parámetro
   `action: "in_transit" | "arrived"` que define la transición.

### Cobertura

- `tests/unit/queue/ConfirmTurnStatusUseCase.test.ts`

---

## HU-3.6 - Cancelar mi turno

Story points: `2`

Estado: `implementado`.

### Objetivo de producto

Permitir que el usuario cancele su propio turno activo cuando decide no seguir
esperando.

### Criterios de aceptación

- Dado que cancelo mi turno, cuando confirmo, entonces se libera mi posición y
  los usuarios detrás avanzan automáticamente.
- Dado que cancelo mi turno, entonces recibo push de confirmación de
  cancelación.

### Contrato backend

```text
POST /api/queue/turns/cancel
```

Requiere autenticación y permiso `turn:cancel`.

Request body:

```json
{ "turnId": "uuid" }
```

Respuesta `200`:

```json
{ "cancelled": true, "turnId": "uuid" }
```

Emite `queue:update` con `{ cancelledTurnId, cancelledDisplayNumber }`.

### Reglas de negocio

1. El turno debe pertenecer al `customerId` del JWT (ownership check).
2. Solo se puede cancelar un turno en estado `waiting` o `called`.
3. Turnos `completed` o `cancelled` devuelven `409`.
4. Registra `cancelledAt` con la hora actual.

### Cobertura

- `tests/unit/queue/CancelTurnUseCase.test.ts`

---

## HU-3.7 - Llamar al siguiente turno

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Permitir que el empleado llame al siguiente turno con un botón, avanzando la
cola según la jerarquía de prioridad.

### Criterios de aceptación

- Dado que toco "Siguiente", cuando confirmo, entonces el turno en espera con
  mayor prioridad pasa a estado `called`.
- Dado que llamo al siguiente, entonces ese usuario recibe push "Es tu turno".
- Dado que no hay más turnos, entonces el sistema lo informa.

### Contrato backend

```text
POST /api/queue/turns/call-next
```

Requiere autenticación y permiso `queue:call_next`.

Request body:

```json
{ "queueId": "uuid" }
```

Respuesta `200`:

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-001",
  "calledAt": "2026-01-01T10:00:00.000Z"
}
```

Emite `queue:update` con `{ calledTurnId, calledDisplayNumber }`.

### Reglas de negocio

1. Si hay un turno en estado `called`, primero se marca como `completed` antes
   de llamar al siguiente (el empleado no puede tener dos turnos llamados
   simultáneamente).
2. El siguiente turno se selecciona con `findNextWaitingTurn`, que respeta la
   jerarquía de prioridad (ver HU-3.12).
3. Si no hay turnos en espera, devuelve `404`.
4. Registra `calledAt` en el turno.

### Cobertura

- `tests/unit/queue/CallNextUseCase.test.ts`

---

## HU-3.8 - Ver lista de turnos activos en tiempo real

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Permitir que el empleado vea en el panel la lista completa de turnos activos
(waiting y called) ordenados por jerarquía de prioridad, con nombre del
usuario, tiempo de espera y estado.

### Criterios de aceptación

- Dado que estoy en el panel, entonces veo la lista de todos los turnos con:
  número, nombre del usuario, tiempo de espera y estado de prioridad.
- Dado que un usuario cambia su estado, entonces su fila se actualiza en tiempo
  real sin recargar.

### Contrato backend

```text
GET /api/queue/:queueId/turns
```

Requiere autenticación y permiso `queue:read`.

Respuesta `200`:

```json
{
  "queueId": "uuid",
  "items": [
    {
      "turnId": "uuid",
      "displayNumber": "A-001",
      "customerName": "Juan García",
      "guestName": null,
      "priority": "arrived",
      "status": "attending",
      "createdAt": "2026-01-01T10:00:00.000Z",
      "waitingMinutes": 12,
      "estimatedWaitMinutes": null,
      "serviceWindowId": "uuid",
      "serviceWindowName": "Caja 1"
    }
  ]
}
```

- `items` está ordenado por prioridad (arrived primero) y por `createdAt` para
  desempate (FIFO).
- `waitingMinutes`: minutos enteros desde `createdAt` hasta ahora.
- `customerName`: nombre completo del usuario registrado, o `null` para turnos
  manuales.
- `guestName`: nombre ingresado por el empleado para turnos manuales, o `null`.
- La lista incluye turnos de cualquier `turnDate`, no filtra por fecha. El
  estado activo (`waiting`, `called` o `attending`) determina la inclusión.
- `serviceWindowId` / `serviceWindowName`: ventanilla asignada al turno (ver
  refinamiento *Visibilidad de ventanillas*). `null` si el turno todavía no
  tiene ventanilla asignada.

### Reglas de negocio

1. `ActiveTurnSummary` es un tipo de consulta especializado que evita exponer
   el dominio `Turn` completo con datos de usuario.
2. `findActiveByQueue` hace un JOIN con `customer` para obtener el nombre sin
   requerir una consulta separada.

### Cobertura

- `tests/unit/queue/GetQueueListUseCase.test.ts`

---

## HU-3.9 - Agregar turno manualmente

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Permitir que el empleado registre en la cola a una persona que se presenta
físicamente sin app ni dispositivo. El turno se crea con prioridad `physical`,
equivalente a presencia física.

### Criterios de aceptación

- Dado que toco "Agregar manual" e ingreso un nombre, cuando confirmo, entonces
  se crea un turno con prioridad `physical`.
- Dado que agrego un turno manual, entonces aparece en la cola con indicador
  visual diferenciado de los turnos virtuales.

### Contrato backend

```text
POST /api/queue/:queueId/turns/manual
```

Requiere autenticación y permiso `turn:create_manual`.

Request body:

```json
{ "guestName": "María López" }
```

- `guestName`: requerido, entre 1 y 100 caracteres.

Respuesta `201`:

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-005",
  "guestName": "María López",
  "position": 2
}
```

Emite `queue:update` con `{ newTurnId, newDisplayNumber, guestName }`.

### Reglas de negocio

1. No requiere `customerId` (turno sin cuenta de usuario).
2. `source` es siempre `manual`. `priority` es siempre `physical`.
3. No aplica el chequeo de turno activo cross-business (solo aplica para
   usuarios autenticados con `customerId`).
4. El negocio debe existir y estar aprobado. La cola debe estar activa.

### Cobertura

- `tests/unit/queue/CreateManualTurnUseCase.test.ts`

---

## HU-3.10 - Cancelar turno desde el panel

Story points: `2`

Estado: `implementado`.

### Objetivo de producto

Permitir que el empleado cancele cualquier turno de la cola, sin importar a
quién pertenece.

### Criterios de aceptación

- Dado que cancelo un turno desde el panel, cuando confirmo, entonces ese
  usuario recibe push de cancelación.
- Dado que cancelo un turno, entonces los usuarios detrás avanzan
  automáticamente en posición.

### Contrato backend

```text
POST /api/queue/:queueId/turns/:turnId/cancel
```

Requiere autenticación y permiso `turn:cancel_any`.

No requiere body.

Respuesta `200`:

```json
{ "cancelled": true, "turnId": "uuid" }
```

Emite `queue:update` con `{ cancelledTurnId, cancelledDisplayNumber }`.

### Reglas de negocio

1. Sin verificación de ownership. El empleado puede cancelar cualquier turno.
2. Solo se puede cancelar un turno en estado `waiting` o `called`.
3. Registra `cancelledAt` con la hora actual.

### Cobertura

- `tests/unit/queue/CancelTurnByEmployeeUseCase.test.ts`

---

## HU-3.11 - Marcar turno como atendido

Story points: `1`

Estado: `implementado`.

### Objetivo de producto

Permitir que el empleado marque un turno como atendido una vez que la atención
finalizó. El turno pasa al historial con timestamp de atención.

### Criterios de aceptación

- Dado que marco un turno como atendido, entonces pasa a historial con
  timestamp de inicio y fin de atención.
- Dado que marco como atendido, entonces el tiempo de atención se usa para
  recalcular el promedio del negocio.

### Contrato backend

```text
POST /api/queue/:queueId/turns/:turnId/attend
```

Requiere autenticación y permiso `turn:attend`.

Request body (opcional):

```json
{ "serviceWindowId": "uuid" }
```

- `serviceWindowId`: UUID de la ventanilla que atiende el turno. Solo se aplica
  en la transición `called → attending`. Se ignora en `attending → completed`.

Respuesta `200` — primera llamada (`called → attending`):

```json
{
  "turnId": "uuid",
  "status": "attending",
  "startedAttentionAt": "2026-01-01T10:14:00.000Z"
}
```

Respuesta `200` — segunda llamada (`attending → completed`):

```json
{
  "turnId": "uuid",
  "status": "completed",
  "attendedAt": "2026-01-01T10:19:00.000Z"
}
```

Primera llamada emite `queue:update` con `{ attendingTurnId, attendingDisplayNumber }`.

Segunda llamada emite `queue:update` con `{ attendedTurnId, attendedDisplayNumber }`.

### Reglas de negocio

1. El endpoint progresa la máquina de estados en dos pasos sucesivos:
   - `called` → `attending`: registra `startedAttentionAt` y, si se provee,
     asigna `serviceWindowId`. Responde `{ status: "attending", startedAttentionAt }`.
   - `attending` → `completed`: registra `attendedAt`. Responde
     `{ status: "completed", attendedAt }`.
2. Un turno `waiting`, `completed` o `cancelled` rechaza la llamada con
   `409 Conflict`.
3. El tiempo de servicio real (`attendedAt - startedAttentionAt`) alimenta el
   promedio de los últimos 7 días usado en el estimado de espera (HU-3.3).
   El intervalo `calledAt → startedAttentionAt` (tiempo de reacción del
   cliente) queda excluido del promedio.

### Cobertura

- `tests/unit/queue/AttendTurnUseCase.test.ts`

---

## HU-3.12 - Jerarquía de prioridad en la cola

Story points: `5`

Estado: `implementado`.

### Objetivo de producto

Garantizar que el orden de la cola respete una jerarquía de prioridad en lugar
de ser puramente FIFO por número de registro. Los usuarios que confirman su
llegada tienen prioridad sobre los que están en camino, y estos sobre los que
simplemente se registraron.

### Criterios de aceptación

- Dado que hay turnos con distintos estados, entonces el orden respeta:
  (1) `arrived`, (2) `physical`, (3) `in_transit`, (4) `registered`.
- Dado que dos usuarios tienen la misma prioridad, entonces se resuelve por
  FIFO (número de turno).
- Dado que un usuario sube de prioridad, entonces la cola se reordena en tiempo
  real y todos los afectados ven su nueva posición.
- Dado que hay un turno manual, entonces se trata como `physical` por defecto.

### Reglas de negocio

La jerarquía se implementa en tres lugares:

1. **`findNextWaitingTurn`** (`PostgresTurnRepo`): selecciona el turno a llamar
   aplicando el ranking en memoria sobre los resultados de la DB.

2. **`findActiveByQueue`** (`PostgresTurnRepo`): ordena la lista del panel del
   empleado aplicando el mismo ranking.

3. **`countWaitingAhead`** (`PostgresTurnRepo`): calcula la posición del usuario
   sumando:
   - Turnos `waiting` con prioridad mayor a la del turno consultado.
   - Turnos `waiting` con la misma prioridad y número de turno menor (FIFO).

   Esta función eliminó el filtro por `turnDate` — el estado activo
   (`waiting`) es suficiente para determinar que el turno es relevante.

Ranking de prioridades:

| Prioridad   | Rank | Origen                              |
|-------------|------|-------------------------------------|
| `arrived`   | 1    | Usuario confirma llegada (HU-3.5)   |
| `physical`  | 2    | Turno manual (HU-3.9)               |
| `in_transit`| 3    | Usuario confirma tránsito (HU-3.4)  |
| `registered`| 4    | Registro inicial (HU-3.1)           |

### Cobertura

- `tests/unit/queue/GetMyTurnUseCase.test.ts` (sección HU-3.12 — 4 tests de
  jerarquía de prioridad en posición)
- Cubierta indirectamente en `CallNextUseCase.test.ts` y
  `GetQueueListUseCase.test.ts`

---

## Refinamiento — Ventanillas de servicio

Rama: `bugfix/service-windows`. Migración: `20260729000001_service_windows`.

### Objetivo

Modelar las ventanillas físicas de atención de una cola para que el empleado
pueda crearlas, habilitarlas/deshabilitarlas y asignar un turno a una ventanilla
específica al inicio de la atención.

### Contratos

#### Listar ventanillas

```text
GET /api/queue/:queueId/windows
```

Permiso: `queue:read`. Respuesta `200`:

```json
{
  "windows": [
    {
      "id": "uuid",
      "queueId": "uuid",
      "name": "Ventanilla 1",
      "type": "cashier",
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "...",
      "currentTurn": {
        "turnId": "uuid",
        "displayNumber": "A-001",
        "startedAttentionAt": "2026-01-01T10:14:00.000Z"
      }
    }
  ]
}
```

Ordenadas por `createdAt` ascendente. `currentTurn` es `null` cuando la
ventanilla no tiene ningún turno `attending` asignado en este momento (ver
refinamiento *Visibilidad de ventanillas*).

#### Crear ventanilla

```text
POST /api/queue/:queueId/windows
```

Permiso: `queue:configure`.

Request body:

```json
{ "name": "Atención al cliente", "type": "customer_service" }
```

- `name`: requerido, 1–100 caracteres.
- `type`: `"cashier"` | `"customer_service"` | `"information"` | `"admin"` | `"technical"`. Default: `"cashier"`.

Respuesta `201`: objeto `ServiceWindow` completo.

#### Toggle activo/inactivo

```text
PATCH /api/queue/:queueId/windows/:windowId/toggle
```

Permiso: `queue:configure`. No requiere body.

Respuesta `200`: objeto `ServiceWindow` con `isActive` invertido.

### Reglas de negocio

1. `serviceWindowId` se asigna opcionalmente al turno en la transición
   `called → attending` (ver HU-3.11).
2. Una ventanilla inactiva no impide asignar turnos — es solo un indicador
   de disponibilidad para el frontend.
3. Al eliminar una ventanilla, la FK en `turns.serviceWindowId` es
   `SET NULL` — los turnos históricos conservan su registro sin la relación
   (ver refinamiento *Ocupación, derivación y CRUD de ventanillas*).

### Cobertura

- `tests/unit/queue/ListServiceWindowsUseCase.test.ts`
- `tests/unit/queue/CreateServiceWindowUseCase.test.ts`
- `tests/unit/queue/ToggleServiceWindowUseCase.test.ts`
- `tests/unit/queue/AttendTurnUseCase.test.ts` (sección `serviceWindowId`)

---

## Refinamiento — Visibilidad de ventanillas y promedio real

Rama: `bugfix/queue-window-visibility`. No requiere migraciones — todo se
deriva de columnas ya existentes (`turns.serviceWindowId`,
`turns.startedAttentionAt`, `turns.calledAt`, `service_windows.isActive`).

### Objetivo

El panel de cola no podía mostrar con claridad "a qué turno llamamos" ni "en
qué ventanilla está siendo atendido" porque esa información nunca se exponía
en los endpoints existentes. Este refinamiento junta 3 cambios de contrato y
1 corrección de consistencia.

### 1. Ventanilla asignada en `GET /queue/:queueId/turns`

`QueueListItem` ahora incluye `serviceWindowId` y `serviceWindowName` (ver
HU-3.8). Ambos son `null` si el turno todavía no tiene ventanilla asignada.

### 2. Turno actual de cada ventanilla en `GET /queue/:queueId/windows`

Cada `ServiceWindow` en la respuesta de `ListServiceWindowsUseCase` incluye
`currentTurn` (ver sección de ventanillas más arriba): el turno `attending`
asignado a esa ventanilla en este momento, o `null` si está libre. Una
ventanilla atiende a lo sumo un turno a la vez.

### 3. Histórico corto de llamados en `GET /queue/:queueId/status`

```json
{
  "recentCalls": [
    {
      "turnId": "uuid",
      "displayNumber": "A-003",
      "serviceWindowId": "uuid",
      "serviceWindowName": "Caja 1",
      "calledAt": "2026-01-01T10:12:00.000Z"
    }
  ]
}
```

- Últimos 5 turnos con `calledAt` no nulo de la cola, ordenados por
  `calledAt` descendente.
- No filtra por estado: un turno que ya pasó a `completed` sigue apareciendo
  un rato en el histórico, para que el panel pueda mostrar "últimos
  llamados" sin depender de que el empleado haya visto el aviso en el
  momento exacto.

### 4. Fix: `activeServiceWindows` usaba el contador legado del negocio

`GetQueueStatusUseCase` y `GetQueueListUseCase` calculaban el estimado de
espera con `business.activeServiceWindows` — el contador entero legado de
HU-2.3, independiente de las ventanillas reales creadas en
`bugfix/service-windows`. Si un negocio creaba 3 ventanillas pero solo 1
estaba activa, el estimado seguía usando el número viejo del negocio (que
nunca se actualiza al crear/activar/desactivar ventanillas).

Ahora ambos use cases cuentan `service_windows` con `isActive = true` para
esa cola. El campo legado del negocio solo se usa como fallback si la cola
todavía no tiene ninguna fila en `service_windows` (negocios que no migraron
a ventanillas individuales).

### Cobertura

- `tests/unit/queue/GetQueueListUseCase.test.ts` (secciones *ventanilla
  asignada* y *activeServiceWindows real*)
- `tests/unit/queue/ListServiceWindowsUseCase.test.ts` (`currentTurn`)
- `tests/unit/queue/GetQueueStatusUseCase.test.ts` (secciones *recentCalls*
  y *activeServiceWindows real*)

---

## Refinamiento — Ocupación, derivación y CRUD de ventanillas

Rama: `bugfix/service-window-occupancy-and-redirect`. Migración
`20260730000000_add_redirected_status` agrega `REDIRECTED` al enum
`TurnStatus`.

### Contexto

Con varias ventanillas operando en paralelo aparecieron tres gaps: (1) nada
impedía asignar dos turnos a la misma ventanilla al mismo tiempo; (2) un
turno siempre completaba en dos pasos (`called → attending → completed`) sin
forma de pasar por una segunda ventanilla cuando el negocio lo requiere (ej.
Atención al Cliente → Caja); (3) las ventanillas no se podían editar ni
eliminar, solo crear/listar/activar-desactivar.

### 1. Ocupación de ventanilla

`POST /:queueId/turns/:turnId/attend` ahora valida, antes de asignar
`serviceWindowId`, que ninguna otra ventanilla ya tenga un turno `attending`
con ese mismo `serviceWindowId`. Si la ventanilla está ocupada, responde
`409 SERVICE_WINDOW_OCCUPIED`. No aplica si el turno que se está atendiendo
es el mismo que ya ocupa esa ventanilla (reanudar tras un `redirect`).

### 2. Derivar un turno a otra ventanilla

```text
POST /api/queue/:queueId/turns/:turnId/redirect
```

Permiso: `turn:attend`.

Request body:

```json
{ "targetServiceWindowId": "uuid" }
```

Respuesta `200`:

```json
{ "turnId": "uuid", "status": "redirected", "serviceWindowId": "uuid" }
```

Emite `queue:update` con `{ redirectedTurnId, redirectedDisplayNumber, targetServiceWindowId }`.

**Reglas de negocio:**

1. Solo un turno `attending` puede derivarse. Cualquier otro estado responde
   `409 TURN_INVALID_STATUS_FOR_ATTEND`.
2. La ventanilla destino debe existir y pertenecer a la misma cola que el
   turno — si no, `404 SERVICE_WINDOW_NOT_FOUND`.
3. No se puede derivar a la ventanilla en la que ya está — `400
   REDIRECT_SAME_WINDOW`.
4. A diferencia de `attend`, `redirect` **no** valida ocupación del destino:
   deriva "virtualmente" al turno (pasa a `redirected` con el
   `serviceWindowId` sugerido) sin iniciar atención ahí. El empleado de esa
   ventanilla lo retoma llamando `attend` sobre ese mismo `turnId` cuando
   esté libre — en ese momento sí se valida ocupación (punto 1).
5. `startedAttentionAt` **no se reinicia** en el redirect ni al retomar la
   atención: se conserva el timestamp original. El promedio de servicio
   (`getAverageServiceMinutes`) mide el tiempo total del cliente en el
   sistema (`attendedAt - startedAttentionAt` de punta a punta), no el
   tiempo en cada ventanilla individual — no hay tabla de segmentos por
   ventanilla en este alcance.
6. Un turno `redirected` cuenta como turno activo (`findActiveByQueue`,
   `GetQueueStatusOutput.redirectedCount`, `QueueListItem.status`) y bloquea
   que el mismo cliente saque un turno nuevo en otro negocio, igual que
   `waiting`/`called`/`attending`.

### 3. CRUD completo de ventanillas

```text
PATCH  /api/queue/:queueId/windows/:windowId          queue:configure
DELETE /api/queue/:queueId/windows/:windowId          queue:configure
```

- **Editar** (`UpdateServiceWindowUseCase`): body `{ name?, type? }`, ambos
  opcionales — actualiza solo lo provisto. No permite tocar `isActive` (usar
  el endpoint de toggle para eso).
- **Eliminar** (`DeleteServiceWindowUseCase`): responde `409
  SERVICE_WINDOW_IN_USE` si la ventanilla tiene un turno `attending` en este
  momento. Un turno `redirected` esperando esa ventanilla **no** bloquea el
  borrado (queda con `serviceWindowId: null` por el `ON DELETE SET NULL`).
- **Toggle** (`ToggleServiceWindowUseCase`): el mismo guard `409
  SERVICE_WINDOW_IN_USE` ahora aplica al desactivar (`isActive: true →
  false`) una ventanilla ocupada. Reactivar (`false → true`) nunca se
  bloquea.

### Cobertura

- `tests/unit/queue/AttendTurnUseCase.test.ts` (secciones *ocupación de
  ventanilla* y *redirected → attending*)
- `tests/unit/queue/RedirectTurnUseCase.test.ts`
- `tests/unit/queue/UpdateServiceWindowUseCase.test.ts`
- `tests/unit/queue/DeleteServiceWindowUseCase.test.ts`
- `tests/unit/queue/ToggleServiceWindowUseCase.test.ts` (sección *ocupación*)
- `tests/unit/queue/GetQueueStatusUseCase.test.ts` (`redirectedCount`)
- `tests/unit/queue/GetQueueListUseCase.test.ts` (turnos `redirected`)
- `tests/unit/queue/GetMyTurnUseCase.test.ts` (estados `attending` y
  `redirected`, `serviceWindowId`)

## Refinamiento — Crear colas adicionales (bugfix, 2026-08-08)

Rama: `bugfix/additional-queue-creation`.

### Contexto

La grilla de planes (`PLAN_LIMITS`, Épica 2.5) promete varias `Queue` por
`Business` desde el plan Pro — pero no había ninguna forma real de crear una
segunda. `ApproveBusinessUseCase` crea automáticamente una única cola
("Caja principal") al aprobar el negocio, y `EnsureQueueCreationAllowedUseCase`
(el chequeo de límite por plan) existía desde Épica 2.5 pero nunca se
llamaba desde ningún lado — quedó documentado como "contrato diferido" hasta
ahora.

De paso se encontró y eliminó `ConfigureQueueUseCase`: un stub sin uso real
(`return {configured: true, businessId}`, no persistía nada) montado en
`POST /api/business/configure-queue`, sin tests, sin chequeo de ownership.
Se reemplazó por el contrato real de abajo.

### Contrato backend

```text
POST /api/business/:businessId/queues   queue:configure   body: { name, prefix }
GET  /api/business/:businessId/queues   queue:read
```

`POST` devuelve la `Queue` creada (`201`). `GET` devuelve el array completo
de `Queue` del negocio (antes solo se podía consultar internamente vía
`IQueueRepo.findByBusinessId`).

### Implementación backend

- `CreateQueueUseCase` (`queue/application/`) — valida ownership
  (`business.ownerUserId !== ownerUserId` → `403
  BUSINESS_OWNERSHIP_REQUIRED`, mismo patrón que
  `ConfigureBusinessServiceWindowsUseCase`), llama a
  `EnsureQueueCreationAllowedUseCase` (Épica 2.5) pasándole el conteo real
  de colas del negocio (`403 PLAN_QUEUE_LIMIT_REACHED` si excede el plan), y
  rechaza un `prefix` duplicado dentro del mismo negocio (`409
  QUEUE_PREFIX_ALREADY_IN_USE` — evita que dos colas del mismo negocio
  generen el mismo `displayNumber`, ej. dos "A-001" distintos y confusos
  para el público).
- `ListBusinessQueuesUseCase` (`queue/application/`) — mismo chequeo de
  ownership, expone `IQueueRepo.findByBusinessId`.
- Ambos importan `IBusinessRepo`/`PostgresBusinessRepo` directo desde
  `@modules/business/domain` e `infrastructure` (no vía `public-api.ts`) —
  mismo patrón ya usado por `CreateTurnUseCase` dentro de este módulo, no
  una convención nueva.

### Reglas de negocio

1. El límite de colas es por `Business`, no por `Organization` — cada
   negocio de una cuenta Premium puede tener varias colas cada uno, según
   `PLAN_LIMITS`.
2. El `prefix` se normaliza a mayúsculas y debe ser único dentro del mismo
   `Business` (no globalmente).
3. La cola automática creada al aprobar el negocio (HU-8.3) cuenta para el
   límite del plan igual que cualquier otra.

### Cobertura

- `tests/unit/queue/CreateQueueUseCase.test.ts`
- `tests/unit/queue/ListBusinessQueuesUseCase.test.ts`
- `tests/unit/organization/EnsureQueueCreationAllowedUseCase.test.ts` (ya
  existía, ahora ejercitado por un flujo real además de en aislamiento)

Validación manual: pendiente (requiere una Organization en plan Pro/Premium
con un Business aprobado, para crear una segunda cola real contra Postgres
local).

## Refinamiento — Ownership en CRUD de ventanillas (bugfix, 2026-08-10)

Rama: `bugfix/service-window-ownership-check`.

### Contexto

Al auditar sistemáticamente los gaps de `business.status` en flujos de
negocio (ver `docs/epica-2-gestion-negocios.md` para el resto del barrido),
apareció algo más grave y de otra naturaleza en el CRUD de `ServiceWindow`:
`CreateServiceWindowUseCase`, `UpdateServiceWindowUseCase`,
`ToggleServiceWindowUseCase` y `DeleteServiceWindowUseCase` no verificaban
**ownership en absoluto** — ni siquiera parcialmente. Los cuatro operaban
sobre un `queueId`/`windowId` recibido del caller sin comparar nunca contra
`business.ownerUserId`. Las rutas (`/:queueId/windows*`) solo están
protegidas por el permiso de rol genérico `queue:configure` (no por
instancia), así que cualquier `business_admin` autenticado podía mutar
ventanillas de **un negocio que no era el suyo**, con solo conocer o
adivinar el `queueId`/`windowId` ajeno.

No es el mismo tipo de gap que "negocio no aprobado sigue operando" — acá no
había ningún control de instancia, ni siquiera bloqueado por estado.

### Implementación backend

Los cuatro use cases ganaron `ownerUserId` como input obligatorio y
resuelven la cadena `window → queue (IServiceWindowRepo/IQueueRepo) →
business (IBusinessRepo, importado directo desde `@modules/business/...`,
mismo patrón ya usado por `CreateTurnUseCase`)`, comparando
`business.ownerUserId` antes de mutar — `403
BUSINESS_OWNERSHIP_REQUIRED` si no coincide. `CreateServiceWindowUseCase`
resuelve la cadena más corta (`queue → business`) porque recibe `queueId`
directo; los otros tres parten de `windowId` y resuelven `window.queueId →
queue.businessId → business`.

`QueueController` pasa `request.user?.id` como `ownerUserId` en las cuatro
rutas (`createServiceWindow`, `updateServiceWindow`, `toggleServiceWindow`,
`deleteServiceWindow`) — no hizo falta tocar las rutas, `authenticate` ya
corre antes de `authorize("queue:configure")` en todas.

### Alcance explícitamente NO cubierto en este bugfix

El mismo patrón (permiso de rol sin chequeo de instancia) existe también en
otros endpoints de `queue` de solo lectura o de operación de turnos
(`GetQueueStatusUseCase`, `GetQueueListUseCase`, `GetQueueMetricsUseCase`,
`GetTurnHistoryUseCase`, `CallNextUseCase`, `AttendTurnUseCase`,
`RedirectTurnUseCase`, `CancelTurnByEmployeeUseCase`, `CreateManualTurnUseCase`).
Se detectó al revisar esto pero se dejó fuera a propósito — es un barrido
mucho más grande (prácticamente todo el módulo `queue`) y amerita su propia
rama, no mezclarse con el fix puntual de `ServiceWindow`.

### Cobertura

- `tests/unit/queue/CreateServiceWindowUseCase.test.ts` (caso
  `BUSINESS_OWNERSHIP_REQUIRED` agregado)
- `tests/unit/queue/UpdateServiceWindowUseCase.test.ts` (ídem)
- `tests/unit/queue/ToggleServiceWindowUseCase.test.ts` (ídem)
- `tests/unit/queue/DeleteServiceWindowUseCase.test.ts` (ídem)

Validación manual: pendiente.

---

## Bugfix — límite de ventanillas por plan (2026-08-07)

Rama: `feature/service-window-plan-limit`.

### Contexto

`PLAN_LIMITS` (`src/modules/organization/domain/PlanLimits.ts`) ya limitaba
`Business` por `Organization` y `Queue` ("fila") por `Business` según el
plan de la `Subscription` — pero nada limitaba cuántas `ServiceWindow`
("ventanilla") podía tener una `Queue`. Un negocio en plan Basic (pensado
para una sola fila con atención simple) podía crear ventanillas paralelas
sin límite, lo mismo que uno en Pro o Premium — el plan no distinguía nada
en ese eje.

Además, existían **dos caminos distintos** para declarar ventanillas: el
CRUD real (`CreateServiceWindowUseCase` y compañía, ver refinamiento
arriba) y un contador legado en `Business.activeServiceWindows`
(`ConfigureBusinessServiceWindowsUseCase`, HU-2.3), que la lectura de
espera ya trata como fallback de las ventanillas reales (ver sección
*"Fix: `activeServiceWindows` usaba el contador legado del negocio"*
arriba) pero que seguía teniendo su propio tope fijo e independiente
(`MAX_ACTIVE_SERVICE_WINDOWS = 50`), sin relación con el plan. Poner el
límite solo en el CRUD real habría dejado ese segundo camino como bypass.

### Solución

`PLAN_LIMITS` gana un tercer eje, `maxServiceWindowsPerQueue`:

| Plan    | Ventanillas por fila |
| ------- | ---------------------- |
| Basic   | 1                       |
| Pro     | 3                       |
| Premium | 20                      |

Premium no usa `Infinity`: comercialmente "sin límite" es el mensaje
correcto (20 excede cualquier uso real), pero un límite realmente infinito
en el CRUD dejaría `CreateServiceWindowUseCase` sin ningún guardrail ante
un bug o un abuso que intente crear filas de `service_windows` sin freno.
20 es a la vez el tope de Premium y el sanity cap absoluto de
`ConfigureBusinessServiceWindowsUseCase` (antes `MAX_ACTIVE_SERVICE_WINDOWS
= 50`, ahora derivado de `PLAN_LIMITS.premium.maxServiceWindowsPerQueue`
para no mantener dos números arbitrarios distintos).

- `EnsureServiceWindowCreationAllowedUseCase` (nuevo, en
  `organization/application/`, mismo patrón que
  `EnsureQueueCreationAllowedUseCase`): recibe `organizationId` y la
  cantidad actual de ventanillas de la fila, y rechaza con
  `403 PLAN_SERVICE_WINDOW_LIMIT_REACHED` si ya se alcanzó el tope del
  plan. Resuelve el plan vía `ISubscriptionRepo.findByOrganizationId`,
  default `"basic"` si la Organization no tiene `Subscription` todavía.
- `CreateServiceWindowUseCase` cuenta `windowRepo.findByQueueId(queueId)`
  antes de insertar y llama a ese nuevo use case.
- `ConfigureBusinessServiceWindowsUseCase` (el contador legado) resuelve el
  mismo plan y rechaza con el mismo código si el valor pedido supera
  `maxServiceWindowsPerQueue` — ya no puede usarse para esquivar el tope
  real.

### Reglas de negocio

1. El límite es por `Queue`, no agregado a nivel `Business` — un negocio
   Pro con varias filas puede tener hasta 3 ventanillas en **cada** una,
   no 3 en total.
2. Sin `Subscription` para la `Organization`, se asume plan `basic`
   (mismo criterio que `EnsureQueueCreationAllowedUseCase`).
3. `Toggle`/`Update`/`Delete` de una ventanilla existente no re-chequean
   el límite — activar o desactivar no crea ventanillas nuevas.

### Cobertura

- `tests/unit/organization/EnsureServiceWindowCreationAllowedUseCase.test.ts`
  (nuevo)
- `tests/unit/queue/CreateServiceWindowUseCase.test.ts` (sección *límite por
  plan*)
- `tests/unit/business/ConfigureBusinessServiceWindowsUseCase.test.ts`
  (sección *límite por plan* — este archivo se eliminó en el bugfix
  siguiente, ver abajo; el gateo del contador legado quedó sin efecto
  práctico apenas después de agregarlo)

Validación manual: pendiente (requiere `Subscription` real por plan en la
base local).

---

## Bugfix — cierre del modelo de ventanillas, Fase A (2026-08-10)

Rama: `bugfix/resolve-service-window-model-gap`.

### Contexto

`docs/epica-6-panel-negocio.md` (HU-6.3) ya documentaba como *"gap real"*
la convivencia de dos modelos de ventanilla: el legado
(`Business.activeServiceWindows`, un contador manual sin identidad) y el
real (`ServiceWindow`, entidad propia por `Queue`, con CRUD y lógica de
ocupación). La lectura de espera (`GetQueueStatusUseCase`/
`GetQueueListUseCase`) ya priorizaba el modelo real y caía al legado solo
como fallback si la `Queue` no tenía ninguna `ServiceWindow` creada — pero
seguía siendo necesario: `ApproveBusinessUseCase` crea la primera `Queue`
al aprobar un negocio, pero nunca creaba ninguna `ServiceWindow` real para
ella, así que todo negocio nuevo dependía 100% del contador legado hasta
que el dueño usara el CRUD nuevo por su cuenta.

### Solución (Fase A — sin migración de schema)

1. **El modelo real pasa a ser autosuficiente.** Tanto
   `ApproveBusinessUseCase` (primera `Queue`, al aprobar) como
   `CreateQueueUseCase` (`Queue` adicionales) crean ahora, en el mismo
   flujo, una `ServiceWindow` por defecto (`"Ventanilla 1"`, tipo
   `cashier`, activa) para la `Queue` recién creada. No se llama a
   `EnsureServiceWindowCreationAllowedUseCase` para esta ventanilla
   inicial — no hace falta: es siempre la primera de la `Queue` (conteo 0)
   y todos los planes permiten al menos 1.
2. **Se elimina el camino de escritura legado.** `PUT
   /api/business/:businessId/service-windows`,
   `ConfigureBusinessServiceWindowsUseCase` y su test se borraron por
   completo — ya no hace falta, y mantenerlo solo perpetuaba la
   convivencia de los dos modelos. Ver
   `docs/epica-2-gestion-negocios.md` (HU-2.3, sección *"Superseded"*).

### Qué quedó afuera de esta pasada (Fase B, ejecutada a continuación, ver abajo)

`Business.activeServiceWindows` quedó en el schema como código inerte tras
la Fase A. La Fase B (misma rama, ver sección siguiente) lo saca por
completo.

### Reglas de negocio

1. Toda `Queue`, sin importar si nace automáticamente (aprobación) o se
   crea manualmente (`CreateQueueUseCase`), tiene garantizada al menos 1
   `ServiceWindow` real desde su creación.
2. El fallback al contador legado en la lectura de espera pasa a ser
   inalcanzable para cualquier `Queue` creada desde este bugfix en
   adelante — solo sigue siendo relevante para datos de negocios/colas
   creados antes de este cambio.

### Cobertura

- `tests/unit/business/ApproveBusinessUseCase.test.ts` (caso *creates a
  default queue with a default service window*)
- `tests/unit/queue/CreateQueueUseCase.test.ts` (caso *creates an
  additional queue for the business, with a default service window*)

Validación manual: pendiente.

---

## Bugfix — cierre del modelo de ventanillas, Fase B (2026-08-10)

Misma rama que la Fase A: `bugfix/resolve-service-window-model-gap`.
Migración `20260810010000_drop_business_active_service_windows`.

### Alcance

Con la Fase A garantizando que toda `Queue` nace con al menos 1
`ServiceWindow` real, `Business.activeServiceWindows` pasó a ser código
inerte (nunca más editable desde que se sacó el endpoint legado). La Fase B
lo elimina por completo: campo de dominio, columna de base, y los 13
archivos que todavía lo leían o le asignaban un default.

```sql
ALTER TABLE "businesses" DROP COLUMN "activeServiceWindows";
```

Sin backfill: sin datos de producción (pre-lanzamiento), no había nada que
migrar.

### La pregunta de diseño que apareció: ¿de qué `Queue` sale el número?

`activeServiceWindows` era un solo entero **a nivel `Business`**, pero el
modelo real es **por `Queue`** — y un negocio Pro/Premium puede tener
varias. Dos casos que antes leían el contador legado directo del `Business`
(`ListMyBusinessesUseCase`, `ResolveBusinessQrCodeUseCase`) no tenían
ninguna `Queue` resuelta en absoluto. Se decidió reusar el mismo criterio
que ya usa `ListMyBusinessesUseCase` para `activeQueueId`
(`queueRepo.findActiveByBusinessId`): el número de ventanillas activas a
nivel negocio es el conteo real de la `Queue` activa/principal, no una suma
de todas las colas.

### Cambios por archivo

- **`Business.ts`** (domain) / **`PostgresBusinessRepo.ts`**: se saca el
  campo por completo (tipo, `select`/mapeo, `save`).
- **`RegisterBusinessUseCase`, `RegisterBusinessAccountUseCase`,
  `RegisterBusinessWithGoogleUseCase`**: ya no asignan
  `activeServiceWindows: 1` al crear el `Business`.
- **`GetQueueStatusUseCase`, `GetQueueListUseCase`**: ya operan dentro de
  una `Queue` puntual — se simplifica a usar directo el conteo de
  `ServiceWindow` activas, sin el `? :` de fallback.
  `GetQueueListUseCase` pierde la dependencia de `IBusinessRepo` por
  completo (solo la usaba para el fallback).
- **`GetMyTurnUseCase`**: leía el contador legado directo
  (`business?.activeServiceWindows ?? 1`), sin mirar ninguna `ServiceWindow`
  real. Gana `IServiceWindowRepo`, pierde `IBusinessRepo` (no lo usaba para
  nada más).
- **`ListMyBusinessesUseCase`**: ya resolvía `activeQueueId` vía
  `queueRepo.findActiveByBusinessId` — se reusa esa resolución para contar
  las `ServiceWindow` activas de esa misma `Queue`.
- **`ResolveBusinessQrCodeUseCase`** (resolver público del QR): no tenía
  ninguna noción de `Queue`. Gana `IQueueRepo` + `IServiceWindowRepo`
  nuevos, resuelve la `Queue` activa del negocio antes de responder.
- **`BusinessAvailabilityService`**: sin ningún caller real hoy (queda para
  cuando se conecte una épica de descubrimiento público, E4/E7). Se adaptó
  igual — `activeServiceWindowCount` pasa a ser un parámetro explícito del
  input en vez de leerse de `business.activeServiceWindows`.

### Reglas de negocio

1. El "número de ventanillas activas" a nivel negocio (sin especificar
   `Queue`) siempre se resuelve contra la `Queue` activa/principal — igual
   criterio que `activeQueueId`. Un negocio sin `Queue` activa devuelve `0`.
2. El contrato de las respuestas HTTP no cambió — `activeServiceWindows`
   sigue siendo un `number` en los mismos endpoints (`GET /api/business/me`,
   resolución de QR, `GET /api/queue/:queueId/status`, etc.), solo cambió
   de dónde sale el valor.

### Cobertura

- `tests/unit/business/BusinessAvailabilityService.test.ts` (nueva firma)
- `tests/unit/queue/GetMyTurnUseCase.test.ts`,
  `GetQueueListUseCase.test.ts`, `GetQueueStatusUseCase.test.ts`
  (ventanillas reales, sin fallback)
- `tests/unit/business/ListMyBusinessesUseCase.test.ts`,
  `ResolveBusinessQrCodeUseCase.test.ts` (resolución vía Queue activa)

Validación manual: pendiente.
