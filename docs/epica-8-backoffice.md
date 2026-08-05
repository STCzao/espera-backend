# Épica 8 - Backoffice Espera

## Resumen

Panel interno para que el equipo Espera gestione la plataforma: aprobación
comercial de cuentas y negocios, suspensión, métricas globales y gestión de
reportes. Cambio de decisión arquitectónica en backlog v2.4: deja de ser un
proyecto `.NET` separado (`espera-backoffice` + `espera-backoffice-api`) y
pasa a ser un módulo interno dentro de este mismo repo
(`espera-back`, Node.js/TypeScript), reutilizando el sistema de auth y roles
ya implementado (`super_admin`).

Alcance total: `22 pts` (7 historias).

Formato de referencia: `docs/story-documentation-standard.md`

## Estado general

- Estado: `completa` — las 7 historias están implementadas.
- Historias implementadas directamente en esta épica: `HU-8.1`, `HU-8.4`,
  `HU-8.5`, `HU-8.6`, `HU-8.7`.
- Ya resuelto por el refinamiento de aprobación en dos niveles (ver
  `docs/epica-2-5-cuentas-organizaciones.md`), antes de que existiera esta
  épica formalmente: `HU-8.2`, `HU-8.3`.

## Contratos principales de la épica

```text
POST /api/auth/login                                    (reusado — sin login propio de Backoffice)
GET   /api/organizations/pending                         platform:manage_approvals   → HU-8.2
PATCH /api/organizations/:organizationId/approve         platform:manage_approvals   → HU-8.3
PATCH /api/organizations/:organizationId/reject          platform:manage_approvals   → HU-8.3
GET   /api/business/pending                              platform:manage_approvals   → HU-8.2
PATCH /api/business/:businessId/approve                  platform:manage_approvals   → HU-8.3
PATCH /api/business/:businessId/reject                   platform:manage_approvals   → HU-8.3
PATCH /api/business/:businessId/suspend                  platform:manage_approvals   → HU-8.4
PATCH /api/business/:businessId/reactivate               platform:manage_approvals   → HU-8.4
GET   /api/business/platform/metrics                     platform:manage_approvals   → HU-8.5
POST  /api/reports                                        authenticate                → HU-8.6
GET   /api/reports                                        platform:manage_approvals   → HU-8.6
PATCH /api/reports/:reportId/resolve                      platform:manage_approvals   → HU-8.6
PATCH /api/reports/:reportId/dismiss                      platform:manage_approvals   → HU-8.6
PATCH /api/reports/:reportId/suspend                      platform:manage_approvals   → HU-8.6
GET   /api/business/:businessId/review                    platform:manage_approvals   → HU-8.7
PATCH /api/business/:businessId/approve  (body: { note? }) platform:manage_approvals   → HU-8.7 (extiende HU-8.3)
PATCH /api/organizations/:organizationId (body: categoryId) organization:edit          → HU-8.7 (extiende HU-2.5.5)
```

---

## HU-8.1 - Login con credenciales propias sin OAuth

Story points: `2`

Estado: `implementado`.

### Objetivo de producto

Que el equipo Espera pueda entrar al Backoffice con usuario y contraseña
propios, sin pasar por Google OAuth, y con bloqueo temporal tras intentos
fallidos.

### Criterios de aceptación

- Dado que ingreso usuario y contraseña válidos, cuando inicio sesión,
  entonces accedo con rol `super_admin` y recibo JWT.
- Dado que ingreso credenciales incorrectas, cuando intento iniciar sesión,
  entonces veo error genérico sin especificar cuál campo es incorrecto.
- Dado que hay 5 intentos fallidos, entonces la cuenta se bloquea
  temporalmente por 15 minutos.

### Decisión de implementación

**No hay un sistema de login separado para Backoffice.** Reutiliza
`POST /api/auth/login` (mismo JWT, mismo `middleware/authenticate.ts`) —
coherente con la nota de arquitectura de v2.4 ("reduce la complejidad de
infraestructura... reutilizar el sistema de roles ya implementado"). Un
usuario con `role: super_admin` ya tiene acceso a los endpoints protegidos
con `authorize("platform:manage_approvals")` sin ningún flujo de
autenticación adicional.

### Bootstrap del primer super_admin

No existe registro público para `super_admin` (por diseño — "credenciales
creadas internamente por el equipo"). Se crea con un script one-off:

```
npm run create:super-admin -- <email> <password> <firstName> <lastName>
```

`src/scripts/create-super-admin.ts` — idempotente: si el email ya existe,
promueve ese usuario a `super_admin` en vez de fallar (mismo patrón que
`scripts/backfill-queues.ts`). Hashea la contraseña con `bcrypt` (12 rounds,
igual que `RegisterUseCase`).

### Bloqueo de 15 minutos — diferenciado del login normal

`middleware`/`LoginUseCase` ya tenía bloqueo tras 5 intentos fallidos, pero
de **5 minutos** (HU-1.3, para usuarios normales). HU-8.1 pide **15
minutos** específicamente para cuentas de Backoffice.

`loginAttemptTracker.recordFailedLoginAttempt` ahora acepta una duración de
bloqueo opcional (`SUPER_ADMIN_BLOCK_DURATION_SECONDS = 15 * 60`,
exportada). `LoginUseCase` la pasa cuando el usuario encontrado por email
tiene `role === "super_admin"` — solo es posible diferenciar el rol en la
rama de "contraseña incorrecta" (el usuario ya se buscó por email en ese
punto); si el email ni siquiera existe, se usa el bloqueo genérico de 5
minutos (no se puede saber el rol de una cuenta que no existe, y no
conviene filtrar esa información).

El mensaje de error genérico dejó de mencionar "5 minutes" en duro (ya no es
siempre cierto) — ahora dice "Please try again later.".

### Reglas de negocio

1. Sin OAuth Google para `super_admin` — solo `email` + `password`.
2. El bloqueo se seguimiento por email (`loginAttemptTracker`), igual que
   para el resto de los usuarios — Redis con fallback en memoria.
3. `User.approvalStatus` de un `super_admin` creado por el script queda
   `approved` e `isEmailVerified: true` — no pasa por el flujo de
   verificación de email normal.

### Cobertura

- `tests/unit/auth/LoginUseCase.test.ts` (caso de bloqueo de 15 min para
  `super_admin`)

Validación manual: script corrido contra Postgres local, login real
verificado con `POST /api/auth/login` — el JWT devuelto trae
`role: "super_admin"`.

---

## HU-8.2 y HU-8.3 - Listas pendientes y aprobación en dos niveles

Ya implementadas — construidas como parte del refinamiento de
`bugfix/two-level-approval` (E2.5) **antes** de que este documento
existiera, porque HU-8.2/8.3 son inseparables del modelo de aprobación de
`Organization`/`Business` que introdujo ese refinamiento.

Contrato completo, reglas de negocio, códigos de error y cobertura de tests:
ver `docs/epica-2-5-cuentas-organizaciones.md`, sección *Refinamiento —
Aprobación comercial en dos niveles*.

---

## HU-8.4 - Suspender o reactivar un negocio activo

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Que el equipo Espera pueda suspender un negocio operativo (ej. fraude,
incumplimiento) cortando su operación de inmediato, y reactivarlo más
adelante sin perder el historial de por qué fue suspendido.

### Criterios de aceptación

- Dado que suspendo un negocio, entonces todos sus turnos activos se
  cancelan y el negocio no puede operar hasta ser reactivado.
- Dado que suspendo un negocio, entonces sus empleados pierden acceso al
  panel inmediatamente (sesiones invalidadas).
- Dado que reactivo un negocio, entonces puede volver a operar normalmente y
  sus empleados recuperan acceso.
- Dado que suspendo o reactivo, entonces queda registrado el motivo, quién
  lo hizo y cuándo.

### Contrato backend

```text
PATCH /api/business/:businessId/suspend      platform:manage_approvals
PATCH /api/business/:businessId/reactivate   platform:manage_approvals
```

Suspender — body: `{ "reason": string }`. Reactivar — sin body.

Ambos devuelven el `Business` actualizado.

### Implementación backend

`BusinessStatus.SUSPENDED` ya existía en el enum desde
`bugfix/pre-e3-schema-debt`, pero ningún use case lo usaba. Migración
`20260801000000_business_suspension` agrega los campos de auditoría:
`suspendedByUserId`, `suspendedAt`, `suspensionReason`,
`reactivatedByUserId`, `reactivatedAt` (mismo patrón que
`approvedByUserId`/`rejectedReason` del refinamiento de aprobación en dos
niveles).

`SuspendBusinessUseCase`:

1. Requiere `status === "approved"` — no se puede suspender un negocio
   `pending`/`rejected` (nunca operó) ni uno ya `suspended` (`409
   BUSINESS_CANNOT_BE_SUSPENDED`).
2. Marca `status: "suspended"` con auditoría.
3. Invalida sesiones: junta `ownerUserId` + todos los
   `BusinessEmployee` con `status: "active"` de ese negocio
   (`IBusinessEmployeeRepo.findByBusinessId`), y llama
   `IRefreshSessionRepo.revokeAllByUserId` para cada uno — mismo mecanismo
   que ya usaba `RevokeBusinessEmployeeUseCase` para un empleado individual.
4. Cancela turnos activos: recorre todas las `Queue` del negocio
   (`IQueueRepo.findByBusinessId`), y para cada una cancela sus turnos
   activos (`waiting`/`called`/`attending`/`redirected`), emitiendo
   `queue:update` por turno — mismo evento que
   `CancelTurnByEmployeeUseCase`. Sin push real (Épica 5 no implementada
   todavía); el criterio de "push de cancelación" queda cubierto solo por
   el evento de Socket.IO por ahora.

`ReactivateBusinessUseCase`:

1. Requiere `status === "suspended"` (`409 BUSINESS_NOT_SUSPENDED`).
2. Marca `status: "approved"` con auditoría de reactivación.
3. **No** restaura sesiones ni reasigna nada — los empleados y el owner
   simplemente vuelven a loguearse normalmente. Suspender invalidó sesiones,
   no bloqueó las cuentas.
4. Conserva `suspendedAt`/`suspensionReason` como historial — no se
   sobrescriben al reactivar, quedan como registro de auditoría.

### `business.routes.ts` pasó a ser una factory

Para que `SuspendBusinessUseCase` pueda emitir `queue:update` real, el
router de `business` dejó de exportar una instancia fija (`businessRouter`)
y pasó a `createBusinessRouter(emitter)`, igual que ya hacía
`createQueueRouter` — `app.ts` ahora le pasa el mismo `SocketIOEmitter` a
ambos. `BusinessController` ganó un nuevo primer parámetro de constructor
`emitter: SocketIOEmitter | null`, usado únicamente para construir el
default de `suspendBusinessUseCase`.

### Reglas de negocio

1. Suspender es solo posible desde `approved` (negocio realmente operando).
2. Reactivar solo desde `suspended`.
3. La cancelación de turnos no distingue prioridad ni estado — cualquier
   turno activo se cancela, sin excepción, al suspender.
4. Revocar la sesión de un empleado ya `revoked` es un no-op seguro (el
   filtro `status === "active"` los excluye).

### Cobertura

- `tests/unit/business/SuspendBusinessUseCase.test.ts`
- `tests/unit/business/ReactivateBusinessUseCase.test.ts`

Validación manual: pendiente (requiere un negocio aprobado con empleados y
turnos activos reales en la base local).

## HU-8.5 - Métricas globales de la plataforma

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Que el equipo Espera vea, desde un único dashboard, el estado agregado de
toda la plataforma (no de un negocio puntual): cuántos negocios están
activos, cuántos usuarios hay registrados, cuánta actividad hubo hoy/esta
semana, qué tan bien se están resolviendo los turnos, y qué negocios/rubros
concentran más demanda.

### Criterios de aceptación

- Dado que accedo al dashboard, entonces veo: total de negocios activos,
  total de usuarios registrados, turnos del día, turnos de la semana y tasa
  de cancelación.
- Dado que selecciono un rango de fechas, entonces las métricas se
  recalculan para ese período.
- Dado que veo las métricas, entonces puedo identificar los negocios más
  activos y los rubros con más demanda.

### Contrato backend

```text
GET /api/business/platform/metrics?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD   platform:manage_approvals
```

`fromDate`/`toDate` son opcionales — sin ellos, el rango por defecto son los
últimos 7 días (mismo criterio que `getAverageServiceMinutes` en Épica 3).

Response:

```json
{
  "totalActiveBusinesses": 12,
  "totalRegisteredUsers": 340,
  "turnsToday": 58,
  "turnsThisWeek": 401,
  "range": {
    "fromDate": "2026-07-30",
    "toDate": "2026-08-05",
    "totalTurns": 401,
    "cancelledTurns": 37,
    "cancellationRate": 12.4,
    "topBusinesses": [
      { "businessId": "...", "businessName": "Cafe Espera", "turnCount": 80 }
    ],
    "topCategories": [
      { "categoryId": "...", "categoryName": "Cafetería", "turnCount": 210 }
    ]
  }
}
```

### Implementación backend

`GetPlatformMetricsUseCase` vive en `business/application/` (no se creó un
módulo `platform`/`backoffice` nuevo) porque es consistente con otros use
cases cross-módulo que ya viven ahí (`ApproveBusinessUseCase`,
`SuspendBusinessUseCase`, `ListPendingBusinessesUseCase`). Reutiliza:

- `IUserRepo.count()` — nuevo, cuenta total de usuarios sin filtrar por rol.
- `IBusinessRepo.countByStatus("approved")` — nuevo, cuenta negocios activos.
- `ITurnRepo.getPlatformTurnCounts(fromDate, toDate)` — nuevo, cuenta
  `completed`/`cancelled` en un rango (para `cancellationRate`, con el mismo
  criterio que `GetQueueMetricsUseCase`: `total = completed + cancelled`,
  excluye turnos aún activos).
- `ITurnRepo.getTurnCountsByBusiness(fromDate, toDate)` — nuevo,
  `groupBy businessId` sobre **todos** los turnos del rango (sin importar
  estado) vía Prisma. Se reusa para tres cosas distintas: `turnsToday`
  (llamado con `today, today` y sumado), `turnsThisWeek` (llamado con los
  últimos 7 días y sumado), y `range.topBusinesses` (top 5 de las filas
  ordenadas).

**"Rubros con más demanda" — join en la capa de aplicación, no en SQL.**
`Turn` solo tiene `businessId`, no `categoryId` — y un join SQL directo
entre las tablas de `queue` y `business` violaría el límite entre módulos.
En cambio, el use case resuelve `businessId → categoryId` llamando
`businessRepo.findById()` por cada negocio con turnos en el rango, y agrega
los conteos en memoria por `categoryId` antes de resolver los nombres con
`categoryRepo.findById()`. Aceptable para un endpoint de solo lectura de
Backoffice (no hot path); no se optimizó con una query de agregación
cross-módulo.

**`turnsToday`/`turnsThisWeek` son siempre relativos al día real, no al
rango seleccionado.** El AC pide ambas cosas: cifras fijas de "hoy"/"esta
semana" siempre visibles, y un rango seleccionable aparte que recalcula
`cancellationRate`/`topBusinesses`/`topCategories`. Por eso son dos secciones
separadas en la response en vez de una sola.

### Reglas de negocio

1. `totalActiveBusinesses` cuenta solo `status: "approved"` — no incluye
   `pending`/`rejected`/`suspended`.
2. `cancellationRate` se redondea a 1 decimal; es `0` cuando no hay turnos
   `completed`/`cancelled` en el rango (evita división por cero).
3. Sin rango explícito, el default es 7 días (hoy inclusive).
4. `topBusinesses`/`topCategories` se limitan a 5 resultados cada uno,
   ordenados por `turnCount` descendente.

### Cobertura

- `tests/unit/business/GetPlatformMetricsUseCase.test.ts`

Validación manual: pendiente (requiere datos reales de negocios/turnos en
la base local para verificar los agregados).

## HU-8.6 - Ver y gestionar reportes

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Que el equipo Espera pueda ver los usuarios o negocios que fueron
reportados, y decidir qué hacer con cada reporte: resolverlo sin más acción,
suspender al reportado, o descartarlo por infundado.

### Criterios de aceptación

- Dado que un usuario o negocio recibe un reporte, entonces aparece en la
  lista de reportados con el motivo y quien reportó.
- Dado que reviso un reporte, entonces puedo marcarlo como resuelto,
  suspender al reportado o descartarlo con nota interna.
- Dado que descarto un reporte, entonces queda registrado en el historial
  para evitar spam de reportes del mismo origen.

### Gaps encontrados antes de implementar

Dos huecos reales en el backlog, resueltos con el usuario antes de tocar el
schema (no eran parte del scope original de HU-8.6 tal como está redactada,
pero sin resolverlos la historia no es usable):

1. **Ninguna HU crea un reporte.** Revisado el backlog completo (E1-E8): no
   existe "Como usuario, quiero reportar un negocio" ni equivalente. HU-8.6
   asume que los reportes "ya existen". Decisión: agregar un endpoint mínimo
   de creación (`POST /api/reports`, cualquier usuario autenticado) como
   parte del alcance de esta historia.
2. **No había mecanismo de suspensión para `User`.** Solo `Business` tenía
   uno (`SuspendBusinessUseCase`, HU-8.4). Decisión: agregar un bloqueo
   simple a `User` (`isBlocked` + auditoría), mismo patrón pero sin cascada
   de turnos/empleados porque un usuario no tiene ese estado.

### Contrato backend

```text
POST  /api/reports                        authenticate                  → crear reporte
GET   /api/reports?status=&reportedType=  platform:manage_approvals     → listar (filtros opcionales)
PATCH /api/reports/:reportId/resolve      platform:manage_approvals     body: { note? }
PATCH /api/reports/:reportId/dismiss      platform:manage_approvals     body: { note: string }  (obligatoria)
PATCH /api/reports/:reportId/suspend      platform:manage_approvals     body: { note? }
```

Los tres endpoints de revisión devuelven el `Report` actualizado.

### Modelo de datos

Nuevo módulo `report` (no encaja en `auth` ni `business` — es un concepto
que cruza ambos, mismo criterio que llevó a `organization` a ser su propio
módulo). Migración `20260805000000_reports`.

```
Report
  id
  reportedType: "user" | "business"   (polimórfico — sin FK directa, cross-módulo)
  reportedId: string
  reason: string
  reportedByUserId: string
  status: "pending" | "resolved" | "suspended" | "dismissed"
  internalNote?: string
  reviewedByUserId?: string
  reviewedAt?: Date
  createdAt / updatedAt
```

La misma migración agrega a `User`: `isBlocked` (default `false`),
`blockedByUserId`, `blockedAt`, `blockReason` — mismo patrón de auditoría que
`Business.suspendedBy/At/Reason` (HU-8.4).

### Implementación backend

- `CreateReportUseCase` — valida que la entidad reportada exista
  (`IUserRepo`/`IBusinessRepo` según `reportedType`) y rechaza
  auto-reportarse (`reportedId === reportedByUserId` con `reportedType:
  "user"` → `400 CANNOT_REPORT_SELF`).
- `ListReportsUseCase` — filtros opcionales por `status` y `reportedType`.
- `ResolveReportUseCase` / `DismissReportUseCase` — solo operan sobre un
  reporte `pending` (`409 REPORT_NOT_PENDING` si no). `dismiss` exige nota
  (`note` requerida, min 1 char); `resolve` la deja opcional.
- `SuspendReportedUseCase` — el más complejo: delega en
  `SuspendBusinessUseCase` (reusado tal cual, vía `business/public-api`) si
  `reportedType: "business"`, o en el nuevo `BlockUserUseCase` (vía
  `auth/public-api`) si `reportedType: "user"`, y **solo si esa suspensión
  realmente ocurre** marca el reporte como `suspended` — si el target no
  puede suspenderse ahora mismo (ej. negocio todavía `pending`), la acción
  completa falla y el reporte queda `pending`, para no mostrarle al revisor
  un estado que no pasó de verdad.
- `BlockUserUseCase` (nuevo, en `auth/application`) — marca
  `isBlocked: true` con auditoría y revoca todas las sesiones activas
  (`IRefreshSessionRepo.revokeAllByUserId`), igual que
  `SuspendBusinessUseCase` pero sin cascada de turnos/empleados.
- `LoginUseCase` — rechaza el login si `user.isBlocked`
  (`403 ACCOUNT_BLOCKED`), mismo lugar que el chequeo de `ACCOUNT_REJECTED`.

### Reglas de negocio

1. Un reporte solo puede pasar de `pending` a un estado terminal una vez —
   no se puede revisar dos veces.
2. Los reportes descartados no se borran — quedan con `status: dismissed`,
   consultables por `reportedByUserId` (`GET /api/reports` sin filtro de
   estado, o `IReportRepo.findByReportedByUserId`) para detectar spam de
   origen repetido, tal como pide el AC.
3. No se puede reportar a uno mismo.
4. Suspender vía reporte reutiliza las reglas de negocio existentes de cada
   entidad (ej. `Business` solo se puede suspender si está `approved`) — no
   las duplica ni las relaja.

### Cobertura

- `tests/unit/report/CreateReportUseCase.test.ts`
- `tests/unit/report/ListReportsUseCase.test.ts`
- `tests/unit/report/ResolveReportUseCase.test.ts`
- `tests/unit/report/DismissReportUseCase.test.ts`
- `tests/unit/report/SuspendReportedUseCase.test.ts`
- `tests/unit/auth/BlockUserUseCase.test.ts`
- `tests/unit/auth/LoginUseCase.test.ts` (caso `ACCOUNT_BLOCKED`)

Validación manual: pendiente (requiere probar el flujo completo
crear→listar→revisar contra Postgres local).

## HU-8.7 - Alerta de coherencia categoría/legalId al revisar un Business

Story points: `3`

Estado: `implementado`.

### Objetivo de producto

Que el equipo Espera, al revisar un `Business` pendiente, vea de un vistazo
si algo no coincide con la `Organization` a la que pertenece — categoría
declarada distinta, o falta el `legalId` — sin que eso bloquee la
aprobación: es una alerta informativa, la decisión sigue siendo manual.

### Criterios de aceptación

- Dado que reviso un Business pendiente, entonces veo junto a sus datos la
  categoría y `legalId` de su Organization para comparar.
- Dado que la categoría del Business no coincide con el rubro declarado de
  la Organization, entonces veo una alerta visual antes de aprobar (no
  bloqueante, solo informativa).
- Dado que la Organization no tiene `legalId` cargado, entonces veo la
  advertencia de dato faltante en la misma vista de revisión.
- Dado que apruebo un Business pese a la alerta de coherencia, entonces el
  motivo de aprobación queda registrado junto con la alerta que estaba
  presente en ese momento.

### Gap resuelto antes de implementar

El AC pedía comparar contra "el rubro declarado de la Organization", pero
`Organization` no tenía ningún campo de categoría propio (solo `legalId`,
de HU-2.5.5). Decisión tomada con el usuario: agregar
`Organization.categoryId` opcional (mismo patrón que `legalId` — vacío al
alta, editable después vía `UpdateOrganizationUseCase`), aceptando que para
cuentas Premium con `Business` de rubros distintos bajo la misma
Organization esto puede generar algún falso positivo — tolerable porque la
alerta es solo informativa, nunca bloqueante.

### Contrato backend

```text
GET   /api/business/:businessId/review                     platform:manage_approvals
PATCH /api/business/:businessId/approve   body: { note? }   platform:manage_approvals   (ya existía, HU-8.3)
PATCH /api/organizations/:organizationId  body: { categoryId? } organization:edit        (ya existía, HU-2.5.5)
```

`GET .../review` responde:

```json
{
  "business": { "...": "Business completo" },
  "organization": { "id": "...", "name": "...", "legalId": "30-...", "categoryId": "..." },
  "alerts": ["CATEGORY_MISMATCH", "MISSING_LEGAL_ID"]
}
```

`alerts` es un subconjunto de `["CATEGORY_MISMATCH", "MISSING_LEGAL_ID"]`,
vacío si no hay nada que señalar.

### Modelo de datos

Migración `20260806000000_business_org_coherence`:

- `Organization.categoryId` (opcional, FK a `BusinessCategory`, `ON DELETE
  SET NULL`) — el "rubro declarado" contra el que se compara.
- `Business.approvalNote` (opcional) y `Business.approvalAlertsSnapshot`
  (`String[]`, default `[]`) — el motivo dado al aprobar y qué alertas
  estaban presentes en ese momento, congelado como snapshot (si luego la
  Organization carga su `legalId`, el snapshot de una aprobación previa no
  cambia retroactivamente).

### Implementación backend

- `computeBusinessCoherenceAlerts(business, organization)` — función pura
  en `business/application/businessCoherence.ts`, reusada por
  `GetBusinessReviewDetailUseCase` y `ApproveBusinessUseCase` para no
  duplicar la regla. Un `Organization.categoryId` vacío **no** genera
  `CATEGORY_MISMATCH` — no hay nada declarado con qué comparar todavía; solo
  se alerta cuando hay un valor declarado y no coincide.
- `GetBusinessReviewDetailUseCase` (nuevo) — trae el `Business`, su
  `Organization` (id/name/legalId/categoryId) y las alertas calculadas, para
  la vista de revisión.
- `ApproveBusinessUseCase` (extendido) — acepta `note` opcional. Si
  `computeBusinessCoherenceAlerts` devuelve alguna alerta y no se manda
  `note`, rechaza con `400 APPROVAL_NOTE_REQUIRED`: aprobar pese a una
  alerta exige justificarlo por escrito. Al aprobar, guarda `approvalNote` y
  `approvalAlertsSnapshot` (este último se guarda siempre, incluso vacío,
  como registro de que en ese momento no había nada que señalar).
- `UpdateOrganizationUseCase` (extendido) — ahora también acepta
  `categoryId` opcional, mismo patrón editable-después que `legalId`.

### Reglas de negocio

1. La alerta es puramente informativa — nunca bloquea `ApproveBusinessUseCase`
   más allá de exigir la nota explicativa.
2. Sin `Organization.categoryId` declarado, no hay alerta de categoría (no
   se compara contra la ausencia de dato — esa ausencia no es en sí misma
   sospechosa, a diferencia de `legalId` faltante que sí se señala siempre).
3. El snapshot de alertas queda fijo en el momento de la aprobación — no se
   recalcula después.

### Cobertura

- `tests/unit/business/businessCoherence.test.ts`
- `tests/unit/business/GetBusinessReviewDetailUseCase.test.ts`
- `tests/unit/business/ApproveBusinessUseCase.test.ts` (bloque "coherencia
  con la Organization")
- `tests/unit/organization/UpdateOrganizationUseCase.test.ts` (caso
  `categoryId`)

Validación manual: pendiente (requiere una Organization con `categoryId`
declarado distinto al de su Business contra Postgres local).

---

## Observaciones técnicas

- Ningún endpoint de esta épica requiere infraestructura nueva — todos
  reusan Express, Postgres, y el sistema de auth existente. No hay
  deployment ni proyecto separado que coordinar (ese era el costo que
  motivó el cambio de decisión de v2.4).
- `platform:manage_approvals` (agregado en el refinamiento de E2.5) es el
  permiso base para todo lo que agrega esta épica; HU-8.4/8.5/8.6 deberían
  reusarlo salvo que se justifique un permiso más granular.
