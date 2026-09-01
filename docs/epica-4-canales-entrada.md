# Épica 4 - Canales de Entrada

## Resumen

Cubre las distintas formas en que un turno puede entrar a la cola, además del
flujo principal de la app (Épica 3): escanear el QR del negocio, sacar turno
sin tener la app instalada, agregar un turno manual desde el panel, e
integrar un dispensador físico numerado.

Alcance total: `18 pts` (4 historias del backlog original) + HU-4.5, agregada
fuera de backlog para el piloto (ver esa sección).

Formato de referencia: `docs/story-documentation-standard.md`

## Estado general

- Estado: `parcialmente implementado`.
- **HU-4.1** y **HU-4.3** ya estaban cubiertas de facto por trabajo de Épica
  2 y Épica 3 respectivamente — no se creó nada nuevo para ellas.
- **HU-4.2** se implementó en esta épica (rama
  `feature/hu-4.2-web-ligera-sin-app`).
- **HU-4.4** (dispensador físico) queda sin implementar — depende de un
  protocolo de hardware que no está definido en ningún documento del
  proyecto. Ver sección al final.
- **HU-4.5** (reserva por teléfono/WhatsApp, sin bot) — no está en el
  backlog v2.4, se agregó puntualmente antes de salir a probar con negocios
  reales. Ver sección al final.

## Contratos principales de la épica

```text
GET   /api/qr/:token                     público             → HU-4.1 (ya existía, Épica 2)
POST  /api/queue/:queueId/turns/manual   turn:create_manual  → HU-4.3 (ya existía, Épica 3) + HU-4.5 (nuevo)
POST  /api/queue/guest-turns             público, rate-limit → HU-4.2 (nuevo)
GET   /api/queue/guest-turns/:turnId     público             → HU-4.2 (nuevo)
```

---

## HU-4.1 - Escanear el QR del negocio para sacar turno

Story points: `3`

Estado: `implementado` (vía Épica 2, HU-2.4 + su resolver público).

### Objetivo de producto

Que un usuario que escanea el QR físico del negocio sea llevado directamente
al flujo de sacar turno, sin tener que buscar el negocio manualmente.

### Cobertura real

`GET /api/qr/:token` (`ResolveBusinessQrCodeUseCase`, ver
`docs/epica-2-gestion-negocios.md`) ya devuelve exactamente el contrato que
pide el AC: `action: "OPEN_BUSINESS_TURN_FLOW"` y `appPath`, junto con los
datos del negocio (`activeServiceWindows`, `operationalStatus`, etc.) para
que la app decida cómo mostrarlo antes de confirmar. Si el negocio no está
`approved`, responde `409 BUSINESS_NOT_ACCEPTING_CUSTOMERS` en vez de dejar
que el flujo llegue hasta el final y falle recién en la creación del turno.

### Gap

Ninguno a nivel backend — el resto del AC (login intermedio si no hay
sesión, manejo de QR inválido) es responsabilidad de la app/frontend
consumiendo este contrato.

---

## HU-4.2 - Sacar turno sin tener la app instalada (web ligera)

Story points: `5`

Estado: `implementado`.

### Objetivo de producto

Que alguien sin la app instalada pueda escanear el QR, sacar turno desde una
web liviana en el navegador, y ver su posición actualizarse sin necesidad de
cuenta ni login.

### Criterios de aceptación

- Dado que escaneo el QR sin tener la app, cuando el navegador abre el link,
  entonces veo una web ligera con el nombre del negocio y el botón "Sacar
  turno".
- Dado que saco turno desde la web ligera, entonces obtengo una página con
  mi número de turno y posición que se actualiza automáticamente.
- Dado que estoy en la web ligera, cuando llaman a mi turno, entonces la
  página muestra "¡Es tu turno!" de forma visible.

### Decisiones de alcance

El dominio ya estaba preparado para esto antes de esta épica:
`TurnSource` ya incluía `"web"` y `Turn`/`CreateTurnData` ya tenían
`guestName` opcional — quedó sin conectar hasta ahora. `CreateTurnUseCase`
también ya trataba `customerId` como opcional. Lo que faltaba era la
superficie pública: **todas** las rutas de turnos existentes exigen
`authenticate` y resuelven por `customerId` de una sesión — no había ningún
camino anónimo de creación ni de consulta.

Quedó fuera de esta historia el "¡Es tu turno!" en tiempo real (push/socket)
para el visitante anónimo — la web ligera actualiza su posición por
**polling** (consultando el endpoint de status), no por WebSocket ni push.
No hay token de dispositivo que registrar para un visitante sin cuenta, así
que no hay ningún canal de push disponible para engancharlo — llegado el
momento de encarar Épica 5 (Notificaciones), esa limitación se mantiene: los
pushes son para el flujo autenticado de la app.

### Contrato backend

```text
POST /api/queue/guest-turns
```

Público (sin `authenticate`), rate-limited (5 requests / 10 min por IP,
mismo `rateLimiter` que ya usan `login`/`register`).

Request body:

```json
{ "businessId": "uuid", "guestName": "Juan Pérez" }
```

Response `201`:

```json
{ "turnId": "uuid", "queueId": "uuid", "displayNumber": "A-007", "position": 7 }
```

El cliente solo conoce el `businessId` (viene de la URL del QR, ver HU-4.1)
— no sabe ni le importa a qué `Queue` interna pertenece. El backend resuelve
la `Queue` activa/principal del negocio (`queueRepo.findActiveByBusinessId`,
mismo criterio que ya usa `activeQueueId` en `ListMyBusinessesUseCase`) y
delega el resto — reglas de negocio, validaciones — a `CreateTurnUseCase`
sin duplicarlas.

```text
GET /api/queue/guest-turns/:turnId
```

Público, sin rate limit propio (solo lectura). Devuelve la misma forma que
`GET /:queueId/turns/my-turn` (el endpoint autenticado, HU-3.3):

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-007",
  "status": "waiting",
  "position": 3,
  "estimatedWaitMinutes": 15,
  "serviceWindowId": null
}
```

**El `turnId` es el propio mecanismo de acceso** — un UUID v4 aleatorio, no
secuencial ni enumerable, devuelto una única vez al crear el turno. Mismo
nivel de confianza que ya usan los tokens de QR (`buildBusinessQrUrl`): quien
no tiene el `turnId` no puede consultar el turno de otra persona. Se evaluó
agregar un token/secreto adicional para más defensa en profundidad, pero se
descartó por ahora — más superficie para mantener sin un riesgo concreto
adicional que lo justifique hoy.

### Modelo y persistencia

Sin migración — `Turn.guestName`, `Turn.customerId` (ahora ambos
independientemente opcionales) y `TurnSource = "web"` ya existían en el
schema. `CreateTurnUseCase` ahora exige al menos uno de `customerId` /
`guestName` (antes se podía crear un turno sin ninguno de los dos, un gap
que esta historia cerró de paso).

### Reglas de negocio

1. Un turno de invitado (`guestName`, sin `customerId`) **no** dispara el
   chequeo de "ya tenés un turno activo en otro negocio"
   (`CUSTOMER_HAS_ACTIVE_TURN`) — ese chequeo está atado a `customerId`, y un
   visitante anónimo no tiene una identidad estable entre negocios distintos
   para aplicarlo.
2. `source` se decide automáticamente: `"app"` si viene `customerId`,
   `"web"` si viene `guestName`. El caller nunca lo especifica directamente.
3. Un turno que ya pasó a `completed`/`cancelled` sigue siendo consultable
   por `GET /guest-turns/:turnId` — a diferencia del endpoint autenticado
   (que solo encuentra turnos activos vía
   `findActiveByCustomerInQueue`), acá se busca por `turnId` sin filtro de
   estado, así que el caso terminal se maneja explícito en
   `GetGuestTurnStatusUseCase` en vez de caer, por accidente, en la rama de
   "esperando".

### Documentación inline

`resolveTurnWaitStatus.ts` (nuevo, `queue/application/`) documenta por qué
existe: es el cálculo de posición/estimado compartido entre
`GetMyTurnUseCase` (autenticado) y `GetGuestTurnStatusUseCase` (público) —
ambos difieren solo en cómo resuelven el `Turn` de partida, no en cómo
calculan el estado a partir de él.

### Cobertura

- `tests/unit/queue/CreateTurnUseCase.test.ts` (casos `guestName`/`source`,
  y el nuevo `400` cuando no viene ni `customerId` ni `guestName`)
- `tests/unit/queue/CreateGuestTurnUseCase.test.ts` (nuevo)
- `tests/unit/queue/GetGuestTurnStatusUseCase.test.ts` (nuevo, incluye los
  casos terminales `completed`/`cancelled`)
- `tests/unit/queue/GetMyTurnUseCase.test.ts` (sin cambios de comportamiento,
  cubre el refactor a `resolveTurnWaitStatus`)

Validación manual: pendiente (requiere probar el flujo completo desde un QR
real hasta el polling en un negocio con turnos activos).

---

## HU-4.3 - Agregar turnos manualmente para personas sin dispositivo

Story points: `3`

Estado: `implementado` (vía Épica 3).

### Objetivo de producto

Que el empleado pueda cargar un turno para alguien que no tiene la app ni
quiere usar la web ligera, directamente desde el panel.

### Cobertura real

`POST /api/queue/:queueId/turns/manual` (`CreateManualTurnUseCase`, ver
`docs/epica-3-cola.md`) ya cubre esto — turno con `guestName`, prioridad
`physical`, `source: "manual"` (default), compite en la misma cola unificada
que los turnos virtuales.

**Extendido en HU-4.5** (ver esa sección): el mismo endpoint ahora también
acepta `source: "phone"` para reservas telefónicas — con `priority:
"registered"` en vez de `"physical"`, para no colarse en la cola.

### Gap

Ninguno a nivel backend.

---

## HU-4.4 - Integrar turnos de dispensador físico numerado

Story points: `7`

Estado: `no implementado — bloqueada por falta de definición de hardware`.

### Objetivo de producto

Que un dispensador físico que emite números pueda integrarse a la cola
unificada (app + QR + manual + dispensador en un solo flujo).

### Por qué no se atacó en esta pasada

No hay, en ningún documento del proyecto, una definición de qué hardware se
va a usar ni de qué protocolo expone (¿serial? ¿HTTP local? ¿un cliente que
puentea a la API?). Construir la integración ahora implicaría inventar un
contrato sin ningún dato real del dispositivo a integrar — alto riesgo de
tener que rehacerla por completo apenas se defina el hardware real.

### Qué haría falta para desbloquearla

Una decisión de producto/hardware (qué dispensador, cómo se comunica) antes
de escribir código. Hasta entonces, queda documentada como la única historia
del backlog original pendiente de esta épica.

### Cobertura

N/A — no implementada.

---

## HU-4.5 - Reservar turno por teléfono/WhatsApp (piloto)

Story points: sin asignar — no está en el backlog v2.4, se agregó como
pedido puntual antes de salir a validar con negocios reales.

Estado: `implementado`.

### Contexto de producto

Un relevamiento con usuarios finales mostró que solo usarían la app si les
ahorra tiempo real — y hasta esta historia, el único flujo sin app (HU-4.2,
web ligera) igual requiere estar parado en el local para escanear el QR. La
única forma de ahorrarle tiempo de verdad a alguien es dejarlo reservar sin
estar presente: llama por teléfono o escribe por WhatsApp (atendido por una
persona del local, no un bot), un empleado lo anota en la cola, y la persona
se acerca recién cuando está por llegar su turno.

Deliberadamente chico: no es un sistema de turnos con horario fijo (nada de
slots/calendario) — es la misma cola en vivo de siempre (FIFO dentro de cada
prioridad), solo que alguien la cargó por la persona en vez de que ella
escaneara el QR.

### Decisiones de alcance

**No se creó ningún concepto nuevo.** `Turn.source` (`TurnSource`) ya
distinguía canales de entrada (`app`/`manual`/`qr`/`web`) — `"phone"` es la
extensión natural, no un campo redundante. La única pieza que faltaba era
conectar ese canal a la creación manual de turnos.

**Gap 1 encontrado y corregido de paso:** `CreateManualTurnUseCase` hardcodeaba
`priority: "physical"` para *todo* turno manual, sin distinguir "está parado
en el mostrador" de "llamó por teléfono". Si se agregaba `source: "phone"`
sin corregir esto, cada reserva telefónica se habría colado en la cola por
delante de gente que ya estaba esperando o en camino. La corrección:
un turno `source: "phone"` recibe `priority: "registered"` — la misma que ya
usa cualquier turno remoto (app/QR/web) que todavía no confirmó nada.

**Gap 2, más sutil — orden dentro de la prioridad `"registered"`:**
corregir la prioridad no alcanza. El orden FIFO dentro de un mismo nivel de
prioridad se resolvía por `createdAt` — el momento en que el empleado tipeó
el turno, no el momento en que la persona va a llegar. Una reserva tomada a
las 9am para una llegada a las 15hs quedaba, aun con `priority: "registered"`
corregida, por delante de cualquiera que sacara turno en vivo a las 10, 11,
12, 13 o 14hs — le robaba el lugar a gente que iba a llegar antes en la
realidad. Ver `docs/epica-3-cola.md` para el detalle completo de la
corrección (`queueJoinedAt` separado de `createdAt`).

**Explícitamente fuera de alcance:** nada de horario/slot fijo (un sistema
real de turnos con calendario es un producto distinto, no un canal de
entrada a esta misma cola); nada de integración con WhatsApp Business API
(la reserva la toma una persona, no un bot). El "tiempo de gracia" si la
persona no aparece cuando le toca sigue resolviéndose a ojo con "Cancelar
turno" — no hay datos reales todavía para diseñar bien esa regla, y
`etaMinutes` (ver abajo) ya resuelve el problema de fondo (el orden) sin
necesitar una segunda acción de "confirmar que viene en camino".

### Contrato backend

```text
POST /api/queue/:queueId/turns/manual   turn:create_manual
```

Request body (todos los campos nuevos opcionales, compatible con el uso
existente de HU-4.3):

```json
{
  "guestName": "Juan Pérez",
  "phone": "+54 381 555-1234",
  "source": "phone",
  "etaMinutes": 20
}
```

`source` acepta `"manual"` (default, walk-in físico) o `"phone"` (reserva
remota). `phone` es opcional incluso con `source: "phone"` — el empleado
pudo haber tomado el llamado sin pedir el número. `etaMinutes` (0-1440,
opcional, default 0) es "¿en cuánto tiempo decís que llegás?", preguntado
en la misma llamada — se ignora por completo si `source` no es `"phone"`
(un walk-in ya está ahí).

Response `201`:

```json
{
  "turnId": "uuid",
  "queueId": "uuid",
  "displayNumber": "A-007",
  "guestName": "Juan Pérez",
  "phone": "+54 381 555-1234",
  "source": "phone",
  "position": 7
}
```

`GET /api/queue/:queueId/turns` (`GetQueueListUseCase`, listado en vivo del
panel) ahora también devuelve `phone` y `source` por turno — sin esto,
guardar el teléfono no le serviría de nada al empleado, que es literalmente
el motivo por el que se pidió el campo ("tenerlo a mano para volver a
llamar").

### Modelo y persistencia

Dos migraciones:

- `20260818000000_add_phone_reservation_channel`: agrega `"PHONE"` a
  `TurnSource` (mismo patrón que ganó `TurnStatus.REDIRECTED`, ver
  `docs/epica-3-cola.md`) y columna `phone` (nullable) en `turns`.
- `20260818010000_add_queue_joined_at`: agrega `Turn.queueJoinedAt`
  (`DateTime`, no nulo, backfillada con `createdAt` para filas existentes).
  Ver `docs/epica-3-cola.md` para el detalle completo de qué significa este
  campo y qué use cases/queries se migraron para usarlo en vez de
  `createdAt` a la hora de ordenar la cola.

### Reglas de negocio

1. `source: "manual"` (default) → `priority: "physical"` — sin cambios,
   walk-in físico sigue saltando delante de turnos remotos sin confirmar.
2. `source: "phone"` → `priority: "registered"` — no altera el orden de la
   cola frente a los demás turnos remotos.
3. `queueJoinedAt = createdAt + etaMinutes` (solo para `source: "phone"`;
   para todo lo demás, `queueJoinedAt === createdAt`). Es el campo que
   determina la posición real dentro de la cola — no `createdAt`.
4. `phone` no dispara ninguna automatización (nada de SMS/WhatsApp API) —
   es solo dato visible para el empleado.

### Cobertura

- `tests/unit/queue/CreateManualTurnUseCase.test.ts` (secciones *reserva por
  teléfono* — incluye el caso central: `source: "phone"` → `priority:
  "registered"`, no `"physical"` — y *etaMinutes y queueJoinedAt (fairness)*)
- `tests/unit/queue/GetQueueListUseCase.test.ts` (caso *phone y source en
  el listado en vivo*, y el caso de fairness end-to-end: una reserva
  telefónica con ETA largo no le gana la posición a alguien que se registra
  en vivo en el medio)

Validación manual: pendiente (piloto con negocios reales).

## Bugfix — el filtro de reservas futuras no era parejo entre métodos, sin comentario que lo explicara (2026-09-01)

Rama: `bugfix/ownership-operaciones-cola` (mismo trabajo que los bugfixes
anteriores de esta rama). Encontrado en la auditoría general del proyecto:
`findNextWaitingTurn` excluye una reserva telefónica cuyo `queueJoinedAt`
todavía no llegó (HU-4.5), pero `countWaitingAhead`/`findActiveByQueue` no
aplicaban ese mismo filtro — y el fake en memoria de los tests replicaba
exactamente la misma asimetría, así que ningún test podía marcarlo como
regresión.

### Investigación — ¿es un bug o es intencional?

Rastreando cada consumidor de los tres métodos, la asimetría resultó ser
**intencional y ya correcta en la práctica**, simplemente sin documentar:

- `findNextWaitingTurn` responde "¿a quién puedo llamar *ahora mismo*?" —
  ahí sí hay que excluir una reserva que aún no llegó a su ETA.
- `countWaitingAhead` responde "¿cuántos están *virtualmente* antes que yo
  en el orden de la cola?" (usado para la posición/estimación personal de
  un turno vía `resolveTurnWaitStatus`). Una reserva futura sigue
  reservando su lugar y va a ser atendida antes que cualquiera que se
  registre después — por eso sí debe contar. La comparación por
  `queueJoinedAt` ya evita, por sí sola, que una reserva futura infle la
  posición de alguien que ya está físicamente esperando (su
  `queueJoinedAt` siempre es menor al de cualquier reserva aún no vencida).
- `findActiveByQueue` es el listado completo (panel de empleado vía
  `GetQueueListUseCase`), no "quién es elegible ahora" — debe incluir las
  reservas futuras para que el empleado las vea venir. Quien necesite un
  agregado de "cuántos están físicamente presentes ahora" (como
  `GetQueueStatusUseCase.waitingCount`, ya lo hacía) debe filtrar por
  `queueJoinedAt <= now` él mismo, cosa que ese caso de uso ya hacía
  correctamente antes de esta auditoría — el hueco real era la falta de
  comentario/test que lo confirmara como decisión, no un bug de
  comportamiento.

### Fix

No se cambió comportamiento — se documentó la intención en `ITurnRepo.ts`
(comentario extendido en `countWaitingAhead`/`findActiveByQueue`,
replicado en `PostgresTurnRepo.ts` y en el fake de
`tests/helpers/queueFakes.ts`), y se agregaron los tests de regresión que
faltaban para que un cambio futuro que rompa esta garantía sí falle.

### Cobertura

- `tests/unit/queue/GetMyTurnUseCase.test.ts` (caso nuevo: una reserva
  telefónica con ETA de 6hs no infla la posición de un cliente que ya está
  en la fila)
- `tests/unit/queue/GetQueueListUseCase.test.ts` (caso nuevo: el
  `estimatedWaitMinutes` de un cliente presente es idéntico con o sin la
  reserva futura al lado, y la reserva futura muestra `waitingMinutes`
  negativo)

660 tests en verde (suite completa), `tsc --noEmit` limpio en `src` y en
tests.

## Bugfix — `PRIORITY_RANK` unificado, y un bug real que estaba escondido detrás de la duplicación (2026-09-01)

Rama: `bugfix/enforcement-limites-plan`. Encontrado en una segunda
auditoría general del proyecto: el objeto `{ arrived: 1, physical: 2,
in_transit: 3, registered: 4 }` (o su versión en mayúsculas para Prisma)
estaba copiado a mano 5 veces — dos dentro de `PostgresTurnRepo.ts`
(`findNextWaitingTurn`, `findActiveByQueue`) y tres en el fake de test
(`tests/helpers/queueFakes.ts`), más una sexta variante como array
(`PRIORITY_ORDER`) en `countWaitingAhead`. Exactamente el tipo de
divergencia silenciosa que ya había costado un bug real una vez (ver el
bugfix de reservas futuras, arriba).

### El bug que apareció al unificarlo

Al mover la lógica a un solo lugar, apareció uno nuevo: `toTurn` (y por
extensión `findActiveByQueue`/`findRecentCalls`) mapeaba el priority de
Postgres con `raw.priority.toLowerCase().replace("_", "-")` — convertía
`IN_TRANSIT` a `"in-transit"` (con guion), un valor que **el tipo
`TurnPriority` ni siquiera incluye** (es `"in_transit"`, con guion bajo).
El cast `as TurnPriority` lo dejaba pasar sin error de compilación. Ningún
test lo detectó nunca porque el fake en memoria trabaja directo con
objetos `Turn` de dominio — nunca pasa por esta conversión Postgres→dominio,
así que el mismo bug de "el fake no puede replicar un problema que solo
existe en el mapeo real" que ya había pasado una vez, volvió a pasar.

### Fix

- Nuevo `src/modules/queue/domain/turnPriority.ts`: `TURN_PRIORITY_ORDER`
  (el array canónico) y `turnPriorityRank()`, fuente única de verdad para
  el orden. Ambos `PostgresTurnRepo.ts` y `queueFakes.ts` lo importan;
  cada archivo mantiene un comparador local liviano (porque uno ordena
  filas crudas de Prisma y el otro objetos `Turn` de dominio — las formas
  de entrada difieren), pero el *dato* de la jerarquía vive en un solo
  lugar.
- `fromPrismaPriority()` (nuevo, en `PostgresTurnRepo.ts`) reemplaza el
  `.replace("_", "-")` roto — un `toLowerCase()` simple alcanza porque
  Prisma ya usa snake_case en mayúsculas (`IN_TRANSIT`) y el dominio usa
  snake_case en minúsculas (`in_transit`), sin ningún guion de por medio.
  `toPriorityEnum()` (la dirección inversa) tenía el mismo `.replace("-",
  "_")` de más — inofensivo en la práctica porque nunca había un guion que
  reemplazar, pero mismo malentendido, eliminado igual.
- `countWaitingAhead` deriva su `higherPriorities` de `TURN_PRIORITY_ORDER`
  en vez de mantener su propio array `PRIORITY_ORDER` — sexta copia
  eliminada de paso.

### Cobertura

- `tests/integration/PostgresTurnRepo.integration.test.ts` (nuevo — ver
  `docs/quality-and-testing.md`): el round-trip de las 4 prioridades
  contra Postgres real, incluido `in_transit`, es exactamente el test que
  hubiera detectado este bug antes de mergear.

718 tests en verde (suite default) + 9 en la suite de integración,
`tsc --noEmit` limpio en `src` y en tests.
