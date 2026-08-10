# Épica 6 - Panel del Negocio

## Resumen

La Épica 6 nunca se implementó como bloque propio: para cuando se llegó a
evaluarla, gran parte de lo que pide ya existía como efecto colateral de la
Épica 3 (Cola) y de HU-2.5 (ventanillas legadas). Este documento consolida
esa cobertura existente, marca lo que falta explícitamente, y deja un
registro claro de qué HU está resuelta por qué endpoint — sin inventar
contratos nuevos que dupliquen algo que ya funciona.

Alcance total: `19 pts` (6 historias).

Formato de referencia: `docs/story-documentation-standard.md`

## Estado general

- Estado: `parcialmente implementado, sin trackear formalmente hasta ahora`.
- Cubiertas de facto por endpoints de `queue`/`business` ya existentes:
  `HU-6.1`, `HU-6.2`, `HU-6.3`, `HU-6.4`, `HU-6.5`.
- Sin ningún backend involucrado, 100% frontend: `HU-6.6`.

## Contratos principales de la épica

Todos preexistentes, ninguno se creó para esta épica:

```text
GET   /api/queue/:queueId/status                          queue:read        → HU-6.1
PATCH /api/business/:businessId/operational-status         business:edit     → HU-6.2
GET   /api/queue/:queueId/windows                          queue:read        → HU-6.3
GET   /api/queue/:queueId/turns/history?date=YYYY-MM-DD    queue:read        → HU-6.4
GET   /api/queue/:queueId/metrics?date=YYYY-MM-DD          queue:read        → HU-6.5
```

---

## HU-6.1 - Dashboard principal con el estado de la cola en tiempo real

Story points: `5`

Estado: `implementado` (vía Épica 3, no HU-6.1 dedicada).

### Objetivo de producto

Ver de un vistazo: estado operativo del negocio, cantidad de personas en
cola, tiempo estimado total, ventanillas activas y poder llamar al
siguiente turno.

### Cobertura real

`GET /api/queue/:queueId/status` (`GetQueueStatusUseCase`, ver
`docs/epica-3-cola.md`) devuelve exactamente estos datos en un solo
request:

```json
{
  "queueId": "uuid",
  "businessId": "uuid",
  "operationalStatus": "normal",
  "activeServiceWindows": 2,
  "waitingCount": 3,
  "calledCount": 1,
  "attendingCount": 2,
  "redirectedCount": 0,
  "estimatedTotalWaitMinutes": 15,
  "recentCalls": [ /* últimos 5 llamados */ ]
}
```

El botón "Siguiente" es `POST /api/queue/turns/call-next`
(`CallNextUseCase`, ya documentado en Épica 3). Los eventos `queue:update`
por Socket.IO (`queue:{queueId}`) cubren la actualización en tiempo real sin
recargar, incluido el descuento inmediato del contador al llamar siguiente.

### Gap

Ninguno a nivel backend — el criterio de aceptación se satisface tal cual.

### Cobertura de tests

- `tests/unit/queue/GetQueueStatusUseCase.test.ts`
- `tests/unit/queue/CallNextUseCase.test.ts`

---

## HU-6.2 - Cambiar el estado operativo del negocio desde el panel

Story points: `2`

Estado: `implementado` (vía Épica 2, HU-2.5 original).

### Objetivo de producto

Cambiar el negocio a "Con demoras" / "Pausado" / "Cerrado" y que eso se
refleje para los usuarios en tiempo real.

### Cobertura real

`PATCH /api/business/:businessId/operational-status`
(`UpdateBusinessOperationalStatusUseCase`, ver
`docs/epica-2-gestion-negocios.md`). Estados soportados: `normal`,
`delayed`, `paused`, `closed`. `paused`/`closed` bloquean turnos nuevos
(`CreateTurnUseCase`/`CreateManualTurnUseCase` ya validan
`operationalStatus`, código `BUSINESS_OPERATIONAL_STATUS_BLOCKED` — ver
`docs/epica-3-cola.md`).

### Gap

Ninguno a nivel backend.

### Cobertura de tests

- `tests/unit/business/UpdateBusinessOperationalStatusUseCase.test.ts`

---

## HU-6.3 - Modificar la cantidad de ventanillas activas desde el panel

Story points: `2`

Estado: `implementado — gap de los dos modelos cerrado por completo (Fase A + B)`.

### Objetivo de producto

Que el negocio pueda ajustar cuántas ventanillas tiene operando, y que el
tiempo estimado de espera se recalcule con ese número.

### El gap que existió: dos modelos de "ventanillas" convivían

**Modelo legado (HU-2.3, Épica 2)**: `Business.activeServiceWindows` era un
entero simple, editable con `PUT /api/business/:businessId/service-windows`
(`ConfigureBusinessServiceWindowsUseCase`). No tenía identidad individual —
era solo un contador.

**Modelo real (Épica 3, refinamiento `bugfix/service-windows` y
siguientes)**: `ServiceWindow` es una entidad propia por cola
(`id`, `name`, `type`, `isActive`), con CRUD completo
(`GET/POST/PATCH/DELETE /api/queue/:queueId/windows`, ver
`docs/epica-3-cola.md`) y lógica real de ocupación/derivación de turnos.

La lectura de espera (`GetQueueStatusUseCase`/`GetQueueListUseCase`) ya
priorizaba el modelo real y caía al legado solo como fallback si la cola no
tenía ninguna `ServiceWindow` creada — pero el legado seguía siendo
necesario, porque `ApproveBusinessUseCase` creaba la primera `Queue` al
aprobar un negocio sin crear ninguna `ServiceWindow` real para ella. Todo
negocio nuevo dependía 100% del contador legado hasta que el dueño usara el
CRUD nuevo por su cuenta.

### Decisión: cerrado (bugfix `bugfix/resolve-service-window-model-gap`, 2026-08-10)

Se completó el modelo real en vez de mantener los dos:

1. Tanto `ApproveBusinessUseCase` (primera `Queue`) como
   `CreateQueueUseCase` (`Queue` adicionales) crean ahora una
   `ServiceWindow` por defecto junto con cada `Queue` nueva — el modelo
   real queda autosuficiente desde el día uno, sin depender de que el
   dueño configure nada a mano.
2. `PUT /api/business/:businessId/service-windows` y
   `ConfigureBusinessServiceWindowsUseCase` **se eliminaron** — ya no hacía
   falta un segundo camino de escritura.
3. (Fase B, misma rama) `Business.activeServiceWindows` se eliminó por
   completo del schema (migración
   `20260810010000_drop_business_active_service_windows`) y de los ~13
   archivos que todavía lo leían o le asignaban un default (estimación de
   espera, disponibilidad, QR público, flujos de registro). Los casos que
   necesitaban un número a nivel negocio sin cola específica
   (`ListMyBusinessesUseCase`, `ResolveBusinessQrCodeUseCase`) pasan a
   resolverlo contra la `Queue` activa/principal, mismo criterio que ya usa
   `activeQueueId`.

Detalle completo en `docs/epica-3-cola.md`, secciones *"Bugfix — cierre del
modelo de ventanillas, Fase A"* y *"Fase B"*.

### Cobertura de tests

- `tests/unit/business/ApproveBusinessUseCase.test.ts`,
  `tests/unit/queue/CreateQueueUseCase.test.ts` (ventanilla por defecto)
- `tests/unit/queue/CreateServiceWindowUseCase.test.ts`,
  `UpdateServiceWindowUseCase.test.ts`, `DeleteServiceWindowUseCase.test.ts`,
  `ToggleServiceWindowUseCase.test.ts` (CRUD del modelo real)

---

## HU-6.4 - Historial de turnos atendidos del día

Story points: `3`

Estado: `implementado` (vía Épica 3).

### Objetivo de producto

Ver la lista de turnos atendidos con número, nombre/descripción, hora de
entrada, hora de atención y tiempo de espera real, filtrable por fecha.

### Cobertura real

`GET /api/queue/:queueId/turns/history?date=YYYY-MM-DD`
(`GetTurnHistoryUseCase`, ver `docs/epica-3-cola.md`) devuelve exactamente
estos campos por turno completado: `turnId`, `displayNumber`,
`customerName`/`guestName`, `source`, `priority`, `createdAt`, `calledAt`,
`attendedAt`, `waitMinutes`.

### Gap

Ninguno a nivel backend.

### Cobertura de tests

- `tests/unit/queue/GetTurnHistoryUseCase.test.ts`

---

## HU-6.5 - Métricas básicas del día

Story points: `3`

Estado: `implementado` (vía Épica 3).

### Objetivo de producto

Ver total de turnos atendidos, tiempo promedio de atención, hora pico del
día y % de cancelaciones, con comparación contra el día anterior.

### Cobertura real

`GET /api/queue/:queueId/metrics?date=YYYY-MM-DD`
(`GetQueueMetricsUseCase`) calza 1:1 con los criterios de aceptación:

```json
{
  "date": "2026-01-01",
  "today":     { "completedCount": 12, "cancelledCount": 2, "totalCount": 14, "cancellationRate": 14.3, "avgServiceMinutes": 8, "peakHour": 11 },
  "yesterday": { "completedCount": 9,  "cancelledCount": 1, "totalCount": 10, "cancellationRate": 10.0, "avgServiceMinutes": 7, "peakHour": 15 }
}
```

`today`/`yesterday` en la misma respuesta ya resuelve el criterio de
"comparar con ayer" sin un segundo request.

### Gap

Ninguno a nivel backend.

### Cobertura de tests

- `tests/unit/queue/GetQueueMetricsUseCase.test.ts`

---

## HU-6.6 - Operar el panel cómodamente desde el celular

Story points: `4`

Estado: `no implementado — 100% frontend`.

### Objetivo de producto

Botones táctiles grandes (mínimo 64px), layout sin scroll horizontal en
vertical, adaptación en horizontal, panel que sigue actualizado si se apaga
la pantalla del celular.

### Por qué no tiene contraparte backend

Es puramente responsividad/UX de la app del panel (`espera-front`). No hay
ningún dato, endpoint o contrato que el backend deba proveer para esto — los
datos ya están cubiertos por HU-6.1/6.4/6.5. Queda enteramente del lado del
frontend cuando se aborde.

---

## Resumen de gaps reales de esta épica

1. **HU-6.6**: sin empezar, 100% frontend, no bloquea nada de backend.

Todo lo demás de esta épica ya está resuelto — HU-6.3 se cerró por completo
(bugfix `bugfix/resolve-service-window-model-gap`, ver esa sección arriba).
No hace falta ninguna implementación de backend adicional para cerrar esta
épica formalmente, salvo HU-6.6 del lado frontend.
