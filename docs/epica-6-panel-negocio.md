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
  `HU-6.1`, `HU-6.2`, `HU-6.4`, `HU-6.5`.
- Con un gap de diseño a resolver antes de darla por completa: `HU-6.3`
  (conviven dos modelos de "ventanillas", ver más abajo).
- Sin ningún backend involucrado, 100% frontend: `HU-6.6`.

## Contratos principales de la épica

Todos preexistentes, ninguno se creó para esta épica:

```text
GET   /api/queue/:queueId/status                          queue:read        → HU-6.1
PATCH /api/business/:businessId/operational-status         business:edit     → HU-6.2
PUT   /api/business/:businessId/service-windows             business:edit     → HU-6.3 (modelo legado, ver nota)
GET   /api/queue/:queueId/windows                          queue:read        → HU-6.3 (modelo real, ver nota)
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

Estado: `implementado dos veces, con modelos distintos sin unificar — gap
real`.

### Objetivo de producto

Que el negocio pueda ajustar cuántas ventanillas tiene operando, y que el
tiempo estimado de espera se recalcule con ese número.

### El gap: dos modelos de "ventanillas" conviven hoy

**Modelo legado (HU-2.3, Épica 2)**: `Business.activeServiceWindows` es un
entero simple. Se edita con `PUT /api/business/:businessId/service-windows`
(`ConfigureBusinessServiceWindowsUseCase`). No tiene identidad individual —
es solo un contador.

**Modelo real (Épica 3, refinamiento `bugfix/service-windows` y
siguientes)**: `ServiceWindow` es una entidad propia por cola
(`id`, `name`, `type`, `isActive`), con CRUD completo
(`GET/POST/PATCH/DELETE /api/queue/:queueId/windows`, ver
`docs/epica-3-cola.md`) y lógica real de ocupación/derivación de turnos.

**Cómo se reconcilian hoy** (`GetQueueStatusUseCase` /
`GetQueueListUseCase`, ver `docs/epica-3-cola.md`): si la cola tiene al
menos una `ServiceWindow` creada, el estimado de espera usa el conteo real
de ventanillas activas (modelo nuevo) e **ignora** el contador legado. Si la
cola no tiene ninguna `ServiceWindow` creada todavía, cae al contador legado
como fallback. Es decir, el modelo nuevo ya "gana" en la práctica — el
legado solo sigue vivo para negocios que nunca migraron a ventanillas
individuales.

### Decisión pendiente (no tomada en este documento)

¿Se deprecia `PUT /api/business/:businessId/service-windows` y
`Business.activeServiceWindows` una vez que todo negocio tenga al menos una
`ServiceWindow`? Requiere decisión de producto (¿hay negocios en
producción que dependan solo del contador?) antes de tocar código — no se
resuelve acá.

### Cobertura de tests

- `tests/unit/business/ConfigureBusinessServiceWindowsUseCase.test.ts` (modelo legado)
- `tests/unit/queue/CreateServiceWindowUseCase.test.ts`,
  `UpdateServiceWindowUseCase.test.ts`, `DeleteServiceWindowUseCase.test.ts`,
  `ToggleServiceWindowUseCase.test.ts` (modelo real)

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

1. **HU-6.3**: decidir si se deprecia el contador legado
   (`Business.activeServiceWindows` / `PUT
   /api/business/:businessId/service-windows`) ahora que el modelo de
   `ServiceWindow` individual ya lo reemplaza en la práctica para colas que
   lo adoptaron.
2. **HU-6.6**: sin empezar, 100% frontend, no bloquea nada de backend.

Todo lo demás de esta épica ya está resuelto por trabajo de Épica 2 y Épica
3 — no hace falta ninguna implementación de backend adicional para cerrarla
formalmente, salvo la decisión del punto 1.
