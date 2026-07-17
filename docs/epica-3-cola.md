# Épica 3 - Cola

## Resumen

La Épica 3 implementa la cola de turnos persistida de Espera. Su objetivo es
que un usuario pueda sacar turno en un negocio desde la app, y que el negocio
pueda operar la cola desde el panel: llamar al siguiente, cancelar turnos y
consultar el estado en tiempo real.

Alcance total estimado: `31 pts`.

Formato de referencia:

- `docs/story-documentation-standard.md`

## Estado general

- Estado: `parcial`.
- Historias implementadas: `HU-3.1`.
- Historias pendientes: `HU-3.2`, `HU-3.3`, `HU-3.4`, `HU-3.5`, `HU-3.6`,
  `HU-3.7`, `HU-3.8`, `HU-3.9`, `HU-3.10`, `HU-3.11`, `HU-3.12`.

## Contratos principales de la épica

Cola:

```text
POST /api/queues/:queueId/turns
POST /api/queues/turns/call-next   (stub — pendiente HU-3.3)
POST /api/queues/turns/cancel      (stub — pendiente HU-3.5)
```

## Modelo de datos central

Tablas creadas en migración `20260717100000_add_queues_and_turns`:

- `queues`: una cola por negocio (extensible a N colas).
- `turns`: turno individual dentro de una cola para una fecha de operación.

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
- Llamar al siguiente y cancelar turno: los endpoints `call-next` y `cancel`
  son stubs diferidos a HU-3.3 y HU-3.5.
- Notificaciones push al recibir o cancelar turno: diferidas a épicas de
  notificaciones.
- Estado de cola en tiempo real (Socket.IO): diferido a HU-3.9 / HU-3.10.

### Contrato backend

```text
POST /api/queues/:queueId/turns
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
- `position`: número correlativo entero, equivalente a la posición en la cola
  en el momento de creación.

### Modelo y persistencia

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

type TurnStatus   = "waiting" | "called" | "cancelled" | "completed";
type TurnPriority = "arrived" | "physical" | "in_transit" | "registered";
type TurnSource   = "app" | "manual" | "qr" | "web";

interface Turn {
  id: string;
  queueId: string;
  businessId: string;
  customerId?: string;
  guestName?: string;
  number: number;
  displayNumber: string;
  status: TurnStatus;
  priority: TurnPriority;
  source: TurnSource;
  turnDate: Date;
  calledAt?: Date;
  attendedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

Migración aplicada: `20260717100000_add_queues_and_turns`.

Enums de DB: `TurnStatus`, `TurnPriority`, `TurnSource` (mayúsculas en
Postgres; el repo mapea a minúsculas en dominio).

Índices en `turns`:

- `(queueId, status)` — para llamar al siguiente y consultar cola activa.
- `(customerId, status)` — para el chequeo de turno activo cross-business.
- `(businessId, turnDate)` — para agrupar por día de operación.

`turnDate` normalizado a medianoche UTC (`todayUTC()`) para consistencia en
entornos con zonas horarias distintas entre app y servidor.

### Reglas de negocio

1. La cola debe existir y tener `isActive = true`.
2. El negocio asociado debe tener `status = approved`.
3. El negocio no puede tener `operationalStatus = paused` ni `closed`.
4. Si se provee `customerId`, el cliente no puede tener un turno activo
   (`waiting` o `called`) en ningún otro negocio. El mensaje de error
   indica explícitamente que debe cancelarlo primero.
5. El número de turno se asigna dentro de una transacción con `FOR UPDATE`
   sobre la fila del queue en Postgres, garantizando secuencia sin huecos
   bajo concurrencia alta.
6. La prioridad siempre es `registered` y el source siempre es `app` en
   esta historia.

### Eventos e integraciones

Sin integraciones externas en esta historia. La emisión de eventos de dominio
para notificaciones push (ej. `turn.created`) queda diferida a la épica de
notificaciones.

### Documentación inline

- `CreateTurnUseCase.ts`: documenta `todayUTC()` y la razón del `FOR UPDATE`
  en la creación de turno.
- `PostgresTurnRepo.ts`: documenta el lock de fila (`SELECT ... FOR UPDATE`)
  como mecanismo de serialización para numeración correlativa sin duplicados.
- `ITurnRepo.ts` / `IQueueRepo.ts`: documentan los métodos diferidos
  (`findNextWaitingTurn`, `findActiveByBusinessId`) como contratos preparados
  para HU posteriores.

### Contratos diferidos

Los siguientes contratos están declarados en las interfaces y en el router pero
no cerrados end-to-end:

- `POST /api/queues/turns/call-next` — `CallNextUseCase` (stub): diferido a
  HU-3.3.
- `POST /api/queues/turns/cancel` — `CancelTurnUseCase` (stub): diferido a
  HU-3.5.
- `ITurnRepo.findNextWaitingTurn` — implementado en repo pero no consumido por
  ningún use case activo.
- `IQueueRepo.findActiveByBusinessId` — preparado para el contrato de estado
  de cola de HU-3.2.

### Cobertura

- `tests/unit/queue/CreateTurnUseCase.test.ts`

Tests automatizados:

- creación exitosa con customerId y respuesta correcta
- numeración correlativa en turnos sucesivos del mismo día
- uso del prefijo de la cola en el displayNumber
- rechazo con `404` cuando la cola no existe
- rechazo con `409` cuando la cola está inactiva
- rechazo con `409` cuando el negocio no está aprobado
- rechazo con `409` cuando el negocio está pausado
- rechazo con `409` cuando el negocio está cerrado
- rechazo con `409` cuando el cliente ya tiene turno activo en cualquier negocio
- creación exitosa de turno sin customerId (invitado)
- rechazo con `400` para queueId inválido (no UUID)
