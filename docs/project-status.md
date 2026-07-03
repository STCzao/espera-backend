# Estado y Arquitectura del Proyecto

## Resumen ejecutivo

`espera-back` es el backend principal del producto Espera. Su estado actual debe
leerse como una primera fase de autenticación bastante avanzada, con onboarding
de negocios y bases iniciales para las siguientes épicas.

El corte funcional real alcanzado hasta ahora llega principalmente hasta
`HU-1.9` para autenticación y onboarding. La Épica 2 ya cuenta con una primera
implementación backend de gestión de negocios para panel.

## Alcance real implementado

### Historias cubiertas en buena medida

- `HU-1.1` Registro con email y password
- `HU-1.3` Login con email y password
- `HU-1.5` Refresh token
- `HU-1.6` Logout
- `HU-1.7` Recuperación de password
- `HU-1.8` Registro de negocio con aprobación pendiente
- `HU-1.9` OAuth para panel de negocio

### Historias en rollover

- `HU-1.2` Registro de usuario con Google en app móvil
- `HU-1.4` Login de usuario con Google en app móvil

Estas historias quedaron diferidas por una dependencia externa válida:
configuración OAuth real por plataforma y despliegue o registro previo de la
aplicación móvil.

## Módulos del sistema

### auth

Responsabilidades actuales:

- registro local
- login local
- login Google
- registro de negocio local
- registro de negocio con Google
- refresh token
- logout
- verificación de email
- password reset
- aprobación de cuenta de negocio (activa `Business.status → approved` y arranca trial de 30 días en `Subscription`)

Fortalezas:

- validación de entrada con `zod`
- hashing con `bcrypt`
- refresh tokens persistidos por hash
- rotación de refresh token
- bloqueo temporal por intentos fallidos
- invalidación de sesiones tras cambio de password

### business

Responsabilidades actuales:

- registro base de negocio (con slug autogenerado desde el nombre)
- edición de perfil operativo
- configuración de horarios y días no laborables
- configuración de ventanillas activas
- estado operativo del negocio
- QR único del negocio
- invitación, listado y revocación de empleados
- listado de categorías de negocio (`GET /api/business/categories`, público)

Estado:

- módulo funcional para el primer corte de panel
- `Business.status` (`pending | approved | rejected | suspended`) actúa como
  compuerta de aprobación; `pending` por defecto al crear
- `categoryId` FK a `business_categories` con 9 categorías sembradas
- métricas y operación real de cola quedan para épicas posteriores

### organization

Responsabilidades actuales:

- creación transparente de `Organization` al registrar el primer negocio
- `Subscription` con ciclo de vida completo:
  `pending → trial → active → expired → cancelled`
- `Membership` por Organization con `role: admin | employee`
- límites de plan (`PLAN_LIMITS`): Basic (1 negocio/1 cola), Pro (1/ilimitado),
  Premium (10/20 por negocio)
- `ResolveEffectiveRoleUseCase`: resuelve el rol de un usuario en una
  Organization; no está conectado a `authorize.ts` aún (diferido a Épica 6)

Estado:

- módulo funcional; `Organization` y `Membership` son transparentes en UI para
  usuarios Basic/Pro; solo relevantes para Premium (multi-sucursal)
- `ResolveEffectiveRoleUseCase` implementado pero no wired en middleware

### queue

Responsabilidades proyectadas:

- creación de turnos
- llamada al siguiente
- cancelación
- prioridad
- tiempo real
- notificaciones

Estado:

- contratos y rutas creadas
- casos de uso actuales en estado base o stub

## Arquitectura técnica

El proyecto sigue una estructura de `Modular Monolith` con carpetas por módulo:

```text
src/
  app.ts
  middleware/
  modules/
    auth/
      application/
      domain/
      infrastructure/
      interfaces/
    business/
      application/
      domain/
      infrastructure/
      interfaces/
    organization/
      application/
      domain/
      infrastructure/
      public-api.ts
    queue/
      application/
      domain/
      infrastructure/
      interfaces/
  shared/
```

Capas transversales relevantes:

- `shared/infrastructure/prisma.ts`
- `shared/infrastructure/redis.ts`
- `shared/infrastructure/email.ts`
- `shared/infrastructure/logger.ts`
- `shared/utils/slug.ts` — `toBaseSlug` + `generateUniqueSlug` (autogenera slug kebab-case con fallback anti-colisión)
- `shared/EventBus.ts`
- `middleware/authenticate.ts`
- `middleware/authorize.ts`
- `middleware/rateLimiter.ts`
- `middleware/errorHandler.ts`

## Infraestructura disponible

### PostgreSQL

Usado para:

- usuarios
- sesiones de refresh token
- negocios

### Redis

Usado para:

- rate limiting
- tracking de intentos fallidos de login
- health checks

### Socket.IO

Existe un servidor Socket.IO inicializado en `app.ts`, pero actualmente solo se
usa para loguear conexiones y desconexiones.

### Email

Se usa `Resend` para:

- verificación de email
- recuperación de password
- bienvenida al negocio aprobado

## Estado de calidad actual

Comandos principales:

- `npm run typecheck`: ok
- `npm run typecheck:test`: ok
- `npm run build`: ok
- `npm run lint`: ok
- `npm run test:run`: ok con cobertura inicial de casos de uso de Épica 1

Validación manual de Épica 1:

- registro local validado con Postman
- verificación de email validada con token de desarrollo
- login local validado luego de verificar email
- forgot/reset password validado con token de desarrollo
- registro de negocio local validado con Postman
- verificación de email de negocio validada con token de desarrollo
- aprobación de negocio validada en base
- login de negocio aprobado validado con sesión refresh activa
- registro web de negocio con Google OAuth validado manualmente
- login web con Google OAuth validado manualmente con sesión refresh activa

Cobertura automatizada actual:

- tests unitarios de aplicación sobre use cases de `auth`
- test unitario de permisos para `auth:read_self` y `/auth/me`
- tests API con `supertest` para contratos HTTP base de auth y cookies
- tests dedicados de `rateLimiter` y `errorHandler`
- repositorios en memoria para aislar reglas de negocio
- mocks para servicios externos como email, intentos de login y token service
- sin HTTP real, Prisma real, Redis real ni proveedores externos reales

Casos cubiertos hasta ahora:

- login local exitoso, credenciales inválidas y cuenta negocio pendiente
- refresh token válido con rotación y token revocado
- forgot/reset password para cuenta local, respuesta genérica y bloqueo de reset en cuentas Google
- registro de negocio pendiente y rollback ante falla de email
- verificación de email, logout y aprobación de negocio
- registro/login Google con perfiles mockeados
- contratos API base para registro, login, refresh, logout, `/me` y URL OAuth
- rate limiting con Redis/fallback y serialización de errores

Pendiente para completar mejor Épica 1:

- tests de integración con Prisma/PostgreSQL y Redis
- test dedicado de reenvío de verificación
- validación automatizada de Resend real y Google real en staging

## Conclusión

El proyecto tiene una base técnica válida y una dirección arquitectónica
correcta, pero su lectura adecuada es la de una fase 1 avanzada, no la de un
MVP de producto completo.

## Épica 2.5 — Cuentas y Organizaciones (implementada en backend)

El backlog v2.1 formalizó como épica propia (9 pts, HU-2.5.1 a HU-2.5.4) lo
que antes era solo un documento de decisión. Bloqueaba la Fase 2 (Queue)
porque la Épica 3 necesita conocer cuántos `Business`/`Queue` habilita el
plan de una cuenta antes de operar.

Implementado:

- Nuevo módulo `src/modules/organization/` (`domain/`, `application/`,
  `infrastructure/`, `public-api.ts`) con `Organization`, `Membership`,
  `Subscription` y la grilla de planes (`PLAN_LIMITS`).
- Migración `20260627100000_add_organizations_memberships_subscriptions`:
  agrega las tres tablas y `businesses.organizationId`, con backfill 1:1 de
  Organization/Subscription BASIC/Membership ADMIN para todo `Business`
  existente, y rollback manual documentado en el propio `migration.sql`
  (HU-2.5.1).
- `Membership` resuelve rol por Organization (`ResolveEffectiveRoleUseCase`),
  sin tocar el campo `role` global del `User` (HU-2.5.2, HU-2.5.3).
- `EnsureBusinessCreationAllowedUseCase` aplica el límite de negocios por
  plan; está conectado en `RegisterBusinessUseCase`,
  `RegisterBusinessAccountUseCase` y `RegisterBusinessWithGoogleUseCase`, que
  ahora también crean la `Organization` del owner de forma transparente vía
  `CreateOrganizationForOwnerUseCase` (HU-2.5.4).
- `EnsureQueueCreationAllowedUseCase` y `UpdateOrganizationSubscriptionUseCase`
  (downgrade bloqueado si hay más `Business` que el límite nuevo) quedan
  implementados como piezas de dominio listas para que la Épica 3 y un futuro
  flujo de billing las consuman; no se exponen por HTTP en este pase.

Explícitamente fuera de alcance (así lo documenta el backlog): dónde vive la
aprobación comercial (Organization vs Business) y migrar
`middleware/authorize.ts` / los use cases de `business/` al rol efectivo de
`Membership`. Ver `docs/decision-modelo-cuentas-negocios.md`.

## Bugfixes pre-Épica 3 (2026-07-03)

Dos ramas fusionadas a `develop` antes de arrancar Épica 3:

### bugfix/h-2.1-business-category-entity (PR #26)

- `BusinessCategory` promovida a entidad real en Postgres
  (`business_categories`), reemplazando el mapa hardcodeado.
- Migración `20260703100000_add_business_categories`: crea tabla, siembra 9
  categorías conservando los UUIDs legacy, agrega FK `businesses.categoryId`.
- `GET /api/business/categories` — endpoint público, sin auth, devuelve el
  listado ordenado por nombre.
- `POST /api/business` y flujos de registro ahora validan que `categoryId`
  exista en la tabla.
- Endpoint de config de atributos `GET /api/business/categories/:categoryId/config`
  queda diferido a E8 (Backoffice).

### bugfix/pre-e3-schema-debt (PR #27)

- **Slug autogenerado**: los tres flujos de creación de negocio dejan de pedir
  `slug` / `businessSlug`; la lógica de generación vive en
  `src/shared/utils/slug.ts`.
- **`Business.status`** (`pending | approved | rejected | suspended`): nuevo
  campo con `pending` por defecto; actúa como compuerta de aprobación del
  equipo antes de habilitar el negocio.
- **`Subscription.status`** (`pending | trial | active | expired | cancelled`):
  ciclo de vida completo, con campos `trialEndsAt`, `cancellationReason` y
  `cancelledAt`.
- **`ApproveBusinessAccountUseCase`** reescrito: al aprobar el usuario, busca
  todos sus negocios pendientes, los marca `approved`, y arranca un trial de
  30 días en sus `Subscription` (`status → trial`, `trialEndsAt = now + 30d`).
- **Links de email corregidos**: `email.ts` usaba rutas con prefijo `/auth/`
  que no existían en el frontend; también se corrigió el puerto default de
  `APP_URL` en `.env.example` (`3000 → 5173`).

## Siguiente épica

La siguiente épica es `Épica 3 — Cola (Queue)`. El schema y los límites de
plan ya están listos. Puntos de entrada clave:

- `Queue`/`Turn` no tienen persistencia real en Postgres aún (solo domain
  stubs); el primer `CreateQueueUseCase` debe llamar a
  `EnsureQueueCreationAllowedUseCase` de `@modules/organization/public-api`
  antes de insertar.
- `Business.status` debe verificarse antes de permitir operaciones de cola;
  el check de ownership en use cases ya existe — solo hay que sumar la
  comprobación de `status === "approved"`.
- `ListMyBusinessesUseCase` no expone `Business.status` todavía; debe
  agregarse al output para que el panel frontend sepa el estado de aprobación.

Documentación de referencia:

- `docs/story-documentation-standard.md`
- `docs/epica-1-autenticacion-onboarding.md`
- `docs/epica-2-gestion-negocios.md`
- `docs/epica-2-5-cuentas-organizaciones.md`
- `docs/decision-modelo-cuentas-negocios.md`

Avance actual:

- `HU-2.1` implementada en backend con dirección textual.
- Persistencia extendida en `Business` con `address`, `latitude` y `longitude`
  opcionales.
- Visibilidad pública separada mediante `listingStatus`.
- Endpoint de actualización de perfil: `PATCH /api/business/:businessId/profile`.
- Google Maps queda en rollover justificado hasta la experiencia mobile de
  descubrimiento/mapa.
- `HU-2.2` implementada en backend para configurar y leer horarios semanales y
  días no laborables.
- Endpoints de horarios: `GET /api/business/:businessId/hours` y
  `PUT /api/business/:businessId/hours`.
- Regla base de disponibilidad pública preparada para que discovery mobile
  muestre solo negocios accionables en el MVP inicial.
- `HU-2.3` implementada en backend para configurar ventanillas o cajas activas.
- Endpoint de ventanillas activas:
  `PUT /api/business/:businessId/service-windows`.
- Un negocio con `0` ventanillas activas queda sin atención disponible para
  nuevos turnos, y queda preparado un servicio puro de estimación de espera para
  integrarse con la cola persistida en épicas posteriores.
- `HU-2.4` implementada en backend como canal QR de entrada a Espera.
- Endpoints de QR:
  `GET /api/business/:businessId/qr`,
  `POST /api/business/:businessId/qr/regenerate`,
  `GET /api/business/:businessId/qr.png` y `GET /api/qr/:token`.
- El QR apunta a `{APP_URL}/q/:token`, permite descarga PNG desde el panel y
  conserva el código anterior durante 24 horas al regenerar.
- `HU-2.5` implementada en backend para cambiar estado operativo del negocio.
- Endpoint de estado operativo:
  `PATCH /api/business/:businessId/operational-status`.
- Estados soportados: `normal`, `delayed`, `paused`, `closed`. `delayed`
  mantiene turnos habilitados con indicador amarillo; `paused` y `closed`
  bloquean nuevos turnos.
- Al cambiar a `closed`, se emite el evento `business.closed` para integración
  posterior con notificaciones push a turnos activos.
- `HU-2.6` implementada en backend para editar datos del negocio y exponer
  atributos de configuración por categoría.
- Endpoints relacionados:
  `PATCH /api/business/:businessId/profile` y
  `GET /api/business/categories/:categoryId/config`.
- `HU-2.8` implementada en backend para invitar empleados al panel.
- Endpoints relacionados:
  `POST /api/business/:businessId/employees/invitations`,
  `GET /api/business/:businessId/employees`,
  `POST /api/business/employee-invitations/:token/accept` y
  `DELETE /api/business/:businessId/employees/:userId`.
- La revocación marca la membresía como revocada e invalida las refresh
  sessions activas del empleado.
- Bugfix: `GET /api/business/me` resuelve los negocios del usuario autenticado
  (`ownerUserId`), reemplazando el campo `businessId` muerto que nunca se
  firmaba en el JWT. Ver `docs/epica-2-gestion-negocios.md`.
