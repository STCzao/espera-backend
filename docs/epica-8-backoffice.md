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

- Estado: `en progreso`.
- Historias implementadas: `HU-8.1`, `HU-8.4`, `HU-8.5`.
- Ya resuelto por el refinamiento de aprobación en dos niveles (ver
  `docs/epica-2-5-cuentas-organizaciones.md`), antes de que existiera esta
  épica formalmente: `HU-8.2`, `HU-8.3`.
- Pendientes: `HU-8.6`. `HU-8.7` tiene un gap de modelo sin resolver (ver esa
  sección).

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

Estado: `no implementado`.

No existe ninguna entidad de reporte en el schema. Es la pieza más grande
de esta épica sin nada para reusar — necesita modelo de datos nuevo
(`Report`: quién reporta, qué/a quién, motivo, estado, resolución).

## HU-8.7 - Alerta de coherencia categoría/legalId al revisar un Business

Story points: `3`

Estado: `bloqueado por gap de modelo — no implementado`.

El criterio de aceptación pide comparar la categoría del `Business` contra
"el rubro declarado de la `Organization`" — pero `Organization` no tiene
ningún campo de categoría/rubro propio (solo se agregó `legalId` en
HU-2.5.5). La alerta de `legalId` faltante sí es implementable ya
(`Organization.legalId == null`), pero la de categoría no, hasta resolver
esto:

**Decisión pendiente (no tomada)**: agregar `Organization.categoryId`
(mismo patrón que `legalId` — opcional, editable después) para poder
comparar de verdad, según lo acordado. Falta implementar.

---

## Observaciones técnicas

- Ningún endpoint de esta épica requiere infraestructura nueva — todos
  reusan Express, Postgres, y el sistema de auth existente. No hay
  deployment ni proyecto separado que coordinar (ese era el costo que
  motivó el cambio de decisión de v2.4).
- `platform:manage_approvals` (agregado en el refinamiento de E2.5) es el
  permiso base para todo lo que agrega esta épica; HU-8.4/8.5/8.6 deberían
  reusarlo salvo que se justifique un permiso más granular.
