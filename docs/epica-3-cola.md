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

- `items` está ordenado por prioridad (arrived primero) y por `queueJoinedAt`
  para desempate (FIFO) — ver refinamiento *queueJoinedAt, separado de
  createdAt* más abajo; para todo turno salvo una reserva telefónica con
  `etaMinutes`, `queueJoinedAt === createdAt`.
- `waitingMinutes`: minutos enteros desde `queueJoinedAt` hasta ahora. Puede
  ser **negativo** para una reserva telefónica que todavía no llegó a su ETA
  (significa "llega en X minutos", no "espera hace X minutos").
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

## Refinamiento — activar/desactivar una cola existente (bugfix, 2026-08-20)

Rama: `bugfix/queue-activation-toggle`. Reportado desde el frontend
(`espera-front`, al revisar un bug de alineación en `QueuesControl.jsx`):
se puede listar y crear colas, pero no gestionarlas después — ni panel ni
API tenían forma de tocar `isActive` una vez creada la cola, a diferencia
de `ServiceWindow`, que ya tiene CRUD completo (crear, activar/desactivar,
editar, borrar).

### Contrato backend

```text
PATCH /api/business/:businessId/queues/:queueId/toggle   queue:configure
```

Devuelve la `Queue` actualizada (`200`), mismo patrón que
`PATCH /:queueId/windows/:windowId/toggle` de ventanillas.

### Implementación backend

- `ToggleQueueUseCase` (`queue/application/`) — valida ownership (mismo
  patrón que `CreateQueueUseCase`/`ToggleServiceWindowUseCase`), invierte
  `isActive`.
- A diferencia de `ToggleServiceWindowUseCase`, **no hay chequeo de
  ocupación**: `isActive` en `Queue` solo bloquea la creación de turnos
  nuevos (`CreateTurnUseCase`) — no interrumpe a nadie ya esperando/siendo
  atendido, así que desactivar una cola en cualquier momento es seguro para
  quien ya está en la fila.
- Sí hay una regla nueva: **no se puede desactivar la única cola activa de
  un negocio** (`409 QUEUE_LAST_ACTIVE`). Motivo:
  `IQueueRepo.findActiveByBusinessId` resuelve "la" cola que opera todo
  punto de entrada en vivo (panel, QR, web, manual) tomando la más antigua
  con `isActive: true` — si un negocio se queda sin ninguna cola activa,
  todos esos puntos de entrada se rompen en silencio, sin ningún error
  visible para el dueño. Con plan basic (el único vendido hasta ahora, una
  sola cola por negocio) este es exactamente el caso que el botón nuevo en
  el panel podría disparar por accidente.

### Pregunta abierta, no resuelta en este bugfix

`findActiveByBusinessId` elige la cola activa **más antigua** cuando hay
más de una — no hay forma de elegir cuál opera, ni de operar una cola que
no sea "la activa" desde ningún lado del panel. Con el toggle nuevo, un
negocio con 2 colas activas *puede* efectivamente "cambiar" cuál se opera
desactivando la que no quiere usar — pero es un efecto lateral del toggle,
no un flujo pensado. Qué significa operar más de una cola en el panel
(¿pestañas para elegir cola en "Cola"? ¿ventanillas atadas a una cola
específica?) queda sin decidir — no bloquea a nadie hoy porque plan basic
(lo único vendido) nunca tiene más de una cola.

### Cobertura

- `tests/unit/queue/ToggleQueueUseCase.test.ts`

595 tests en verde (suite completa).

Validación manual: pendiente.

## Refinamiento — fairness del no_show cuando la ventanilla nunca estuvo libre (2026-08-20)

Misma rama. Pregunta del usuario al revisar el caso "alguien está siendo
atendido y se llama a otro": *¿debería primero terminar de atender antes de
poder llamar al siguiente?* Análisis: no — `called` y `attending` son
estados separados justamente para permitir ese solape (el "aviso, andá
saliendo de tu casa" que es la razón de ser del producto), y ya existe el
chequeo de ocupación de ventanilla que evita que dos turnos terminen
`attending` en el mismo lugar. Pero de ahí surgió un hueco real y más
general en `CallNextUseCase`: **marca `no_show` al turno `called` vigente
por el solo hecho de tocar "Siguiente" de nuevo, sin verificar si esa
persona alguna vez tuvo una ventanilla libre para ser atendida.**

Escenario concreto: cola con una sola ventanilla. A está `attending`. Se
llama a B (queda `called`, sin ventanilla libre — A la sigue ocupando). Si
se toca "Siguiente" otra vez antes de que A termine, B pasaba a `no_show`
— aunque nunca tuvo dónde ir. El hueco no es sobre el primer llamado (ese
es intencional y se mantiene sin cambios), es sobre **superar** a alguien
que sigue `called` sin haber tenido nunca una ventanilla disponible.

### Fix

Antes de marcar `no_show` al turno `called` vigente, `CallNextUseCase`
ahora chequea si la cola tiene ventanillas activas y, si las tiene, si
alguna está libre (sin ningún turno `attending`/`redirected` ocupándola)
en este momento:

- Si hay una ventanilla libre → el turno `called` sí tuvo su chance y no se
  presentó, se marca `no_show` como antes.
- Si ninguna está libre → **se rechaza la acción completa** (`409
  QUEUE_NO_WINDOW_AVAILABLE`), no solo se salta el no-show. No tiene
  sentido llamar a un tercero cuando el segundo ni siquiera tuvo dónde ir
  todavía.
- Si la cola no tiene ventanillas activas configuradas (mostrador único,
  igual que en los refinamientos anteriores) → se mantiene el
  comportamiento anterior sin cambios, el concepto de "ventanilla libre" no
  aplica ahí.

`CallNextUseCase` gana una dependencia de `IServiceWindowRepo` (mismo
patrón que `AttendTurnUseCase`).

### Cobertura

- `tests/unit/queue/CallNextUseCase.test.ts` (bloque *fairness del no_show
  (ventanilla nunca libre)* — 4 casos: primer llamado con ventanilla
  ocupada sigue funcionando, se rechaza superar a alguien sin ventanilla
  libre, se marca no_show cuando sí hubo ventanilla libre, ventanillas
  inactivas se ignoran)

599 tests en verde (suite completa).

Validación manual: pendiente.

**Superado por el refinamiento siguiente** ("no_show como acción
explícita", 2026-08-20): el dueño del negocio prefirió que el no-show sea
una decisión manual del empleado, no un efecto automático de "Siguiente".
El chequeo de `QUEUE_NO_WINDOW_AVAILABLE` descripto acá ya no vive en
`CallNextUseCase` — `CallNextUseCase` ahora bloquea directo con
`TURN_STILL_CALLED` en cuanto hay un turno `called` sin resolver, sin
llegar a evaluar ventanillas. La pregunta de fairness (¿tuvo ventanilla
libre alguna vez?) queda documentada ahí, con la decisión de no
trasladarla al nuevo endpoint manual.

## Refinamiento — no_show como acción explícita, no efecto secundario (2026-08-20)

Rama: `bugfix/no-show-accion-explicita`. Reportado desde el frontend, con
la frase textual del dueño: *"marcar ausente para que no aparezca en la
trazabilidad como 'sin ventanilla'"*. El estado `no_show` (agregado en
`500e91a`) resolvía la trazabilidad — un turno llamado que nunca se
atendió ya no queda mal etiquetado como `completed` — pero lo marcaba
**automáticamente e implícitamente**: si `CallNextUseCase` encontraba un
turno todavía `called`, lo pisaba a `no_show` en el mismo paso, sin que el
empleado hubiera confirmado nada. Eso incluía el fix de fairness recién
descripto (`397c90f`) — el número quedaba correcto, pero la *intención*
detrás de la marca no estaba clara: pudo haber sido un no-show real, o
simplemente el empleado avanzando la cola por cualquier otro motivo.

### Contrato backend

```text
POST /api/queue/:queueId/turns/:turnId/no-show   turn:mark_no_show
```

Solo válido si el turno está en `called` (`409 TURN_NOT_CALLED` en
cualquier otro estado, mismo patrón que `AttendTurnUseCase`). Devuelve
`{ turnId, status: "no_show", noShowAt }` (`200`).

### Implementación backend

- `MarkTurnNoShowUseCase` (`queue/application/`) — nuevo caso de uso,
  literalmente la misma lógica que antes vivía agachada dentro de
  `CallNextUseCase` (`status: "no_show"`, `noShowAt: now()`), ahora como
  acción propia.
- **Sin chequeo de fairness/disponibilidad de ventanilla, a propósito**: ese
  chequeo existe para evitar que el *sistema* castigue a alguien por un
  disparador mecánico ciego. Una vez que es el empleado quien decide
  explícitamente "esta persona no está", tiene mejor información que la
  heurística — exigirle esa validación sería fricción contra una decisión
  humana deliberada. Quedó marcado como criterio a decidir en el pedido
  original; esta es la resolución.
- `CallNextUseCase` deja de auto-resolver: si `findCalledTurnByQueue`
  encuentra un turno `called`, rechaza toda la acción con `409
  TURN_STILL_CALLED` ("Resolvé el turno llamado antes de pedir el
  siguiente — atendelo o marcalo ausente"), sin tocar nada. Pierde su
  dependencia de `IServiceWindowRepo` (ya no la necesita — ver nota arriba).
- Nuevo permiso `turn:mark_no_show`, otorgado a `employee` y
  `business_admin` (mismos roles que `turn:attend`).

### Reglas de negocio

1. Un turno `called` es un estado que ahora **bloquea** el avance de la
   cola hasta resolverse — vía `AttendTurnUseCase` (called → attending) o
   `MarkTurnNoShowUseCase` (called → no_show). Ya no hay tercera vía
   implícita.
2. El resto de la lógica de `no_show` (métricas `noShowCount`/
   `noShowRate`, historial, el fix de `GetGuestTurnStatusUseCase`) no
   cambia — esto solo mueve *cómo* se dispara la transición.

### Cobertura

- `tests/unit/queue/MarkTurnNoShowUseCase.test.ts` (nuevo)
- `tests/unit/queue/CallNextUseCase.test.ts` (bloque *resolver el turno
  llamado antes de avanzar* — reemplaza el bloque de fairness anterior)

608 tests en verde (suite completa).

Validación manual: pendiente.

## Refinamiento — visibilidad de todas las colas de un negocio (2026-08-20)

Rama: `feature/operar-multiples-colas`. Punto de partida: un negocio en
plan Pro/Premium puede tener varias `Queue` (ver *"Crear colas
adicionales"*, arriba), pero el panel solo operaba **una** — la que
`findActiveByBusinessId` resuelve (la más antigua con `isActive: true`).
Antes de asumir que hacía falta rediseñar el modelo o el panel en vivo, se
revisaron todos los casos de uso operativos de `queue` (`CallNextUseCase`,
`AttendTurnUseCase`, `CreateManualTurnUseCase`, `GetQueueStatusUseCase`,
`GetQueueListUseCase`, `ToggleQueueUseCase`, etc.): **todos ya reciben
`queueId` explícito**, ninguno depende de "la cola activa" resuelta
automáticamente. El backend ya podía operar cualquier cola del negocio,
una por una — lo único que colapsaba todo a una sola era
`ListMyBusinessesUseCase`, el endpoint que arma el listado "mis negocios"
del dashboard, que solo exponía `activeQueueId: string | null`.

### Fix

`ListMyBusinessesUseCase` gana un campo `queues` por negocio — el array
completo (`id`, `name`, `prefix`, `isActive`, `activeServiceWindows` por
cola), no solo la resuelta como activa. `activeQueueId` y
`activeServiceWindows` a nivel negocio **no cambian de significado** —
siguen siendo exactamente el mismo cálculo de antes (la cola más antigua
activa, y sus ventanillas), preservados para no romper a quien ya los
consume. `queues` es puramente aditivo.

De paso quedó documentado un detalle menor: `activeServiceWindows` a nivel
negocio representa las ventanillas de esa única cola resuelta, no el total
del negocio — un negocio con 3 colas activas seguiría mostrando solo las
ventanillas de la más antigua ahí. No se tocó (cambiar su significado
rompería lo que ya lo consume); el array `queues` ya trae el desglose real
por cola para quien lo necesite.

### Alcance — qué queda para el frontend, no incluido acá

Con `queues` disponible, el panel puede armar un selector de cola (pestañas,
dropdown, lo que se decida) y pasar el `queueId` elegido a cada llamada en
vez de asumir `activeQueueId` — el backend ya lo soporta. Cómo se ve eso en
`BusinessQueuePage`/`QueuesControl.jsx`, y si la operación es "una cola a la
vez" o varias en simultáneo con ventanillas por cola, queda del lado
frontend/producto — no requiere más cambios de este lado salvo que surja un
caso concreto no cubierto.

### Cobertura

- `tests/unit/business/ListMyBusinessesUseCase.test.ts` (3 casos nuevos:
  expone todas las colas, `activeServiceWindows` por cola dentro de
  `queues`, array vacío sin colas)

611 tests en verde (suite completa).

Validación manual: pendiente.

## Refinamiento — Reformulación del pitch de planes (2026-08-20)

Rama: `bugfix/restructurar-limites-planes`. Surgió probando el escenario
"una cola para Atención, otra para Caja" (el pitch de multi-cola en
Premium) con la pregunta del dueño: *"¿para qué querría otra cola si con
una puedo gestionar todas las ventanillas? Ya no tendría sentido pagar un
plan premium."* Tenía razón — análisis completo abajo.

### El problema

`ServiceWindow` ya resuelve "distintos tipos de atención" adentro de una
sola cola — cada ventanilla tiene `type` (cashier, customer_service,
information, admin, technical), y con Pro ya había hasta 3 ventanillas
activas corriendo en paralelo en una misma cola. Eso cubre el caso real de
uso objetivo (peluquería/estética con varios peluqueros — ver
`project_sales_positioning` en la memoria del proyecto): una sola fila de
espera, varios empleados atendiendo en simultáneo.

Lo único que una segunda `Queue` agrega de verdad — numeración propia,
contador de "gente esperando" propio, tiempo estimado propio — **solo
importa si el cliente puede elegir a cuál entrar**. Y no puede:
`CreateGuestTurnUseCase` y el QR resuelven siempre
`findActiveByBusinessId`, la única cola "activa" del negocio. La segunda
cola de un plan Pro/Premium solo la usa un empleado cargando turnos a mano
(`CreateManualTurnUseCase`, que sí recibe `queueId` explícito) — el
cliente final nunca la ve ni la elige.

Conclusión: multi-cola-por-negocio, tal como está hoy, es una herramienta
interna del empleado, no algo que el cliente experimente o pida — vender
eso como el diferencial de un plan superior es prometer algo que no se
sostiene ante la primera pregunta de un cliente real. Es el mismo patrón
de deuda que esta rama viene cerrando toda la sesión (funcionalidad que
"existe" en el modelo pero no entrega de punta a punta), aplicado esta vez
a la capa de venta en vez de a un bug de código.

### Decisión: reformular qué vende cada plan, no repararlo con código nuevo

Dos pilares reales, verificables, que ya funcionan de punta a punta hoy:

1. **Techo de ventanillas por cola** — Basic 1, Pro 10, Premium 20. Es un
   límite operativo tangible: un local con más puestos de atención
   simultáneos que su plan permite lo choca en la práctica al intentar
   crear la ventanilla de más (`EnsureServiceWindowCreationAllowedUseCase`).
2. **Multi-sucursal** — Premium permite hasta 3 negocios bajo la misma
   cuenta. Es, además, la única forma de tener más de un `Business` con una
   sola cuenta: `Organization` es 1:1 con su dueño, así que Basic/Pro
   (`maxBusinesses: 1`) no tienen ningún atajo — no es una comodidad, es la
   única puerta de entrada a operar más de un local con una sola identidad.

`maxQueuesPerBusiness` pasa a **1 en los tres planes** — no es que la
funcionalidad de multi-cola se rompa o se retire: `CreateQueueUseCase`,
`ToggleQueueUseCase` y todo el mecanismo quedan intactos en el código,
simplemente no hay ningún plan que hoy permita usarlos para una segunda
cola. Subirlo de nuevo por plan es un cambio de una constante, el día que
exista ruteo de cliente hacia una cola específica (ver "Caminos futuros"
abajo).

`maxBusinesses` de Premium pasa de `Infinity` a **3** — la única señal de
mercado real hasta ahora es un prospecto con 2 sucursales; prometer
ilimitado sin haber probado el producto a esa escala es el mismo
sobre-prometer que el punto anterior. **Nota**: no existe hoy ningún
mecanismo de override por organización — si una cuenta real necesita más
de 3, la única forma de dárselo hoy es subir esta constante para *todos*
los Premium, no solo para esa cuenta. Queda anotado como pregunta abierta,
no resuelta acá.

### Caminos futuros considerados, no implementados

- **Opción A — routear cliente a una cola específica**: QR por cola, o un
  paso "¿qué necesitás?" antes de sacar turno en la web ligera. Recién ahí
  una segunda cola le da al cliente algo que las ventanillas tipadas no
  dan (saber cuánto espera su línea específica). Costo: agrega fricción al
  flujo de entrada ("un tap y listo"), que es hoy un diferencial del
  producto.
- **Opción C — estimar espera por `ServiceWindow.type` dentro de una sola
  cola**, en vez de por `Queue`. Da el mismo valor sin tocar el flujo de
  entrada del cliente — reutiliza `QueueWaitEstimateService`, solo cambia
  el agrupamiento del cálculo. Más barata y menos riesgosa que la Opción A
  para el mismo objetivo; preferible si en algún momento hay señal real de
  que esto importa.
- **Patrón "banco"** (varias colas por trámite — Caja/Atención/Informes,
  cada una con su propia numeración y sus propias ventanillas) — el
  modelo `Queue > ServiceWindow` ya lo soporta sin cambios de arquitectura
  (`Queue.prefix` existe justamente para eso). Evaluado y descartado como
  dirección *actual*: implica que el cliente declare intención antes de
  sacar número (la Opción A, pero obligatoria, no opcional), reabre el
  terreno de HU-4.4 (dispensador físico, diferido a propósito), y apunta a
  un rubro (trámites/salud) con exigencias de trazabilidad/SLA que no son
  las del foco actual (peluquerías/estéticas). Sin señal de mercado
  empujándolo. El modelo queda disponible para cuando ese segmento
  aparezca — no hace falta decidir la arquitectura ahora.
- **Segundo pilar de Premium ligado a la app móvil**: la gestión
  unificada multi-sucursal (un login, una factura, switch entre locales)
  ya es valor real hoy, sin depender de la app — no es "3 cuentas Pro con
  mejor login", es la única forma de operar más de un negocio con una
  cuenta. Lo que sí depende de la app es la visibilidad *cruzada* para el
  cliente final (comparar tiempos de espera entre sucursales de una
  cadena) — eso es un salto de valor futuro sobre Premium, no una
  condición para que el actual tenga sentido.

### Reglas de negocio

1. Ningún plan permite crear una segunda `Queue` por negocio hoy —
   `PLAN_QUEUE_LIMIT_REACHED` aplica a Basic, Pro y Premium por igual.
2. El techo de ventanillas por cola es el eje real de diferenciación
   dentro de un mismo negocio: 1 → 10 → 20.
3. El techo de negocios por cuenta (`maxBusinesses`) solo aplica a
   Premium — Basic y Pro topean en 1 por el diseño de `Organization`
   (1:1 con el dueño), no por una regla de plan independiente.

### Cobertura

- `tests/unit/organization/EnsureQueueCreationAllowedUseCase.test.ts`
  (caso *rejects a second queue under PRO and PREMIUM plans too*,
  reemplaza el caso que afirmaba lo contrario)
- `tests/unit/organization/EnsureServiceWindowCreationAllowedUseCase.test.ts`
  (números actualizados a 10/20)
- `tests/unit/organization/EnsureBusinessCreationAllowedUseCase.test.ts`
  (caso nuevo: rechaza el 4to negocio en Premium)
- `tests/unit/queue/CreateQueueUseCase.test.ts` / `CreateServiceWindowUseCase.test.ts`
  (casos ajustados a los nuevos números; el test de colisión de prefix
  aísla el chequeo de plan con un stub, porque con el límite en 1 ya no es
  alcanzable a través del flujo normal — queda documentado en el propio
  test por qué)

613 tests en verde (suite completa).

Validación manual: pendiente.

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

---

## Refinamiento — `queueJoinedAt`, separado de `createdAt` (2026-08-18)

Rama: `feature/hu-4.5-turno-reservado-por-telefono`. Migración
`20260818010000_add_queue_joined_at`. Motivado por HU-4.5 (ver
`docs/epica-4-canales-entrada.md`), pero el cambio toca el núcleo del
ordenamiento de cola de Épica 3, no solo ese canal puntual.

### El problema

Todo el ordenamiento de la cola (`findNextWaitingTurn`, `countWaitingAhead`,
`findActiveByQueue`) usaba `Turn.createdAt` como criterio FIFO dentro de
cada nivel de prioridad — razonable mientras `createdAt` siempre coincidía
con "el momento en que la persona efectivamente se sumó a la cola". Eso
dejó de ser cierto con HU-4.5: una reserva telefónica puede tomarse horas
antes de que la persona vaya a estar físicamente ahí. Usar `createdAt` para
ordenarla le daba una posición injustamente temprana frente a cualquiera
que se registrara en vivo en el medio — le "robaba" el lugar a gente que
iba a llegar antes en la realidad.

### La solución

`Turn` gana `queueJoinedAt: Date` — desde cuándo el turno cuenta para
posición/estimado, distinto de `createdAt` (que sigue siendo un timestamp
de auditoría puro, "cuándo se registró este turno"). Para todo turno
existente (app, QR, web, manual walk-in) `queueJoinedAt === createdAt`, sin
cambio de comportamiento. Solo diverge para una reserva telefónica con
`etaMinutes` declarado: `queueJoinedAt = createdAt + etaMinutes`.

Todo el ordenamiento que antes usaba `createdAt` pasa a usar
`queueJoinedAt`, con `number` (el ticket secuencial) como desempate cuando
dos turnos tienen el mismo `queueJoinedAt` exacto (frecuente cuando no se
declara demora — varios turnos pueden compartir el instante de registro):

- `findNextWaitingTurn` (a quién le toca al llamar "Siguiente").
- `countWaitingAhead` (posición de un turno específico, usado por
  `GetMyTurnUseCase`/`GetGuestTurnStatusUseCase` vía `resolveTurnWaitStatus`)
  — su firma cambió de `(queueId, turnNumber, priority)` a
  `(queueId, queueJoinedAt, turnNumber, priority)`.
- `findActiveByQueue` (listado en vivo del panel, `GetQueueListUseCase`).

`GetQueueListUseCase.waitingMinutes` también pasa a calcularse contra
`queueJoinedAt` en vez de `createdAt` — para una reserva telefónica que
todavía no llegó a su ETA, da **negativo** a propósito (significa "llega en
X minutos", no "espera hace X minutos"); el panel debe interpretarlo así,
no clampearlo a 0.

### Por qué no alcanzaba con corregir solo `priority`

Se había corregido primero que una reserva telefónica reciba
`priority: "registered"` en vez de `"physical"` (no salta delante de gente
presente o en camino). Eso resuelve el salto *entre* niveles de prioridad,
pero no el orden *dentro* del nivel `"registered"` — ahí seguía mandando
`createdAt`, y una reserva tomada temprano seguía ganándole a un registro
en vivo posterior. `queueJoinedAt` es lo que cierra ese segundo hueco.

### Alternativa descartada: confirmación en dos pasos

Se evaluó un modelo de "reserva" separado de "cola" — el turno telefónico
entra en un estado inerte y solo empieza a contar cuando el empleado
confirma después que la persona está en camino (mismo mecanismo que ya usa
la app para `confirm-transit`). Se descartó: exige una segunda acción del
empleado en un momento distinto de la llamada original, fricción operativa
real para el objetivo de "una sola llamada, listo". `etaMinutes` resuelve
el mismo problema en un solo paso, en el momento de la llamada.

### Cobertura

- `tests/unit/queue/CreateManualTurnUseCase.test.ts` (sección *etaMinutes y
  queueJoinedAt (fairness)*)
- `tests/unit/queue/GetQueueListUseCase.test.ts` (caso *no le gana la
  posición a alguien que se registra en vivo en el medio*)
- Resto de la suite de `queue` (`GetMyTurnUseCase`, `GetQueueStatusUseCase`,
  `CreateTurnUseCase`, etc.) sigue en verde sin cambios de comportamiento
  para turnos sin `etaMinutes` — `queueJoinedAt` colapsa a `createdAt` en
  todos esos casos.

Validación manual: pendiente.

## Bugfix — restricciones de cola y planes (2026-08-20)

Rama: `bugfix/restricciones-cola-y-planes`. Tras cerrar HU-4.5, auditoría
dirigida a la misma familia de bug que motivó `queueJoinedAt`: una
validación/filtro que debería aplicarse condicionalmente (según
configuración del negocio o estado temporal de un turno) pero se omitía,
dejando pasar un caso no contemplado por el diseño original. Se encontraron
y corrigieron 6 casos, más los 2 ya conocidos de HU-4.5.

### 1. Reserva telefónica llamada antes de su ETA si la cola queda vacía

`findNextWaitingTurn` traía cualquier turno `WAITING` sin filtrar si
`queueJoinedAt` ya pasó o sigue en el futuro. Si la única persona en la cola
era una reserva con ETA en 2 horas, "Siguiente" la llamaba igual —
contradice el propósito de `queueJoinedAt`, que evita que la reserva le gane
la posición a otros pero no evitaba que la *llamaran* antes de tiempo.

Fix: `findNextWaitingTurn` ahora filtra `queueJoinedAt <= now`.
`CallNextUseCase` distingue dos casos cuando no hay nada listo: si existe una
reserva pendiente (`ITurnRepo.hasPendingReservation`), tira `409
QUEUE_NO_TURN_READY` en vez de `QUEUE_EMPTY` — evita que el empleado
interprete "cola vacía" cuando en realidad hay una reserva en camino.

### 2. `waitingCount` inflado por reservas no vigentes

`GetQueueStatusUseCase.waitingCount` (y por lo tanto
`estimatedTotalWaitMinutes`, visible al público) contaba cualquier turno
`WAITING`, incluida una reserva telefónica cuyo `queueJoinedAt` sigue en el
futuro. Fix: se excluyen del conteo (`t.queueJoinedAt <= now`).

### 3. Ventanilla opcional permite doble ocupación

`AttendTurnUseCase` dejaba `serviceWindowId` opcional en todo el ciclo
`called → attending → completed`; si nunca se manda, el chequeo de
ocupación (`findAttendingByServiceWindow`) se salta completo — dos turnos
podían terminar `attending` a la vez sin que el sistema lo detecte.

Fix: si la cola tiene al menos una ventanilla activa configurada, `attend`
exige `serviceWindowId` (`400 SERVICE_WINDOW_REQUIRED`). Si la cola no tiene
ninguna (mostrador único), sigue sin exigirlo — comportamiento sin cambios.

### 4. Ocupación de ventanilla no detectaba turnos "redirected"

`findAttendingByServiceWindow` solo miraba `status: "ATTENDING"`, no
`"REDIRECTED"`. Un turno redirigido a una ventanilla (`RedirectTurnUseCase`)
ya la reclama antes de que el empleado toque "atender" — pero
`DeleteServiceWindowUseCase`/`ToggleServiceWindowUseCase` no lo veían, y se
podía borrar/desactivar una ventanilla con un turno redirigido pendiente,
dejándolo huérfano.

Fix: la query ahora incluye ambos estados (`ATTENDING`, `REDIRECTED`) — un
único punto de verdad reusado por `AttendTurnUseCase`, `DeleteServiceWindowUseCase`
y `ToggleServiceWindowUseCase`.

### 5. Creación de turnos ignoraba el horario configurado del negocio

`BusinessAvailabilityService.isAvailableNow()` existía (evalúa
`weeklyHours`/`nonWorkingDays`) pero ningún caso de uso de creación de turno
lo invocaba — solo se chequeaba `operationalStatus` (que el dueño tiene que
setear a mano). Un cliente podía sacar turno un domingo cerrado o feriado
declarado, y ese turno viejo quedaba `WAITING` con `queueJoinedAt` más
antiguo que gente que llega cuando el negocio reabre.

Fix: se agregó `BusinessAvailabilityService.isWithinOperatingHours()` — una
versión acotada de `isAvailableNow` que evalúa solo horario/feriados, sin los
gates de `listingStatus`/cantidad de ventanillas (esos son criterios de
*descubrimiento público*, no de "puede operar ahora"; mezclarlos habría
bloqueado negocios que legítimamente no configuraron ventanillas, ver bug
#3). Un negocio que nunca configuró horario (la mayoría hoy) se trata como
siempre abierto — bloquear por default habría tumbado la creación de turnos
para toda la base actual. Conectado en `CreateTurnUseCase` (cubre
app/QR/web/guest, ya que `CreateGuestTurnUseCase` delega en él) con `409
BUSINESS_OUTSIDE_OPERATING_HOURS`. **No** se conectó en
`CreateManualTurnUseCase`: ese flujo lo ejecuta un empleado presente en el
momento (walk-in o llamada atendida), que puede legítimamente seguir
operando fuera del horario declarado.

### 6. Fuga en el control de plan/suscripción

`EnsureQueueCreationAllowedUseCase` y `EnsureServiceWindowCreationAllowedUseCase`
solo comparaban contra el límite numérico del plan, sin chequear el
`status` de la `Subscription` — a diferencia de `EnsureBusinessCreationAllowedUseCase`,
que sí bloquea `cancelled`/`expired` vía `ResolveEffectiveSubscriptionStatusUseCase`.
Una organización con suscripción vencida no podía crear un `Business` nuevo,
pero sí podía seguir creando colas y ventanillas nuevas en los negocios que
ya tenía aprobados. Fix: mismo chequeo (`403 SUBSCRIPTION_INACTIVE`) en los
tres. Ver `docs/epica-2-5-cuentas-organizaciones.md`.

### 7. Carrera entre dos "attend" concurrentes a la misma ventanilla

El chequeo de ocupación agregado en el punto 3/4 es *check-then-act*:
`findAttendingByServiceWindow` lee, y recién después `save` escribe — sin
transacción ni lock entre medio. Dos requests casi simultáneos (doble click,
dos pestañas, lag de red) pueden leer los dos "libre" antes de que
cualquiera escriba, y terminar los dos `attending` en la misma ventanilla —
exactamente lo que el chequeo existe para evitar. Confirmado que no había
ninguna restricción a nivel de base de datos que lo impidiera: solo índices
normales sobre `Turn`, ningún `@@unique`.

Fix: migración `20260820000000_unique_active_turn_per_service_window` —
índice único parcial en Postgres,
`CREATE UNIQUE INDEX ... ON "turns" ("serviceWindowId") WHERE "status" IN ('ATTENDING', 'REDIRECTED')`.
No representable en `schema.prisma` (la DSL de Prisma no soporta `WHERE` en
índices), documentado con un comentario junto al modelo `Turn`. El chequeo
en memoria queda como camino rápido para el caso común (error más claro,
sin ida y vuelta a la DB); `AttendTurnUseCase` ahora además atrapa la
violación de unicidad (`Prisma.PrismaClientKnownRequestError`, código
`P2002`) en el `save` y la traduce al mismo `409 SERVICE_WINDOW_OCCUPIED` —
red de seguridad real para cuando la carrera sí ocurre.

### Cobertura

- `tests/unit/queue/CallNextUseCase.test.ts` (bloque *reserva telefónica que
  todavía no llegó a su ETA*)
- `tests/unit/queue/GetQueueStatusUseCase.test.ts` (caso *no cuenta una
  reserva telefónica cuyo ETA no llegó*)
- `tests/unit/queue/AttendTurnUseCase.test.ts` (bloque *ventanilla
  obligatoria* + caso *redirected* en *ocupación de ventanilla* + bloque
  *carrera entre dos attend concurrentes*)
- `tests/unit/queue/DeleteServiceWindowUseCase.test.ts` /
  `ToggleServiceWindowUseCase.test.ts` (caso *redirected* actualizado —
  antes afirmaba el comportamiento con bug)
- `tests/unit/queue/CreateTurnUseCase.test.ts` (bloque *horario del
  negocio*)
- `tests/unit/business/BusinessAvailabilityService.test.ts` (bloque
  `isWithinOperatingHours`)
- `tests/unit/organization/EnsureQueueCreationAllowedUseCase.test.ts` /
  `EnsureServiceWindowCreationAllowedUseCase.test.ts` (bloque *estado de la
  subscription*)

580 tests en verde (suite completa). El punto 7 (P2002 → 409) se prueba
simulando el error en el fake del repo — el índice único en sí solo se
ejerce contra Postgres real (migración aplicada y verificada localmente,
sin test de integración automatizado todavía).

Validación manual: pendiente.

## Bugfix — estado `no_show`, trazabilidad de turnos salteados (2026-08-20)

Misma rama (`bugfix/restricciones-cola-y-planes`). Pregunta del usuario:
*"cuando alguien sacó turno, fue llamado y no está porque llamamos al
siguiente — cómo se saltea ese turno, no pasa por ventanilla, queda un
vacío"*. Confirmado: no era un vacío de percepción, era un hueco real en el
modelo de dominio.

### El problema

`CallNextUseCase` forzaba el turno `"called"` vigente directamente a
`"completed"` al llamar al siguiente:

```ts
if (calledTurn) {
  await this.turnRepo.save({ ...calledTurn, status: "completed", attendedAt: new Date() });
}
```

Ese turno nunca pasó por `"attending"`, nunca tuvo `serviceWindowId` ni
`startedAttentionAt` — pero queda marcado como si hubiera sido atendido con
éxito. `TurnStatus` no tenía ningún valor para "fue llamado y no se
presentó", distinto de `completed` (atendido de verdad) y de `cancelled`
(el cliente/empleado lo dio de baja proactivamente).

Consecuencia concreta: `getRawMetricsByDate` filtra `completedTurns` por
`startedAttentionAt not null`, así que estos turnos-fantasma quedaban
afuera del promedio de atención (correcto) **pero también afuera de
`completedCount` y `cancelledCount`** — desaparecían de las métricas del
día. Mientras tanto `findHistoryByQueue` sí los traía (filtra por
`status IN (COMPLETED, CANCELLED)`) y los mostraba como un turno completado
normal en el historial del panel. Dos vistas del mismo negocio, dos
números distintos, ninguna reflejando la realidad operativa.

### Fix

Nuevo valor de `TurnStatus`: `NO_SHOW` (migración
`20260820010000_add_turn_no_show_status`, agrega el valor al enum más la
columna `noShowAt`). `CallNextUseCase` ahora marca el turno superado como
`"no_show"` con `noShowAt`, no `"completed"` con `attendedAt` — se mantiene
automático (sin acción explícita del empleado), tal como se decidió
mantenerlo: una acción manual de "marcar no-show" antes de llamar al
siguiente sumaría fricción operativa sin necesidad, el sistema ya sabe que
pasó en el momento en que se pisa el turno llamado.

- `TurnDayRaw`/`DayMetrics` ganan `noShowCount`/`noShowRate` (mismo cálculo
  que `cancellationRate`, sobre el total de turnos cerrados del día).
  `totalCount` ahora es `completed + cancelled + no_show`.
- `findHistoryByQueue` incluye `NO_SHOW` junto a `COMPLETED`/`CANCELLED`, con
  `status: "no_show"` explícito y `noShowAt` en el item — el panel puede
  distinguirlo de un turno realmente atendido.
- `getAverageServiceMinutes` y `getRawMetricsByDate` no cambian su filtro de
  `completedTurns` — un `no_show` nunca tiene `startedAttentionAt`, así que
  ya quedaba excluido del promedio de atención correctamente; lo que se
  arregló es que ahora también se **cuenta** en algún lado, en vez de
  desaparecer.

**Pendiente, fuera de este backend**: el panel (frontend) hoy no distingue
visualmente `no_show` de `completed` en el historial — es un campo nuevo
que la UI todavía no consume. Vale la pena sumarlo como indicador (ej.
"cuántos no se presentaron hoy") dado que es justamente el dato de valor
que este fix habilita.

### Efecto colateral encontrado: `GetGuestTurnStatusUseCase` no reconocía el nuevo estado

Agregar `no_show` sin revisar todos los consumidores de `TurnStatus` dejó un
hueco en el endpoint público de HU-4.2 (web ligera, sin cuenta): el chequeo
de estado terminal solo cubría `cancelled`/`completed`. Un turno `no_show`
caía al cálculo de "sigue esperando" (`resolveTurnWaitStatus`), que no
reconoce ese estado tampoco y lo trata como si siguiera activo — el cliente
sin cuenta seguía viendo *"estás esperando, posición N"* sobre un turno que
ya fue salteado. `GetMyTurnUseCase` (flujo con cuenta) no tenía este
problema: busca por `findActiveByCustomerInQueue`, que ya filtra por
estados activos y excluye `no_show` correctamente (devuelve 404, no un
estado inventado).

Fix: `GetGuestTurnStatusUseCase` trata `no_show` igual que `cancelled`/
`completed` — estado terminal, corta antes de llegar al cálculo de espera.

### Cobertura

- `tests/unit/queue/CallNextUseCase.test.ts` (test renombrado: *marks the
  currently-called turn as no_show*)
- `tests/unit/queue/GetQueueMetricsUseCase.test.ts` (bloques *noShowCount* y
  *noShowRate*)
- `tests/unit/queue/GetTurnHistoryUseCase.test.ts` (caso *no_show* en el
  listado + shape del item)
- `tests/unit/queue/GetGuestTurnStatusUseCase.test.ts` (caso *no_show*
  tratado como terminal, no como "sigue esperando")

585 tests en verde (suite completa).

Validación manual: pendiente.

## Refinamiento — recursos rechazados/inactivos ocupaban cupo del plan para siempre (2026-08-20)

Rama: `bugfix/restructurar-limites-planes` (mismo trabajo que la
reformulación del pitch de planes, arriba). Encontrado al explicar los
flujos de creación en detalle: los tres chequeos de límite de plan
(negocios, colas, ventanillas) contaban recursos sin filtrar por estado.

### El problema

- `RegisterBusinessUseCase`, vía `IBusinessRepo.countByOrganizationId`,
  contaba *todos* los negocios de la organización — incluidos `rejected`.
  En Basic (techo 1 negocio), si el primer alta se rechazaba, la cuenta
  quedaba bloqueada para siempre, sin ningún camino para volver a
  registrar.
- `CreateQueueUseCase`, vía `IQueueRepo.findByBusinessId(...).length`,
  contaba todas las colas del negocio sin filtrar `isActive`. Con
  `maxQueuesPerBusiness` en 1 para los tres planes (ver refinamiento
  anterior), desactivar la única cola con `ToggleQueueUseCase` dejaba al
  negocio sin ninguna forma de crear una de reemplazo.
- `CreateServiceWindowUseCase`, mismo patrón con
  `IServiceWindowRepo.findByQueueId(...).length` — una ventanilla
  desactivada con `ToggleServiceWindowUseCase` ocupaba su cupo para
  siempre.

### Fix

- `countByOrganizationId` ahora excluye `rejected` (`status: { not:
  "REJECTED" }` en la query de Postgres). `suspended` sigue contando a
  propósito: es una acción temporal de la plataforma sobre un negocio real
  que ya operó y puede reactivarse — no es lo mismo que un alta que nunca
  llegó a existir.
- `CreateQueueUseCase` y `CreateServiceWindowUseCase` filtran por
  `isActive` antes de pasarle el conteo a
  `EnsureQueueCreationAllowedUseCase`/`EnsureServiceWindowCreationAllowedUseCase`.
  La unicidad de `prefix` en `CreateQueueUseCase` sigue mirando *todas*
  las colas (activas o no) — reusar el prefijo de una cola pausada
  seguiría siendo confuso si se reactiva.

### Cobertura

- `tests/unit/business/RegisterBusinessUseCase.test.ts` (2 casos: un
  negocio `rejected` no cuenta, uno `suspended` sí)
- `tests/unit/queue/CreateQueueUseCase.test.ts` (una cola desactivada no
  cuenta)
- `tests/unit/queue/CreateServiceWindowUseCase.test.ts` (una ventanilla
  desactivada no cuenta)

617 tests en verde (suite completa).

Validación manual: pendiente.

## Bugfix — IDOR en operaciones de cola: `authorize` no probaba pertenencia al negocio (2026-09-01)

Rama: `bugfix/ownership-operaciones-cola`. Encontrado en una auditoría
general del proyecto (arquitectura, seguridad, tests, lógica de negocio):
finding crítico de seguridad.

### El problema

El middleware `authorize(...permissions)` solo valida el rol **global** del
usuario autenticado (`user`/`employee`/`business_admin`/`super_admin`)
contra una tabla estática de permisos. Nunca comprueba que ese usuario
pertenezca al negocio específico sobre el que está operando — el propio
comentario del código en `authorize.ts` ya lo advertía: *"Business
ownership and employee membership are intentionally checked inside use
cases, because permissions alone cannot prove access to a specific
business instance."*

Ese chequeo, sin embargo, no existía en once casos de uso del módulo de
colas. Cualquier `employee`/`business_admin` autenticado podía operar sobre
la cola o los turnos de **cualquier negocio** de la plataforma con solo
conocer (o adivinar) su `queueId`/`turnId` — llamar siguiente turno,
atender, redirigir, marcar no-show, cancelar, crear turnos manuales, listar
ventanillas, ver métricas e historial de un negocio ajeno.

### Fix

Nuevo `EnsureBusinessMembershipUseCase` (módulo `business`, expuesto en su
`public-api`): dado `businessId` + `userId`, permite el paso si el usuario
es el dueño (`ownerUserId`) o tiene un registro activo en
`IBusinessEmployeeRepo.findActiveByBusinessAndUser`; si no, lanza `403
BUSINESS_MEMBERSHIP_REQUIRED`. Es un chequeo interno (como
`EnsureQueueCreationAllowedUseCase`), sin validación Zod propia — la
validación de forma de `businessId`/`userId` ya la hace el use case que lo
invoca.

Se inyectó en los once casos de uso de `queue` que operan sobre una cola o
turno existente, cada uno ahora recibe `requestingUserId` (tomado de
`request.user.id` en el controller) y llama al guard inmediatamente
después de resolver la cola/turno, antes de cualquier otra lógica:

`CallNextUseCase`, `GetQueueListUseCase`, `GetQueueStatusUseCase`,
`GetQueueMetricsUseCase`, `GetTurnHistoryUseCase`,
`ListServiceWindowsUseCase`, `CreateManualTurnUseCase`, `AttendTurnUseCase`,
`RedirectTurnUseCase`, `MarkTurnNoShowUseCase`, `CancelTurnByEmployeeUseCase`.

De paso, `GetQueueStatusUseCase` y `CreateManualTurnUseCase` importaban
tipos e implementaciones del módulo `business` saltándose su `public-api`
(`domain`/`infrastructure` directos) — se corrigió para importar todo desde
`@modules/business/public-api`, siguiendo la convención de dependencia
unidireccional entre módulos.

### Cobertura

- `tests/unit/business/EnsureBusinessMembershipUseCase.test.ts` (nuevo, 6
  casos: dueño permitido, empleado activo permitido, empleado dado de baja
  rechazado, usuario sin ninguna relación rechazado, empleado activo en
  *otro* negocio rechazado, `404` si el negocio no existe)
- Cada uno de los once casos de uso de `queue` listados arriba gana un caso
  *"throws BUSINESS_MEMBERSHIP_REQUIRED for a user unrelated to the
  business"`, además de un `requestingUserId` en todos sus casos
  preexistentes

644 tests en verde (suite completa), `tsc --noEmit` limpio en `src` y en
tests.

Validación manual: pendiente.

## Bugfix — reactivar una cola/ventanilla esquivaba el límite del plan (2026-09-01)

Rama: `bugfix/enforcement-limites-plan`. Encontrado en una segunda auditoría
general del proyecto (verificación de la anterior + pasada nueva desde
cero).

### El problema

El refinamiento de arriba ("recursos rechazados/inactivos ocupaban cupo
del plan para siempre") cerró el lado de la *creación*: una cola/ventanilla
desactivada no cuenta contra el límite al crear una nueva. Pero dejó
abierto el lado de la *reactivación*: `ToggleQueueUseCase` y
`ToggleServiceWindowUseCase` vuelven a prender `isActive` sin volver a
preguntarle a `EnsureQueueCreationAllowedUseCase`/
`EnsureServiceWindowCreationAllowedUseCase` si el plan actual lo permite.

**Escenario concreto (ventanillas, el que sí es explotable hoy — ver nota
sobre colas abajo):** una organización Pro con 5 ventanillas activas en una
cola baja a Basic (techo 1). `EnforceQueueLimitsForOrganizationUseCase`
desactiva las 4 que sobran. El dueño, sin hacer nada raro, toca
"reactivar" sobre cualquiera de esas 4 en el panel — el toggle la prende
de nuevo sin chequear nada. El enforcement de planes protegía la puerta de
adelante y dejaba la de atrás abierta.

**Nota sobre colas:** hoy `maxQueuesPerBusiness` es `1` en los tres planes
(ver comentario en `PlanLimits.ts`), así que este mismo hueco en
`ToggleQueueUseCase` está dormido — nunca hay más de 1 cola para empezar,
entonces nunca hay una cola de sobra para reactivar de más. Se arregló
igual, por consistencia con `ToggleServiceWindowUseCase` y porque
`PlanLimits.ts` ya documenta que subir ese límite por plan es "un cambio
de una línea" a futuro — cuando eso pase, el hueco ya no estará dormido.

### Fix

Mismo patrón que `CreateQueueUseCase`/`CreateServiceWindowUseCase`: antes
de pasar de `isActive: false` a `true`, se cuentan los hermanos activos
(excluyendo el propio recurso) y se llama a
`EnsureQueueCreationAllowedUseCase`/`EnsureServiceWindowCreationAllowedUseCase`
con ese conteo. El chequeo de "no desactivar la última cola activa"
(`ToggleQueueUseCase`) y el de "no desactivar una ventanilla ocupada"
(`ToggleServiceWindowUseCase`) no cambian — el nuevo chequeo corre en la
rama contraria (`else`), solo al reactivar.

### Cobertura

- `tests/unit/queue/ToggleQueueUseCase.test.ts` (2 casos nuevos: bloquea
  reactivar si excede `maxQueuesPerBusiness`, permite reactivar dentro del
  límite)
- `tests/unit/queue/ToggleServiceWindowUseCase.test.ts` (2 casos nuevos:
  mismo par para `maxServiceWindowsPerQueue`)

699 tests en verde (suite completa), `tsc --noEmit` limpio en `src` y en
tests.

Validación manual: pendiente.
