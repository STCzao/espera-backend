# Épica 1 - Autenticación y Onboarding

## Resumen

La Épica 1 cubre el acceso inicial a Espera: registro, login, sesiones,
verificación de email, recuperación de password y onboarding de cuentas de
negocio. El foco real implementado está en backend y panel web de negocio.

Documento de validación manual complementario:

- `docs/postman-epica-1.md`

Formato de referencia:

- `docs/story-documentation-standard.md`

## Estado General

- Estado: `implementado parcialmente`.
- Historias implementadas: `HU-1.1`, `HU-1.3`, `HU-1.5`, `HU-1.6`, `HU-1.7`,
  `HU-1.8`, `HU-1.9`.
- Historias diferidas: `HU-1.2`, `HU-1.4`.
- Motivo principal de diferidos: OAuth mobile requiere configuración real por
  plataforma y alta de la app móvil.

## HU-1.1 - Registro con Email y Password

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir que una persona cree una cuenta local con email y password.

### Criterios de Aceptación

- El usuario puede registrarse con datos válidos.
- El email queda pendiente de verificación.
- No se permite registrar un email duplicado.
- Los errores de validación se devuelven con mensajes específicos.

### Contrato Backend

```text
POST /api/auth/register
GET /api/auth/verify-email
POST /api/auth/resend-verification
```

### Modelo y Persistencia

- `User`
- `passwordHash`
- `authProvider: LOCAL`
- `isEmailVerified`
- `emailVerificationToken`
- `emailVerificationExpiry`
- `lastVerificationSentAt`

### Reglas de Negocio

- Password local con hash `bcrypt`.
- Email normalizado a lowercase.
- Email duplicado responde conflicto.
- Si falla el envío de email de verificación, el usuario creado se revierte.

### Eventos e Integraciones

- Email de verificación vía Resend cuando está configurado.
- En desarrollo/test, el link puede quedar logueado para prueba manual.
- Evento `user.registered`.

### Cobertura

- Tests unitarios de registro y verificación.
- Escenarios manuales en `docs/postman-epica-1.md`.

## HU-1.2 - Registro de Usuario con Google en App Móvil

Story points: no normalizado en backlog actual.

Estado: `diferido`.

### Objetivo de Producto

Permitir registro de usuarios mobile con Google.

### Decisiones de Alcance

Queda diferido por depender de credenciales OAuth reales por plataforma,
redirect/deep links mobile y alta de la app en el ecosistema correspondiente.

### Contratos Diferidos

- Credenciales OAuth para iOS.
- Credenciales OAuth para Android.
- Contrato mobile de intercambio de token/código.

### Cobertura

- No hay validación end-to-end mobile en esta épica.

## HU-1.3 - Login con Email y Password

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir que usuarios locales autenticados accedan a Espera.

### Contrato Backend

```text
POST /api/auth/login
GET /api/auth/me
```

`POST /api/auth/login` devuelve `accessToken` y `refreshToken`, y además setea
la cookie `refreshToken` httpOnly. El frontend web debe preferir la cookie para
rotación y logout; el `refreshToken` en body se conserva por compatibilidad con
clientes manuales/mobile y escenarios Postman.

### Reglas de Negocio

- Requiere email verificado.
- Permite login a `business_admin` con `approvalStatus: pending` — el usuario ve su negocio en revisión desde el panel.
- Bloquea `business_admin` con `approvalStatus: rejected`.
- Valida credenciales con hash.
- Registra intentos fallidos con Redis/fallback.

### Cobertura

- Tests unitarios de login.
- Test API de `/auth/me`.
- Escenarios manuales en Postman.

## HU-1.4 - Login de Usuario con Google en App Móvil

Story points: no normalizado en backlog actual.

Estado: `diferido`.

### Objetivo de Producto

Permitir login mobile con Google.

### Decisiones de Alcance

Queda diferido por la misma dependencia externa de `HU-1.2`: configuración
OAuth real por plataforma y flujo mobile definitivo.

### Contratos Diferidos

- Login Google mobile.
- Deep links o redirect mobile.
- Validación end-to-end en app instalada.

## HU-1.5 - Refresh Token

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Mantener sesiones activas sin pedir login constante.

### Contrato Backend

```text
POST /api/auth/refresh-token
```

El endpoint lee el refresh token desde la cookie httpOnly `refreshToken` y, como
fallback explícito, desde `body.refreshToken`. La respuesta mantiene el nuevo
`refreshToken` en body además de actualizar la cookie; por lo tanto el contrato
actual no es estrictamente cookie-only.

### Modelo y Persistencia

- `RefreshSession`
- `tokenHash`
- `expiresAt`
- `revokedAt`

### Reglas de Negocio

- Refresh token persistido por hash.
- Rotación de refresh token.
- Rechazo de tokens revocados o vencidos.
- Cookie `refreshToken` httpOnly.

### Cobertura

- Tests unitarios de refresh válido, rotación y token revocado.
- Tests API de cookies.

## HU-1.6 - Logout

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir cerrar sesión e invalidar la sesión activa.

### Contrato Backend

```text
POST /api/auth/logout
```

### Reglas de Negocio

- Revoca la sesión asociada al refresh token.
- Limpia cookie `refreshToken`.

### Cobertura

- Tests unitarios y API de logout.
- Escenarios manuales en Postman.

## HU-1.7 - Recuperación de Password

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir que una cuenta local recupere acceso mediante token temporal.

### Contrato Backend

```text
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

Convención frontend: el email apunta a `/auth/reset-password?token=:token`.
La pantalla debe extraer ese query param y enviarlo en el body de
`POST /api/auth/reset-password` junto con la nueva password.

### Reglas de Negocio

- Respuesta genérica para no revelar existencia de email.
- Cuentas Google no generan password local.
- Reset invalida sesiones activas.
- Token de reset tiene expiración y uso único.

### Cobertura

- Tests unitarios de request/reset.
- Escenarios manuales en Postman.

## HU-1.8 - Registro de Negocio desde Cuenta Autenticada

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir que un usuario autenticado registre su negocio desde el panel. El
negocio queda pendiente de revisión; el usuario conserva acceso normal a su
cuenta durante la espera.

### Flujo

```text
1. POST /api/auth/register          → crea cuenta (role: user), envía email de verificación
2. GET  /api/auth/verify-email      → verifica email
3. POST /api/auth/login             → tokens (JWT role: user)
4. POST /api/business               → crea negocio; promueve usuario a business_admin + pending
                                      devuelve { businessId, businessSlug, status: "pending" }
5. POST /api/auth/refresh-token     → llamar inmediatamente; nuevo JWT refleja role: business_admin
```

### Contrato Backend

```text
POST /api/business                                        ← requiere autenticación
PATCH /api/auth/business-accounts/:userId/approve         ← requiere platform:approve_business_account
```

`POST /api/auth/register-business` está **deprecado** (flujo anterior a
backlog v2.2). Permanece activo hasta que el frontend complete la migración.

> **Actualizado (backlog v2.4 — aprobación en dos niveles)**: desde el
> refinamiento `bugfix/two-level-approval`, `PATCH
> /api/auth/business-accounts/:userId/approve` **ya no aprueba el
> `Business` ni arranca el trial**. Solo aprueba la cuenta/login del
> usuario (`User.approvalStatus`). La aprobación comercial real vive en
> `PATCH /api/organizations/:organizationId/approve` (una vez) y luego
> `PATCH /api/business/:businessId/approve` (por cada sucursal, requiere la
> Organization ya aprobada) — ver
> `docs/epica-2-5-cuentas-organizaciones.md`, sección de refinamiento, para
> el contrato completo.

### Modelo y Persistencia

- `User.role: user → business_admin` (en el momento del registro del negocio)
- `User.approvalStatus: pending → approved` (vía `PATCH
  /api/auth/business-accounts/:userId/approve` — solo gate de cuenta/login)
- `Organization.status: pending → approved` (vía `PATCH
  /api/organizations/:organizationId/approve` — independiente de lo anterior)
- `Business.status: pending → approved` (vía `PATCH
  /api/business/:businessId/approve` — requiere Organization ya aprobada)
- `Subscription.status: pending → trial` (al aprobar el `Business`, trial de
  30 días — ya no al aprobar la cuenta)

### Reglas de Negocio

- El usuario con negocio pendiente **puede iniciar sesión** y ver el estado de revisión en el panel.
- Solo `role: user` o `role: business_admin` pueden llamar `POST /api/business`.
- La aprobación de cuenta (`platform:approve_business_account`) y la
  aprobación comercial (`platform:manage_approvals`, Organization/Business
  por separado) son permisos y flujos distintos — ver refinamiento en
  `docs/epica-2-5-cuentas-organizaciones.md`.
- La aprobación de cuenta fuerza `isEmailVerified: true`. Ya no envía email
  ni toca `Business`/`Subscription`.
- El trial de 30 días arranca al aprobar el `Business` (no la cuenta).

### Cobertura

- Tests unitarios de registro, promoción de rol y aprobación.
- Escenarios manuales en Postman.

## HU-1.9 - OAuth para Panel Web

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir login y registro de usuarios desde el panel web usando Google OAuth.
Un solo botón de Google sirve para ambos casos — el backend crea la cuenta si
no existe (find-or-create).

### Flujo

```text
1. GET  /api/auth/google/url        → devuelve { url, state }; redirigir al usuario
2. Google callback → frontend recibe code + state en /oauth/google/callback
3. POST /api/auth/login/google      → { code, state }
                                      si el email no existe: crea cuenta (role: user)
                                      si existe: login normal
                                      devuelve { accessToken, refreshToken }
4. POST /api/business               → (si quiere registrar negocio) igual que HU-1.8 paso 4
```

### Contrato Backend

```text
GET  /api/auth/google/url
POST /api/auth/login/google
```

`POST /api/auth/register-business/google` está **deprecado** (flujo anterior a
backlog v2.2). Permanece activo hasta que el frontend complete la migración.

`GOOGLE_CALLBACK_URL` en `.env` debe apuntar al frontend
(`http://localhost:5173/oauth/google/callback`), no al backend. El backend no
implementa ni debe implementar `GET /auth/google/callback`.

### Reglas de Negocio

- Usa cookie firmada `googleOAuthState` para validar CSRF.
- Requiere email verificado por Google (`emailVerified: true`).
- Si el email no tiene cuenta: la crea con `role: user`, `authProvider: google`, `isEmailVerified: true`.
- Si el email ya tiene cuenta con `authProvider: local`: rechaza con `AUTH_PROVIDER_MISMATCH`.
- Si el `googleId` no coincide con el registrado: rechaza con `GOOGLE_ACCOUNT_MISMATCH`.
- `business_admin` con `approvalStatus: rejected`: rechaza con `ACCOUNT_REJECTED`.
- `business_admin` con `approvalStatus: pending`: permite login (ve el panel con estado de revisión).

### Cobertura

- Tests unitarios con perfiles Google mockeados, incluyendo caso find-or-create.
- Escenarios manuales en Postman para URL OAuth y login/registro.

## Riesgos y Pendientes Transversales

- Tests de integración con PostgreSQL y Redis reales.
- Validación staging con Resend real.
- Validación OAuth real fuera de entorno local.
- Cierre de historias mobile diferidas cuando exista app registrada.
