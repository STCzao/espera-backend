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
- Bloquea cuentas de negocio pendientes de aprobación.
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

## HU-1.8 - Registro de Negocio con Cuenta Pendiente

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir que un negocio solicite acceso al panel y quede pendiente de revisión.

### Contrato Backend

```text
POST /api/auth/register-business
PATCH /api/business/:businessId/approve
```

`POST /api/auth/register-business` pertenece al onboarding público del negocio.
`PATCH /api/business/:businessId/approve` se documenta acá porque cierra el
estado comercial del negocio creado, pero su superficie funcional es
`super_admin`: requiere autenticación y permiso
`platform:approve_business`. No debe implementarse como paso accesible
desde el flujo público de registro.

### Modelo y Persistencia

- `User.role: BUSINESS_ADMIN`
- `Business.approvalStatus: PENDING | APPROVED | REJECTED`

### Reglas de Negocio

- El owner puede iniciar sesión aunque alguno de sus negocios siga pendiente.
- Un negocio pendiente no puede considerarse disponible públicamente.
- La aprobación requiere permiso `platform:approve_business`.
- La aprobación envía email de bienvenida best-effort.

### Cobertura

- Tests unitarios de registro, rollback y aprobación.
- Escenarios manuales en Postman.

## HU-1.9 - OAuth para Negocio en Panel Web

Story points: no normalizado en backlog actual.

Estado: `implementado`.

### Objetivo de Producto

Permitir registro y login de negocios desde el panel web usando Google OAuth.

### Contrato Backend

```text
GET /api/auth/google/url
POST /api/auth/register-business/google
POST /api/auth/login/google
```

### Reglas de Negocio

- Usa cookie firmada `googleOAuthState` para validar CSRF.
- Requiere email verificado por Google.
- Distingue cuenta existente, cuenta pendiente y mismatch de proveedor.
- El callback visual pertenece al frontend, no al backend.

### Cobertura

- Tests unitarios con perfiles Google mockeados.
- Escenarios manuales en Postman para URL OAuth, registro y login.

## Riesgos y Pendientes Transversales

- Tests de integración con PostgreSQL y Redis reales.
- Validación staging con Resend real.
- Validación OAuth real fuera de entorno local.
- Cierre de historias mobile diferidas cuando exista app registrada.
