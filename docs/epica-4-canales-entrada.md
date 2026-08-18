# Épica 4 - Canales de Entrada

## Resumen

Cubre las distintas formas en que un turno puede entrar a la cola, además del
flujo principal de la app (Épica 3): escanear el QR del negocio, sacar turno
sin tener la app instalada, agregar un turno manual desde el panel, e
integrar un dispensador físico numerado.

Alcance total: `18 pts` (4 historias).

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

## Contratos principales de la épica

```text
GET  /api/qr/:token                     público            → HU-4.1 (ya existía, Épica 2)
POST /api/queue/:queueId/turns/manual   turn:create_manual → HU-4.3 (ya existía, Épica 3)
POST /api/queue/guest-turns             público, rate-limit → HU-4.2 (nuevo)
GET  /api/queue/guest-turns/:turnId     público            → HU-4.2 (nuevo)
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
`physical`, `source: "manual"`, compite en la misma cola unificada que los
turnos virtuales.

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
pendiente de esta épica.

### Cobertura

N/A — no implementada.
