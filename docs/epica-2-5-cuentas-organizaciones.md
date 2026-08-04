# Épica 2.5 - Cuentas y Organizaciones

## Resumen

La Épica 2.5 introduce el modelo de cuentas multi-sucursal sin romper lo ya
implementado en Épica 1 y Épica 2. Las historias están redactadas de cara al
equipo de desarrollo (migración estructural del dominio), no al usuario
final. Bloquea la Fase 2 (Queue): la Épica 3 opera sobre `Business`/`Queue`
y necesita conocer cuántas filas y sucursales habilita el plan.

Alcance total estimado: `10 pts` (backlog v2.4 agregó `HU-2.5.5`, 1 pt).

Formato de referencia:

- `docs/story-documentation-standard.md`

## Estado general

- Estado: `implementado` en backend.
- Historias implementadas: `HU-2.5.1`, `HU-2.5.2`, `HU-2.5.3`, `HU-2.5.4`,
  `HU-2.5.5`.
- Resuelto (backlog v2.4): dónde vive la aprobación comercial — **en dos
  niveles independientes**, `Organization` y `Business` por separado (ver
  refinamiento al final de este documento).
- Sigue fuera de alcance, documentado explícitamente en el backlog: la
  migración completa del middleware RBAC (`authorize`) al rol efectivo de
  `Membership`.

## Modelo de datos

| Concepto       | Definición                                                  |
| -------------- | ------------------------------------------------------------ |
| `Business`     | Sucursal física (no una empresa). Ya existía desde Épica 2.  |
| `Organization` | La "cuenta". Agrupa N `Business` de un mismo titular.        |
| `Subscription` | Vive a nivel `Organization`. Define el plan (Basic/Pro/Premium). |
| `Membership`   | Vincula un usuario con una `Organization` y le asigna un rol por vínculo. |

Grilla de planes (`PLAN_LIMITS`, única fuente de verdad en
`src/modules/organization/domain/PlanLimits.ts`):

| Plan    | Negocios | Filas por negocio |
| ------- | -------- | ------------------ |
| Basic   | 1        | 1                   |
| Pro     | 1        | Varias              |
| Premium | Varios   | Varias cada uno     |

## Contratos principales de la épica

`HU-2.5.1` a `HU-2.5.4` no exponen ningún endpoint HTTP — están redactadas
para el equipo de desarrollo y se consumen internamente desde `business/` y
`auth/` vía `@modules/organization/public-api`, igual que `business/` ya
consume `@modules/auth/public-api`.

El refinamiento *Aprobación en dos niveles* (ver abajo) sí agrega endpoints
HTTP reales — es la primera vez que `organization/` tiene su propia capa
`interfaces/`. Contrato completo en esa sección.

## HU-2.5.1 - Introducir el modelo Organization sin romper los Business existentes

Story points: `3`

Estado: `implementado`.

Como equipo de desarrollo, quiero introducir el modelo `Organization` sin
romper los `Business` existentes.

### Criterios de Aceptación

- Dado que existe el modelo actual de `Business`, cuando se aplica la
  migración, entonces se crea la tabla `organizations` y cada `Business`
  existente queda asociado a una `Organization` propia (backfill 1:1) sin
  pérdida de datos.
- Dado que un `Business` ya registrado, cuando se ejecuta la migración,
  entonces obtiene una FK `organizationId` no nula apuntando a su
  `Organization` generada automáticamente.
- Dado que el código de Épica 1 y Épica 2 sigue corriendo, cuando se
  despliega el cambio, entonces los endpoints existentes de registro y
  configuración de negocio siguen funcionando sin cambios de contrato.
- Dado que se revierte la migración, entonces el sistema vuelve al estado
  anterior sin `organizations` y sin romper los `Business` existentes.

### Implementación backend

Migración `prisma/migrations/20260627100000_add_organizations_memberships_subscriptions`:

- Crea `organizations`, `subscriptions`, `memberships` y los enums
  `MembershipRole` (`ADMIN`, `EMPLOYEE`) y `SubscriptionPlan` (`BASIC`,
  `PRO`, `PREMIUM`).
- Agrega `businesses.organizationId` como columna nullable, hace el backfill
  con SQL plano dentro de la misma migración, y recién al final la vuelve
  `NOT NULL` con su FK.
- El backfill crea una `Organization` por cada `Business` existente
  reutilizando el mismo `id` del `Business` como `id` de la `Organization`
  (la tabla está vacía, no hay colisión posible), evitando así tener que
  reasociar filas por columnas no únicas como `name`.

Reversibilidad: Prisma no genera `down.sql` en este repo (ningún migration
anterior lo tiene). El rollback manual equivalente queda documentado como
comentario al final del propio `migration.sql`.

`prisma/schema.prisma` agrega los modelos `Organization`, `Subscription`,
`Membership` y la FK `Business.organizationId`.

Creación transparente para cuentas nuevas: `CreateOrganizationForOwnerUseCase`
(`src/modules/organization/application/CreateOrganizationForOwnerUseCase.ts`)
resuelve o crea la `Organization` de un owner. Si el owner ya tiene una
`Membership` con rol `admin` (cuenta existente o backfill), la reutiliza; si
no, crea `Organization` + `Subscription` `basic` + `Membership` `admin` en
un solo paso. Está conectado en los tres flujos que crean un `Business`:

- `RegisterBusinessUseCase` (`business/`, `POST /api/business`).
- `RegisterBusinessAccountUseCase` (`auth/`, `POST /api/auth/register-business`).
- `RegisterBusinessWithGoogleUseCase` (`auth/`, `POST /api/auth/register-business/google`).

### Cobertura

- `tests/unit/organization/CreateOrganizationForOwnerUseCase.test.ts`
- `tests/unit/business/RegisterBusinessUseCase.test.ts`
- `tests/unit/auth/RegisterBusinessAccountUseCase.test.ts`
- `tests/unit/auth/RegisterBusinessWithGoogleUseCase.test.ts`

Cobertura actual:

- creación de `Organization` + `Subscription basic` + `Membership admin`
  para un owner sin cuenta previa
- reutilización de la `Organization` existente cuando el owner ya tiene
  `Membership admin`
- los tres flujos de registro de negocio persisten `organizationId` en el
  `Business` creado

Validación manual:

- migración aplicada contra la base real (Render Postgres) con
  `npx prisma migrate deploy`; verificado que cada `Business` preexistente
  quedó con exactamente una `Organization`, una `Subscription basic` y una
  `Membership admin`.

## HU-2.5.2 - Introducir Membership para vincular usuarios con organizaciones y su rol

Story points: `2`

Estado: `implementado`.

Como equipo de desarrollo, quiero introducir `Membership` para vincular
usuarios con organizaciones y su rol.

### Criterios de Aceptación

- Dado que un usuario administra un negocio hoy, cuando se aplica la
  migración, entonces se crea un registro en `memberships` (`userId`,
  `organizationId`, `role`) que refleja su acceso actual.
- Dado que la tabla `memberships`, entonces soporta múltiples usuarios por
  `Organization` y múltiples `Organization` por usuario (N:N con rol por
  vínculo).
- Dado que se crea un `Membership`, entonces el par (`userId`,
  `organizationId`) es único.
- Dado que el modelo `Membership` convive con el campo `role` legacy,
  entonces ambos coexisten durante la transición sin romper la app ni el
  panel.

### Implementación backend

`memberships` tiene `@@unique([userId, organizationId])` y un índice por
`organizationId`. El backfill de la migración crea:

- un `Membership` `ADMIN` por cada `(business.ownerUserId,
  business.organizationId)`.
- un `Membership` `EMPLOYEE` por cada `business_employees` activo, usando la
  `Organization` del `Business` correspondiente (`ON CONFLICT DO NOTHING`
  para no duplicar si el mismo usuario ya tiene `ADMIN` en esa
  `Organization`).

El campo `role` global en `User` no se tocó ni se eliminó: sigue siendo la
fuente del RBAC actual (`middleware/authorize.ts`), `Membership` es un
modelo paralelo que todavía no lo reemplaza.

### Cobertura

Cubierta junto con HU-2.5.1 (la migración y su backfill son una sola pieza)
y con HU-2.5.3 (`ResolveEffectiveRoleUseCase` lee `Membership` directamente).

## HU-2.5.3 - Resolver el rol efectivo de un usuario a partir de su Membership

Story points: `2`

Estado: `implementado`.

Como equipo de desarrollo, quiero resolver el rol efectivo de un usuario a
partir de su `Membership`.

### Criterios de Aceptación

- Dado que un usuario tiene un `Membership` en una `Organization`, cuando se
  solicita su rol efectivo en el contexto de esa `Organization`, entonces el
  sistema lo deriva del `Membership` y no del campo `role` global.
- Dado que un usuario pertenece a varias `Organization`, cuando opera sobre
  una de ellas, entonces el rol efectivo se resuelve según el `Membership`
  correspondiente a esa `Organization`.
- Dado que un usuario no tiene `Membership` en la `Organization` solicitada,
  entonces el rol efectivo es nulo y el acceso se deniega para ese contexto.

### Decisiones de alcance

La migración completa del middleware RBAC (`authorize`) para que consuma el
rol efectivo en lugar del `role` legacy queda explícitamente fuera de
alcance de esta historia (así lo marca el backlog) y se traquea por
separado. `middleware/authorize.ts` y los ~12 use cases de `business/` que
validan ownership comparando `ownerUserId` directamente no se modificaron.

### Implementación backend

`ResolveEffectiveRoleUseCase`
(`src/modules/organization/application/ResolveEffectiveRoleUseCase.ts`)
recibe `(userId, organizationId)` y devuelve `{ role: "admin" | "employee" |
null }` leyendo `IMembershipRepo.findByUserAndOrganization` directamente.
Queda exportado en `public-api.ts` para cuando se decida conectarlo a
`authorize.ts`, pero no se invoca desde ningún middleware ni ruta todavía.

### Cobertura

- `tests/unit/organization/ResolveEffectiveRoleUseCase.test.ts`

Cobertura actual:

- resuelve el rol correcto cuando el usuario tiene `Membership` en varias
  organizaciones distintas
- devuelve `null` cuando no hay `Membership` en la organización solicitada

## HU-2.5.4 - Habilitar múltiples Business y Queue por Organization según el plan

Story points: `2`

Estado: `implementado` (límite de negocios conectado; límite de filas
preparado para Épica 3).

Como equipo de desarrollo, quiero habilitar múltiples `Business` y `Queue`
por `Organization` según el plan de la `Subscription`.

### Criterios de Aceptación

- Dado que la `Subscription` vive a nivel `Organization`, cuando se evalúa
  qué puede crear la cuenta, entonces el plan define el límite: Basic = 1
  negocio / 1 fila, Pro = 1 negocio / varias filas, Premium = varios
  negocios / varias filas cada uno.
- Dado que una `Organization` con plan Basic intenta crear un segundo
  `Business` o una segunda `Queue`, entonces la operación se rechaza con un
  error claro indicando el límite del plan.
- Dado que una `Organization` con plan Pro o Premium, entonces puede crear
  varias `Queue` por `Business` dentro de los límites de su plan.
- Dado que se baja de plan (downgrade) con recursos por encima del nuevo
  límite, entonces el sistema bloquea la baja sin borrar datos
  automáticamente.

### Decisiones de alcance

`Queue` todavía no tiene persistencia real en Postgres (Épica 3 sigue en
estado stub), así que el límite de filas no puede contarse solo: queda
implementado como pieza de dominio que Épica 3 debe invocar cuando exista un
`CreateQueueUseCase` real, pasándole el conteo de queues activas del
`Business` (ver "Contratos diferidos").

El cambio de plan (downgrade/upgrade) no tiene flujo de billing ni UI en el
MVP, así que `UpdateOrganizationSubscriptionUseCase` no se expone por HTTP
en este pase; queda como pieza de dominio invocable desde Backoffice o
billing cuando exista ese flujo.

### Implementación backend

- `PLAN_LIMITS` (`src/modules/organization/domain/PlanLimits.ts`): única
  fuente de verdad de la grilla de planes.
- `EnsureBusinessCreationAllowedUseCase`: dado un `organizationId` y el
  conteo actual de `Business` (`IBusinessRepo.countByOrganizationId`),
  rechaza con `AppError.forbidden` / código `PLAN_BUSINESS_LIMIT_REACHED` si
  excede el límite del plan. Conectado en `RegisterBusinessUseCase` antes de
  persistir el negocio.
- `EnsureQueueCreationAllowedUseCase`: misma idea para filas por negocio,
  código `PLAN_QUEUE_LIMIT_REACHED`. No conectado a ningún flujo real
  todavía (ver contratos diferidos).
- `UpdateOrganizationSubscriptionUseCase`: cambia el plan de una
  `Subscription`; si el nuevo plan tiene menos capacidad que los `Business`
  reales de la cuenta, rechaza con `AppError.conflict` / código
  `SUBSCRIPTION_DOWNGRADE_BLOCKED` en vez de borrar datos.

### Contratos diferidos

- Conectar `EnsureQueueCreationAllowedUseCase` al primer `CreateQueueUseCase`
  real de Épica 3: debe llamarlo antes de insertar una `Queue`, pasándole
  `currentQueueCountForBusiness` contado desde el propio repositorio de
  `Queue`.
- Exponer `UpdateOrganizationSubscriptionUseCase` por HTTP cuando exista un
  flujo de billing o de gestión de planes en Backoffice.

### Cobertura

- `tests/unit/organization/EnsureBusinessCreationAllowedUseCase.test.ts`
- `tests/unit/organization/EnsureQueueCreationAllowedUseCase.test.ts`
- `tests/unit/organization/UpdateOrganizationSubscriptionUseCase.test.ts`
- `tests/unit/business/RegisterBusinessUseCase.test.ts`

Cobertura actual:

- rechazo de un segundo `Business` bajo plan Basic/Pro
- aceptación de múltiples `Business` bajo plan Premium
- rechazo de una segunda `Queue` bajo plan Basic
- aceptación de múltiples `Queue` bajo plan Pro/Premium
- bloqueo de downgrade cuando hay más `Business` que el límite nuevo
- downgrade permitido cuando los recursos actuales entran en el nuevo plan
- `RegisterBusinessUseCase` rechaza el segundo negocio de una cuenta Basic
  con `PLAN_BUSINESS_LIMIT_REACHED` y no persiste el negocio rechazado

## HU-2.5.5 - Campo legal_id en Organization

Story points: `1`

Estado: `implementado`.

Como equipo de desarrollo, quiero un campo de identificador legal en
`Organization` para sostener la validación de coherencia en la aprobación de
nuevos `Business`.

### Criterios de Aceptación

- Dado que se crea una `Organization`, entonces admite un campo `legalId`
  (razón social o CUIT), opcional al momento de alta y editable después.
- Dado que una `Organization` no tiene `legalId` cargado, cuando se intenta
  aprobar un `Business` nuevo bajo esa `Organization`, entonces el
  Backoffice muestra advertencia de dato faltante sin bloquear la revisión
  manual.

### Implementación backend

- `Organization.legalId?: string` — columna nullable, sin validación de
  formato (texto libre; puede ser CUIT o razón social).
- Editable después de la creación vía `UpdateOrganizationUseCase`
  (`PATCH /api/organizations/:organizationId`, permiso `organization:edit`)
  — ver contrato completo en el refinamiento de abajo.
- La advertencia de "dato faltante" en el Backoffice (HU-8.7) queda diferida
  a cuando se construya esa UI — `legalId` ya está disponible en el
  `Organization` devuelto por `ListPendingOrganizationsUseCase` para que el
  frontend la calcule (`legalId == null`).

### Cobertura

- `tests/unit/organization/UpdateOrganizationUseCase.test.ts`

## Documentación inline

- `PlanLimits.ts`: aclara que es la única fuente de verdad de la grilla de
  planes (antes solo vivía en el backlog).
- `CreateOrganizationForOwnerUseCase`: documenta por qué reutiliza la
  `Organization` existente del owner en vez de crear una nueva cada vez.
- `EnsureQueueCreationAllowedUseCase`: documenta explícitamente que es el
  punto de extensión para Épica 3, ya que no puede contar queues reales por
  sí mismo.
- `UpdateOrganizationSubscriptionUseCase`: documenta por qué no se expone
  por HTTP todavía.
- `migration.sql`: documenta el backfill (reutilizar el `id` del `Business`
  como `id` de la `Organization`) y el rollback manual.

## Observaciones técnicas para Épica 3

- `Queue`/`Turn` siguen sin persistencia real en Postgres; el primer
  `CreateQueueUseCase` de Épica 3 debe importar
  `EnsureQueueCreationAllowedUseCase` desde
  `@modules/organization/public-api` y llamarlo antes de insertar.
- `IBusinessRepo.countByOrganizationId` ya existe y puede reutilizarse como
  referencia para un método equivalente en el futuro `IQueueRepo`
  (`countActiveByBusinessId`).

## Bugfix pre-E3 — Business.status y Subscription.status (2026-07-03)

Rama: `bugfix/pre-e3-schema-debt` (PR #27, fusionado a `develop`).

### Motivación

La Épica 2.5 introdujo `Organization` y `Subscription`, pero la suscripción
nacía sin un campo de estado formal. Tampoco existía una compuerta de
aprobación en `Business` (el campo `User.approvalStatus` que se usaba era
semánticamente incorrecto: un usuario puede tener varios negocios). Antes de
arrancar Épica 3, estas dos deudas de schema se resuelven.

### Cambios en schema

Migración `20260703110000_add_business_status_and_subscription_status`:

- Enum `BusinessStatus`: `PENDING | APPROVED | REJECTED | SUSPENDED`
- `businesses.status`: `BusinessStatus NOT NULL DEFAULT 'PENDING'`; backfill:
  negocios de usuarios con `approvalStatus = 'approved'` → `APPROVED`;
  el resto → `PENDING`.
- Enum `SubscriptionStatus`: `PENDING | TRIAL | ACTIVE | EXPIRED | CANCELLED`
- `subscriptions.status`: `SubscriptionStatus NOT NULL DEFAULT 'PENDING'`;
  backfill: suscripciones de negocios ya aprobados → `ACTIVE`.
- `subscriptions.trialEndsAt`: `TIMESTAMPTZ NULL`
- `subscriptions.cancellationReason`: `TEXT NULL`
- `subscriptions.cancelledAt`: `TIMESTAMPTZ NULL`

### Ciclo de vida de Subscription

```
Creación del primer negocio → status: pending
         ↓
Aprobación por el equipo → status: trial, trialEndsAt = now + 30d
         ↓ (pasados 30 días, cron futuro)
         ↓ active  ←── pago confirmado
         ↓
expired (sin renovar) | cancelled (baja voluntaria)
```

### ApproveBusinessAccountUseCase (reescrito dos veces)

Primera reescritura (2026-07-03, esta sección original): pasó de marcar solo
`User.approvalStatus` a cascadear la aprobación a todos los `Business`
`pending` del usuario y arrancar el trial de su `Subscription`.

**Esa cascada ya no existe.** El refinamiento *Aprobación en dos niveles*
(ver más abajo) la reemplazó: `ApproveBusinessAccountUseCase` volvió a ser
puramente el gate de cuenta/login (`User.approvalStatus`), y la aprobación
comercial de `Business`/`Organization` vive en use cases propios,
desacoplados de este.

### CreateOrganizationForOwnerUseCase (ajuste menor)

La `Subscription` se crea ahora con `status: "pending"`, `trialEndsAt: null`,
`cancellationReason: null`, `cancelledAt: null`. Antes el campo no existía;
`pending` es el estado correcto hasta que el equipo aprueba el negocio.

### PLAN_LIMITS — reglas consensuadas (código pendiente)

Se establecieron los límites definitivos para cada plan:

| Plan    | Negocios | Colas por negocio |
|---------|----------|-------------------|
| Basic   | 1        | 1                 |
| Pro     | 1        | ilimitado         |
| Premium | 10       | 20                |

El código en `src/modules/organization/domain/PlanLimits.ts` todavía usa
`Infinity` para `premium.maxBusinesses` y `premium.maxQueuesPerBusiness`.
**Pendiente**: cambiar a `10` y `20` respectivamente antes de conectar billing.

### Reglas de negocio establecidas

1. `User.role = business_admin` es permanente una vez asignado; no revierte
   al cancelar ni al expirar.
2. El trial arranca en el momento de la aprobación manual del equipo (no en el
   registro). Duración: 30 días.
3. El plan durante el trial es siempre `BASIC`.
4. Un `Business` rechazado o suspendido no puede generar colas ni turnos.
5. La re-suscripción reactiva el mismo `Business` existente; no se crea uno
   nuevo.
6. La cancelación tiene un campo de feedback (`cancellationReason`).
7. Post-expiración, el negocio queda en modo lectura (sin nuevos turnos).
8. La `Organization` es una entidad técnica transparente para Basic/Pro;
   solo tiene relevancia en UI para Premium (multi-sucursal).
9. Somos nosotros (el equipo) quienes verificamos el pago y disparamos la
   aprobación/activación; no hay flujo de billing automático en MVP.
10. El RBAC por `Membership` (diferido a Épica 6) no bloquea el avance de
    Épica 3.

---

## Refinamiento — Aprobación comercial en dos niveles (backlog v2.4)

Rama: `bugfix/two-level-approval`. Migración
`20260731000000_two_level_approval`.

### Motivación

El backlog v2.4 resolvió una decisión que hasta ahora quedaba abierta
("Pendiente: aprobación comercial y RBAC por Membership", ver
`docs/decision-modelo-cuentas-negocios.md`): la aprobación comercial vive en
**dos niveles independientes**.

- **Nivel 1 — `Organization`**: se aprueba una única vez. Aprobarla **no**
  aprueba ningún `Business` bajo ella.
- **Nivel 2 — `Business`**: cada sucursal se revisa por separado, y
  **requiere que su `Organization` ya esté aprobada**.

Esto reemplaza el modelo anterior (`ApproveBusinessAccountUseCase` cascadeaba
la aprobación de un `User` a *todos* sus `Business` pendientes en una sola
operación) — modelo que nunca estuvo en ningún backlog, era deuda de
implementación previa a que existiera esta decisión de producto.

### `User.approvalStatus` queda intacto y desacoplado

`User.approvalStatus` sigue siendo el gate de cuenta/login (embebido en el
JWT, bloquea el login si es `rejected` — ver `middleware/authenticate.ts` y
`LoginUseCase`). No se tocó su semántica. Las aprobaciones de `Organization`
y `Business` son completamente independientes de este campo.

### Modelo de datos

```typescript
type OrganizationStatus = "pending" | "approved" | "rejected";

interface Organization {
  id: string;
  name: string;
  legalId?: string;              // HU-2.5.5
  status: OrganizationStatus;
  approvedByUserId?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  rejectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface Business {
  // ...campos existentes...
  status: BusinessStatus;        // ya existía: pending | approved | rejected | suspended
  approvedByUserId?: string;     // nuevo
  approvedAt?: Date;             // nuevo
  rejectedReason?: string;       // nuevo
  rejectedAt?: Date;             // nuevo
}
```

**Backfill de la migración**: una `Organization` que ya tiene al menos un
`Business` `APPROVED` se marca `APPROVED` automáticamente (quedó operando
antes de que existiera este gate — se la da por buena retroactivamente).
`approvedByUserId`/`approvedAt` quedan `null` en ese caso porque no hay
ninguna acción de admin real que registrar. El resto de las `Organization`
quedan `PENDING`.

### Contratos backend

```text
GET   /api/organizations/pending                    platform:manage_approvals
PATCH /api/organizations/:organizationId/approve     platform:manage_approvals
PATCH /api/organizations/:organizationId/reject      platform:manage_approvals
PATCH /api/organizations/:organizationId             organization:edit

GET   /api/business/pending                          platform:manage_approvals
PATCH /api/business/:businessId/approve              platform:manage_approvals
PATCH /api/business/:businessId/reject               platform:manage_approvals
```

Nuevo permiso `platform:manage_approvals` (solo `super_admin`, vía el mismo
sistema de auth existente — no hay login de Backoffice separado todavía,
ver HU-8.1). Nuevo permiso `organization:edit` (otorgado a `business_admin`,
verificado además a nivel de `Membership.role === "admin"` dentro del use
case, mismo patrón que el resto de los endpoints de negocio).

#### Aprobar/rechazar Organization

`ApproveOrganizationUseCase`: requiere `status !== "approved"` (permite
aprobar desde `pending` o `rejected` — cubre la corrección post-rechazo sin
necesitar un endpoint de "reenviar" separado). Envía
`sendOrganizationApprovedEmail` al `Membership` `admin` de esa Organization.

`RejectOrganizationUseCase`: requiere `status === "pending"` — no se puede
rechazar una Organization ya aprobada (eso sería una suspensión, fuera de
alcance de este refinamiento). Body: `{ "reason": string }`.

#### Aprobar/rechazar Business

`ApproveBusinessUseCase`: requiere `Organization.status === "approved"` —
si no, `409 ORGANIZATION_NOT_APPROVED`. Preserva toda la lógica que antes
vivía en la cascada de `ApproveBusinessAccountUseCase`:

1. Marca el `Business` `approved` (con `approvedByUserId`/`approvedAt`).
2. Si la `Subscription` de la Organization está `pending`, arranca el trial
   de 30 días (`status: "trial"`).
3. Crea la cola por defecto ("Caja principal", prefijo `A`) si el `Business`
   todavía no tiene ninguna — mismo bootstrap que ya existía.
4. Envía `sendBusinessApprovedEmail` al dueño del `Business`.

`RejectBusinessUseCase`: requiere `status === "pending"`. Body:
`{ "reason": string }`. Envía `sendBusinessRejectedEmail`.

#### Listar pendientes (HU-8.2)

`ListPendingOrganizationsUseCase`: todas las `Organization` `pending`.

`ListPendingBusinessesUseCase`: `Business` `pending`, con filtros opcionales
`organizationId`, `categoryId`, `fromDate`/`toDate` (query params en
`GET /api/business/pending`).

### Códigos de error nuevos

| Código | HTTP | Significado |
|---|---|---|
| `ORGANIZATION_NOT_FOUND` | 404 | La Organization no existe. |
| `ORGANIZATION_ALREADY_APPROVED` | 409 | Ya estaba aprobada (approve). |
| `ORGANIZATION_NOT_PENDING` | 409 | No está pending (reject). |
| `ORGANIZATION_NOT_APPROVED` | 409 | Se intentó aprobar un Business cuya Organization no está aprobada. |
| `ORGANIZATION_OWNERSHIP_REQUIRED` | 403 | El usuario no es admin (Membership) de esa Organization (update). |
| `BUSINESS_ALREADY_APPROVED` | 409 | Ya estaba aprobado (approve). |
| `BUSINESS_NOT_PENDING` | 409 | No está pending (reject). |

### Emails nuevos

`src/shared/infrastructure/email.ts`: `sendOrganizationApprovedEmail`,
`sendOrganizationRejectedEmail`, `sendBusinessApprovedEmail`,
`sendBusinessRejectedEmail` — mismo patrón que el resto (Resend en
producción, log local si no está configurado). Todos best-effort: un fallo
de envío no revierte la aprobación/rechazo.

### Decisiones de alcance explícitas

1. **No hay endpoint de "reenviar tras rechazo"**: el `admin` corrige los
   datos con los endpoints de edición existentes
   (`UpdateOrganizationUseCase`, `UpdateBusinessProfileUseCase`) y el equipo
   Espera vuelve a llamar `approve` directamente — `ApproveOrganizationUseCase`
   acepta tanto `pending` como `rejected` como estado de entrada
   específicamente para cubrir este caso sin un paso intermedio.
2. **Rechazar una Organization ya aprobada no está soportado** — esa acción
   sería una suspensión (fuera de alcance; no hay HU de suspensión de
   Organization en el backlog, solo de `Business` vía HU-8.4).
3. **HTTP expuesto ya**, reusando el sistema de auth existente
   (`super_admin` vía el mismo login de siempre) en vez de esperar a un
   Backoffice completo con login propio (HU-8.1 sigue sin implementar como
   sistema separado).

### Cobertura

- `tests/unit/auth/ApproveBusinessAccountUseCase.test.ts` (reescrito —
  ya no testea cascada)
- `tests/unit/organization/ApproveOrganizationUseCase.test.ts`
- `tests/unit/organization/RejectOrganizationUseCase.test.ts`
- `tests/unit/organization/ListPendingOrganizationsUseCase.test.ts`
- `tests/unit/organization/UpdateOrganizationUseCase.test.ts`
- `tests/unit/business/ApproveBusinessUseCase.test.ts` (incluye trial,
  bootstrap de cola y guard de Organization no aprobada)
- `tests/unit/business/RejectBusinessUseCase.test.ts`
- `tests/unit/business/ListPendingBusinessesUseCase.test.ts`
