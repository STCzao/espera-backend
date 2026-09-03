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

| Plan    | Negocios | Filas por negocio | Ventanillas por fila |
| ------- | -------- | ------------------ | --------------------- |
| Basic   | 1        | 1                   | 1                      |
| Pro     | 1        | 1                   | Hasta 10               |
| Premium | Hasta 3  | 1                   | Hasta 20               |

**Actualización (2026-08-20, ver `docs/epica-3-cola.md`, sección
*"Reformulación del pitch de planes"*)**: la tabla de arriba refleja
valores viejos (Pro con filas ilimitadas y hasta 3 ventanillas, Premium con
negocios ilimitados) — se reemplazaron por lo de esta fila tras un análisis
de venta que encontró que "varias filas por negocio" no es un diferencial
real hoy (nadie del lado cliente puede elegir a cuál entrar), y que
"negocios ilimitados" prometía una escala nunca validada. El pilar de
Premium pasa a ser sucursales + techo de ventanillas, no cantidad de filas.

La columna "Ventanillas por fila" se agregó en un bugfix posterior (ver
`docs/epica-3-cola.md`, sección *"Bugfix — límite de ventanillas por
plan"*): hasta entonces `maxServiceWindowsPerQueue` no existía y cualquier
plan podía crear ventanillas sin tope real (ver esa sección para el
detalle).

## Contratos principales de la épica

`HU-2.5.1` a `HU-2.5.4` no exponen ningún endpoint HTTP — están redactadas
para el equipo de desarrollo y se consumen internamente desde `business/` y
`auth/` vía `@modules/organization/public-api`, igual que `business/` ya
consume `@modules/auth/public-api`.

El refinamiento *Aprobación en dos niveles* (ver abajo) sí agrega endpoints
HTTP reales — es la primera vez que `organization/` tiene su propia capa
`interfaces/`. Contrato completo en esa sección.

El bugfix *Gestión manual de Subscription* (ver sección al final de
`HU-2.5.4`) agrega los primeros endpoints HTTP para `Subscription`:

```text
GET   /api/organizations/:organizationId/subscription             platform:manage_approvals
PATCH /api/organizations/:organizationId/subscription/activate    platform:manage_approvals
PATCH /api/organizations/:organizationId/subscription/cancel      platform:manage_approvals
PATCH /api/organizations/:organizationId/subscription/plan        platform:manage_approvals
```

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
MVP. **Actualización (bugfix, ver sección al final de esta historia):**
`UpdateOrganizationSubscriptionUseCase` ya se expone por HTTP, junto con el
resto de la gestión manual de `Subscription` — no hay pasarela de pago, así
que el equipo Espera confirma el pago por fuera del sistema y lo refleja
manualmente desde el Backoffice.

### Implementación backend

- `PLAN_LIMITS` (`src/modules/organization/domain/PlanLimits.ts`): única
  fuente de verdad de la grilla de planes.
- `EnsureBusinessCreationAllowedUseCase`: dado un `organizationId` y el
  conteo actual de `Business` (`IBusinessRepo.countByOrganizationId`),
  rechaza con `AppError.forbidden` / código `PLAN_BUSINESS_LIMIT_REACHED` si
  excede el límite del plan. Conectado en `RegisterBusinessUseCase` antes de
  persistir el negocio.
- `EnsureQueueCreationAllowedUseCase`: misma idea para filas por negocio,
  código `PLAN_QUEUE_LIMIT_REACHED`. **Actualización (bugfix, ver
  `docs/epica-3-cola.md`, sección "Crear colas adicionales"): ya está
  conectado**, en `CreateQueueUseCase`.
  **Actualización (bugfix, 2026-08-20)**: también rechaza con `403
  SUBSCRIPTION_INACTIVE` si la suscripción está `cancelled`/`expired`, igual
  que `EnsureBusinessCreationAllowedUseCase` — antes solo comparaba contra el
  límite numérico del plan, así que una organización con suscripción vencida
  podía seguir creando colas nuevas en sus negocios ya aprobados.
  `EnsureServiceWindowCreationAllowedUseCase` recibió el mismo fix, mismo
  motivo. Ver `docs/epica-3-cola.md`, sección "Bugfix — restricciones de cola
  y planes".
- `UpdateOrganizationSubscriptionUseCase`: cambia el plan de una
  `Subscription`; si el nuevo plan tiene menos capacidad que los `Business`
  reales de la cuenta, rechaza con `AppError.conflict` en vez de borrar
  datos. **Actualización (2026-08-20)**: el código se separó en
  `SUBSCRIPTION_DOWNGRADE_BLOCKED_BUSINESSES`/`_QUEUES`/`_WINDOWS` — ver
  sección más abajo.

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

### Bugfix — Gestión manual de Subscription (2026-08-07)

No hay pasarela de pago en el MVP, así que la máquina de estados de
`SubscriptionStatus` (`pending → trial → active → expired/cancelled`) nunca
tenía un gatillo manual más allá de las dos transiciones automáticas ya
existentes (creación → `pending`; aprobación del primer `Business` →
`trial`, HU-8.3). Surgió al notar que el listado de negocios+métricas del
Backoffice (HU-8.5) mostraba actividad aislada de cada negocio sin ningún
contexto comercial — plan, si está pagando o no — que es lo que realmente le
importa al equipo para gestionar cuentas.

Migración `20260807000000_subscription_manual_management` agrega
`Subscription.activatedByUserId`/`activatedAt` y `Subscription.
cancelledByUserId` (`cancellationReason`/`cancelledAt` ya existían).

Use cases nuevos, todos en `organization/application`:

- `GetOrganizationSubscriptionUseCase` — lectura simple.
- `ActivateOrganizationSubscriptionUseCase` — `pending`/`trial` → `active`
  (`409 SUBSCRIPTION_CANNOT_BE_ACTIVATED` si ya está en un estado terminal o
  ya activa). Representa "el equipo confirmó el pago por fuera del
  sistema".
- `CancelOrganizationSubscriptionUseCase` — cualquier estado no terminal →
  `cancelled`, con `reason` obligatorio (`409
  SUBSCRIPTION_ALREADY_CANCELLED` si ya estaba `cancelled`/`expired`).
- `UpdateOrganizationSubscriptionUseCase` (ya existía) — ahora se expone por
  HTTP. Como no puede calcular `currentBusinessCount` sin depender del
  módulo `business` (crearía un ciclo: `business` ya depende de
  `organization`, ver `ApproveBusinessUseCase`), ese conteo se resuelve en
  `OrganizationController` — la capa `interfaces/` sí puede importar
  `@modules/business/public-api` sin crear un ciclo, porque ese barrel no
  reexporta nada que a su vez importe `organization/public-api`.

De paso se corrigió un bug real encontrado al tocar `OrganizationController`:
`UpdateOrganizationUseCase` acepta `categoryId` desde HU-8.7, pero el
controller nunca lo leía del body — quedó inutilizable por HTTP desde que se
agregó. Ya se pasa correctamente.

**Conectado con HU-8.5**: `GetPlatformMetricsUseCase` ahora resuelve, para
cada negocio del rango, el plan/estado de `Subscription` de su
`Organization` (con cache por `organizationId` para no repetir consultas
entre negocios de la misma cuenta), y permite filtrar por
`subscriptionPlan`/`subscriptionStatus` además de `organizationId`,
`categoryId` y `status` del negocio. Ver contrato actualizado en
`docs/epica-8-backoffice.md`, sección HU-8.5.

Cobertura:
- `tests/unit/organization/GetOrganizationSubscriptionUseCase.test.ts`
- `tests/unit/organization/ActivateOrganizationSubscriptionUseCase.test.ts`
- `tests/unit/organization/CancelOrganizationSubscriptionUseCase.test.ts`
- `tests/unit/business/GetPlatformMetricsUseCase.test.ts` (bloque "filtros,
  orden y paginación de negocios")

### Bugfix — La Subscription vencida/cancelada ahora bloquea operar (2026-08-08)

Al analizar el bugfix anterior surgieron dos huecos relacionados, tratados
como uno solo porque el segundo no tiene sentido sin el primero:

1. **Nada movía `trial → expired` automáticamente.** No hay scheduler real
   en este MVP (`OutboxProcessor` sigue siendo un stub vacío), así que una
   `Subscription` podía quedar en `trial` para siempre después de vencido
   `trialEndsAt`, sin que nadie lo notara salvo revisión manual.
2. **`ApproveBusinessUseCase` no miraba el estado de la `Subscription` en
   absoluto** — se podía aprobar (y operar) un `Business` de una
   `Organization` con `Subscription` `cancelled`/`expired`. Bloquear esto
   sin resolver (1) primero era inútil: el estado `expired` casi nunca se
   alcanzaba solo.

**Solución — reconciliación perezosa, no cron.** Nuevo
`ResolveEffectiveSubscriptionStatusUseCase`
(`organization/application/ResolveEffectiveSubscriptionStatusUseCase.ts`,
mismo patrón de nombre que `ResolveEffectiveRoleUseCase`): lee la
`Subscription`, y si está en `trial` con `trialEndsAt` ya pasado, la
persiste como `expired` antes de devolverla. Cualquier lugar que necesite
saber si una cuenta puede operar debe pasar por acá en vez de leer
`ISubscriptionRepo` directo — así un `trial` vencido nunca se trata como
vigente, sin necesitar infraestructura de scheduler.

Se compone internamente a partir del `ISubscriptionRepo` ya inyectado en
cada use case (`new ResolveEffectiveSubscriptionStatusUseCase(this.
subscriptionRepo)`) en vez de agregarlo como dependencia nueva del
constructor — evita romper la firma pública de los use cases existentes y
sus tests.

Conectado en:

- `ApproveBusinessUseCase` — antes de aprobar, si la `Subscription`
  reconciliada es `cancelled`/`expired`, rechaza con `409
  SUBSCRIPTION_NOT_ACTIVE`. Reusa el mismo fetch para la lógica de inicio de
  trial que ya existía, en vez de consultarla dos veces.
- `EnsureBusinessCreationAllowedUseCase` — mismo chequeo antes de validar el
  límite de negocios por plan, `403 SUBSCRIPTION_INACTIVE` (bloquea incluso
  si el conteo de negocios entra en el límite del plan).
- `GetOrganizationSubscriptionUseCase` — el Backoffice ve el estado
  reconciliado, no uno potencialmente desactualizado.
- `GetPlatformMetricsUseCase` — el listado de negocios (bugfix anterior)
  también muestra `subscriptionStatus` reconciliado.

`pending` y `trial` (no vencido) y `active` siguen permitiendo operar sin
cambios — el gate es exclusivamente para `cancelled`/`expired`.

Cobertura:
- `tests/unit/organization/ResolveEffectiveSubscriptionStatusUseCase.test.ts`
- `tests/unit/organization/EnsureBusinessCreationAllowedUseCase.test.ts`
  (bloque "estado de la subscription")
- `tests/unit/business/ApproveBusinessUseCase.test.ts` (bloque "estado de la
  subscription")
- `tests/unit/business/GetPlatformMetricsUseCase.test.ts` (bloque "estado
  efectivo de la subscription")

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

*(Nota histórica — escrita antes de que Épica 3 tuviera persistencia real;
ver estado actual en `docs/epica-3-cola.md`)*

- `Queue`/`Turn` siguen sin persistencia real en Postgres; el primer
  `CreateQueueUseCase` de Épica 3 debe importar
  `EnsureQueueCreationAllowedUseCase` desde
  `@modules/organization/public-api` y llamarlo antes de insertar.
- `IBusinessRepo.countByOrganizationId` ya existe y puede reutilizarse como
  referencia para un método equivalente en el futuro `IQueueRepo`
  (`countActiveByBusinessId`).

**Resuelto (bugfix, 2026-08-08)**: ver `docs/epica-3-cola.md`, sección
"Crear colas adicionales" — `CreateQueueUseCase` ya existe y llama a
`EnsureQueueCreationAllowedUseCase` tal como se anticipaba acá.

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

### PLAN_LIMITS — reglas consensuadas (histórico, superado)

*(Nota histórica — estos números nunca se implementaron así. Ver el valor
final real en `docs/epica-3-cola.md`, sección "Reformulación del pitch de
planes", 2026-08-20: Pro con 1 cola/hasta 10 ventanillas, Premium con hasta
3 negocios/1 cola/hasta 20 ventanillas.)*

Se habían discutido estos límites en su momento:

| Plan    | Negocios | Colas por negocio |
|---------|----------|-------------------|
| Basic   | 1        | 1                 |
| Pro     | 1        | ilimitado         |
| Premium | 10       | 20                |

Quedaron sin implementar (el código siguió con `Infinity` en ambos campos
de Premium y `pro.maxQueuesPerBusiness`) hasta el análisis de venta que
llevó a los valores definitivos de arriba.

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

### Bugfix — downgrade sin frenos y suscripciones canceladas sin retorno (2026-08-20)

Rama: `bugfix/restructurar-limites-planes` (mismo trabajo que la
reformulación del pitch de planes, ver `docs/epica-3-cola.md`). Surgió
explicando en detalle los flujos de plan: `UpdateOrganizationSubscriptionUseCase`
solo comparaba `currentBusinessCount` contra el plan nuevo —
nunca chequeaba colas ni ventanillas — y `ActivateOrganizationSubscriptionUseCase`
explícitamente rechazaba reactivar desde `cancelled`/`expired`
(`ACTIVATABLE_STATUSES = ["pending", "trial"]`), así que una cuenta que se
cancelaba no tenía **ningún** camino de vuelta a `active` en todo el
código — ni cambiando el plan, ni con "activar".

### Fix 1 — downgrade también chequea colas y ventanillas

`UpdateOrganizationSubscriptionInput` gana
`maxActiveQueuesPerBusiness`/`maxActiveWindowsPerQueue` — el máximo, no un
desglose por negocio/cola, porque `PLAN_LIMITS` aplica el mismo techo a
todos los negocios/colas de la organización, así que solo importa el peor
caso. Mismo patrón que `currentBusinessCount` ya establecido: el use case
de `organization` no calcula esto por sí mismo (crearía el ciclo
`organization` → `business`/`queue` que el bugfix anterior evitó a
propósito) — `OrganizationController.changeSubscriptionPlan` lo resuelve,
consultando `businessRepo`/`queueRepo`/`windowRepo` directamente (la capa
`interfaces/` sí puede cruzar módulos). Si algo excede el plan nuevo,
`409 SUBSCRIPTION_DOWNGRADE_BLOCKED_BUSINESSES`/`_QUEUES`/`_WINDOWS` según
cuál — el dueño achica manualmente con
`ToggleQueueUseCase`/`ToggleServiceWindowUseCase` (ya existían) antes de
poder bajar de plan. No hay auto-selección de qué apagar: misma lógica que
"no_show explícito, no automático".

**Actualización (2026-08-20)**: los tres chequeos compartían al principio
el mismo código `SUBSCRIPTION_DOWNGRADE_BLOCKED` — el llamador solo podía
distinguir la causa parseando el texto del mensaje. Se separaron en tres
códigos (`_BUSINESSES`/`_QUEUES`/`_WINDOWS`) para que un consumidor que
mapea errores por código pueda mostrarle al dueño el motivo específico.

### Fix 2 — reactivar desde cancelled/expired

`ActivateOrganizationSubscriptionUseCase.ACTIVATABLE_STATUSES` pasa a
incluir `cancelled`/`expired` — cubre tanto la primera activación como una
renovación después de vencer. `cancelledByUserId`/`cancellationReason`/
`cancelledAt` no se limpian al reactivar — quedan como historial.

### Fix 3 — restricción automática al cancelar

Nuevo `EnforceQueueLimitsForOrganizationUseCase` (`queue/application/` —
no `organization/`, por la misma razón de dependencia unidireccional:
necesita escribir `Queue`/`ServiceWindow`, y `queue` ya depende de
`organization`, no al revés). Dado un `organizationId` y un `PlanLimit`,
desactiva (no borra) las colas/ventanillas activas de más, conservando las
más antiguas — mismo critero que `findActiveByBusinessId`. Si una cola se
desactiva por exceder el límite, sus ventanillas no se tocan (ya son
irrelevantes con la cola apagada).

`OrganizationController.cancelSubscription` la invoca después de un
cancel exitoso, con `PLAN_LIMITS.basic` — una cuenta cancelada ya no tiene
plan pago, así que se restringe al techo de Basic (1 cola, 1 ventanilla)
en vez de dejar corriendo gratis lo que tenía en Pro/Premium. Reactivar
(Fix 2) **no** reactiva automáticamente lo que esto apagó — el dueño elige
qué reactivar con el toggle, a propósito.

**Alcance no cubierto, documentado como límite conocido**: esto solo se
dispara en la cancelación explícita (`POST .../subscription/cancel`). El
vencimiento pasivo de un trial (`ResolveEffectiveSubscriptionStatusUseCase`,
que recién reconcilia `trial` → `expired` cuando *alguien* lee la
suscripción, no hay cron en este MVP) sigue sin disparar esta restricción
— el `status` pasa a `expired` correctamente y bloquea *crear* recursos
nuevos, pero las colas/ventanillas que ya existían siguen operando sin
límite hasta que alguien cancele explícitamente o se resuelva este caso en
otro momento.

### Cobertura

- `tests/unit/organization/UpdateOrganizationSubscriptionUseCase.test.ts`
  (2 casos nuevos: bloquea por colas, bloquea por ventanillas)
- `tests/unit/organization/ActivateOrganizationSubscriptionUseCase.test.ts`
  (2 casos nuevos: renueva desde cancelled conservando el historial,
  renueva desde expired)
- `tests/unit/queue/EnforceQueueLimitsForOrganizationUseCase.test.ts`
  (nuevo — 6 casos)

627 tests en verde (suite completa).

Validación manual: pendiente.

## Bugfix — el vencimiento pasivo de un trial nunca disparaba la restricción de recursos (2026-09-01)

Rama: `bugfix/enforcement-limites-plan` (mismo trabajo que el fix de
reactivar cola/ventanilla, ver `epica-3-cola.md`). Cierra el "alcance no
cubierto, documentado como límite conocido" de arriba. Encontrado en una
segunda auditoría general del proyecto.

### El problema

`EnforceQueueLimitsForOrganizationUseCase` solo se disparaba desde
`OrganizationController.cancelSubscription` — una acción explícita. Pero
`ResolveEffectiveSubscriptionStatusUseCase` resuelve el vencimiento de un
trial de forma perezosa, sin ningún cron: `EnsureQueueCreationAllowedUseCase`,
`EnsureServiceWindowCreationAllowedUseCase`, `ApproveBusinessUseCase`,
`ListAllBusinessesUseCase` y `GetOrganizationSubscriptionUseCase` la
invocan como una simple lectura de estado. Un trial que vencía bloqueaba
*crear* recursos nuevos correctamente, pero las colas/ventanillas que ya
existían desde el trial se quedaban activas para siempre — nadie
"cancelaba" nada explícitamente, así que la limpieza nunca corría.

### Decisión de diseño: dónde enganchar el disparo

La opción más obvia — engancharlo dentro de
`ResolveEffectiveSubscriptionStatusUseCase` mismo, ya que ahí es donde se
detecta la transición — se descartó después de intentarla: ese use case lo
consumen 6 lugares distintos (algunos son lecturas simples, como
`GetOrganizationSubscriptionUseCase`, un endpoint de "mostrame mi plan").
Emparchar un efecto secundario tan grande (desactivar colas/ventanillas de
toda la organización) dentro de un use case de solo-lectura ampliamente
reusado significaba: (a) que revisar el estado de tu suscripción podía
desactivar recursos como side-effect, sorprendente para cualquiera que solo
quiera ver un dato, y (b) forzar a los 6 call sites (y sus tests) a
inyectar un fake solo para no pegarle a Postgres real en la suite unitaria
— demasiado ripple para lo que debería ser un fix acotado.

En cambio, el fix vive en `EnsureQueueCreationAllowedUseCase` y
`EnsureServiceWindowCreationAllowedUseCase` — los dos únicos lugares cuyo
trabajo ya es "decidir si el plan permite esto", justo en la rama donde ya
detectan `status === "cancelled" || status === "expired"` y rechazan con
`SUBSCRIPTION_INACTIVE`. Ahí, antes de lanzar el error, corren el mismo
`EnforceQueueLimitsForOrganizationUseCase` con `PLAN_LIMITS.basic` que ya
usa la cancelación explícita. Se dispara la primera vez que alguien intenta
crear o reactivar una cola/ventanilla después de que el trial venció — que
es, en la práctica, el momento en que más importa que el enforcement corra.

### Cobertura

- `tests/unit/organization/EnsureQueueCreationAllowedUseCase.test.ts` (caso
  nuevo: desactiva colas de sobra al descubrir acá un trial vencido)
- `tests/unit/organization/EnsureServiceWindowCreationAllowedUseCase.test.ts`
  (mismo caso para ventanillas)

701 tests en verde (suite completa), `tsc --noEmit` limpio en `src` y en
tests.

Validación manual: pendiente.

## Feature — `legalId` opcional en el registro de negocio (2026-09-02)

Rama: `feature/legal-id-en-registro`.

### El problema

HU-2.5.5 documentaba `legalId` como "opcional al alta, editable después",
pero en la práctica el registro de negocio (`RegisterBusinessUseCase`) nunca
pedía el dato — la única vía para cargarlo era
`PATCH /api/organizations/:organizationId`, una pantalla que todavía no
existe en el frontend. El resultado: el Backoffice mostraba la advertencia
de "CUIT faltante" (HU-8.7) en la revisión de todo negocio nuevo, sin que el
dueño hubiera tenido nunca la oportunidad de cargarlo. No era un bug de
código — el backend se comportaba tal como estaba documentado — sino un
hueco de producto entre dos flujos que se diseñaron en momentos distintos.

### La solución

`legalId?: string` se agregó como campo opcional en
`RegisterBusinessUseCase` (misma validación que
`UpdateOrganizationUseCase`: `trim().min(1).max(50)`, para no aceptar un
string vacío silenciosamente) y se lo pasa a
`CreateOrganizationForOwnerUseCase`, que ya lo aplicaba al crear una
`Organization` nueva. `BusinessController.register` no necesitó cambios —
ya hace spread de `request.body` hacia el use case.

Alcance deliberadamente acotado a este único flujo: `legalId` sólo se
aplica cuando `CreateOrganizationForOwnerUseCase` efectivamente crea una
`Organization` nueva (el "primer negocio" de un owner). Si el owner ya
tiene una `Organization` (`Membership` admin existente, típicamente por
backfill o por un negocio anterior), el `legalId` recibido se ignora — el
único camino para cambiarlo ahí sigue siendo el `PATCH` existente, tal como
documenta HU-2.5.5. Los flujos de registro en un solo paso ya marcados como
en vías de discontinuación (`RegisterBusinessAccountUseCase`,
`RegisterBusinessWithGoogleUseCase`) no se tocaron.

### Cobertura

- `tests/unit/business/RegisterBusinessUseCase.test.ts` ("passes legalId
  through to the new Organization when provided", "rejects an empty
  legalId instead of silently dropping it")
- `tests/unit/organization/CreateOrganizationForOwnerUseCase.test.ts`
  ("sets legalId on the new Organization when provided", "leaves legalId
  unset when not provided", "ignores legalId when reusing an existing
  Organization")

736 tests en verde (suite completa), `tsc --noEmit` limpio en `src` y en
tests.

Validación manual: pendiente.
