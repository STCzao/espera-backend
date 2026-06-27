# Épica 2.5 - Cuentas y Organizaciones

## Resumen

La Épica 2.5 introduce el modelo de cuentas multi-sucursal sin romper lo ya
implementado en Épica 1 y Épica 2. Las historias están redactadas de cara al
equipo de desarrollo (migración estructural del dominio), no al usuario
final. Bloquea la Fase 2 (Queue): la Épica 3 opera sobre `Business`/`Queue`
y necesita conocer cuántas filas y sucursales habilita el plan.

Alcance total estimado: `9 pts`.

Formato de referencia:

- `docs/story-documentation-standard.md`

## Estado general

- Estado: `implementado` en backend.
- Historias implementadas: `HU-2.5.1`, `HU-2.5.2`, `HU-2.5.3`, `HU-2.5.4`.
- Fuera de alcance, documentado explícitamente en el backlog: dónde vive la
  aprobación comercial (`Organization` vs `Business`) y la migración
  completa del middleware RBAC (`authorize`) al rol efectivo.

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

No se expone ningún endpoint HTTP nuevo. Las HU de esta épica están
redactadas para el equipo de desarrollo, no hay UI de panel para gestionar
organizaciones todavía, y ninguna otra épica consume estos contratos por
API. El módulo `src/modules/organization/` se consume internamente desde
`business/` y `auth/` vía `@modules/organization/public-api`, igual que
`business/` ya consume `@modules/auth/public-api`.

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
