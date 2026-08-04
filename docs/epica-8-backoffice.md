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
- Historias implementadas: `HU-8.1`.
- Ya resuelto por el refinamiento de aprobación en dos niveles (ver
  `docs/epica-2-5-cuentas-organizaciones.md`), antes de que existiera esta
  épica formalmente: `HU-8.2`, `HU-8.3`.
- Pendientes: `HU-8.4`, `HU-8.5`, `HU-8.6`. `HU-8.7` tiene un gap de modelo
  sin resolver (ver esa sección).

## Contratos principales de la épica

```text
POST /api/auth/login                                    (reusado — sin login propio de Backoffice)
GET   /api/organizations/pending                         platform:manage_approvals   → HU-8.2
PATCH /api/organizations/:organizationId/approve         platform:manage_approvals   → HU-8.3
PATCH /api/organizations/:organizationId/reject          platform:manage_approvals   → HU-8.3
GET   /api/business/pending                              platform:manage_approvals   → HU-8.2
PATCH /api/business/:businessId/approve                  platform:manage_approvals   → HU-8.3
PATCH /api/business/:businessId/reject                   platform:manage_approvals   → HU-8.3
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

Estado: `no implementado`.

`BusinessStatus.SUSPENDED` existe en el enum desde HU-2.5-adyacente
(`bugfix/pre-e3-schema-debt`) pero ningún use case lo usa todavía. Falta:

- `SuspendBusinessUseCase` / `ReactivateBusinessUseCase`.
- Invalidar sesiones activas de los empleados del negocio al suspender
  (`RefreshSession` — mismo patrón que `RevokeBusinessEmployeeUseCase`).
- Cancelar turnos activos del negocio al suspender (sin push real todavía,
  Épica 5 no implementada — al menos marcar `cancelled` y emitir
  `queue:update`).
- Registrar motivo, quién y cuándo (mismo patrón de auditoría que
  `approvedByUserId`/`rejectedReason` en Organization/Business).

## HU-8.5 - Métricas globales de la plataforma

Story points: `3`

Estado: `no implementado`.

`GetQueueMetricsUseCase` (Épica 3) da métricas por cola/día — HU-8.5 pide
agregado de toda la plataforma (negocios activos, usuarios registrados,
turnos del día/semana, tasa de cancelación, negocios más activos), con
rango de fechas. No hay overlap directo reusable; es un use case nuevo que
agrega sobre `Business`, `User` y `Turn` sin acotar a una `Queue`.

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
