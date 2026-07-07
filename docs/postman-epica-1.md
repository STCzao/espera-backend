# Pruebas Manuales con Postman - Epica 1

## Proposito

Postman se usa como validacion manual guiada de contratos HTTP para Epica 1.
Complementa la suite automatizada de Vitest, pero no la reemplaza.

La suite automatizada actual prueba use cases de aplicacion con fakes en
memoria. Postman permite validar el comportamiento real expuesto por Express:

- rutas
- status codes
- payloads
- cookies
- headers
- mensajes de error
- integracion con infraestructura local

## Requisitos

Antes de ejecutar los escenarios:

1. Instalar dependencias:

```bash
npm install
```

2. Levantar PostgreSQL y Redis.

Con Docker:

```bash
docker-compose up -d
```

Sin Docker:

- usar PostgreSQL instalado localmente o una base remota de desarrollo
- configurar `DATABASE_URL` en `.env`
- Redis puede quedar pendiente para una primera validacion manual, porque rate
  limit e intentos de login tienen fallback en memoria
- si Redis no esta disponible, `GET /health` puede responder `503` con
  `cache: false`

3. Configurar `.env` a partir de `.env.example`.

4. Aplicar migraciones si corresponde:

```bash
npm exec prisma migrate dev
```

5. Levantar el backend:

```bash
npm run dev
```

Base URL local esperada:

```text
http://localhost:3000/api
```

Healthcheck:

```text
GET http://localhost:3000/health
```

Nota para entorno sin Docker: si Redis no esta instalado, el healthcheck puede
quedar degradado. Para probar Epica 1 con Postman, lo mas importante es que
PostgreSQL este disponible y migrado.

## Puesta en marcha sin Docker

Si no tenes Docker instalado, el flujo minimo recomendado es:

1. Tener una base PostgreSQL disponible.

Puede ser:

- PostgreSQL instalado localmente en Windows
- PostgreSQL dentro de WSL
- una base remota de desarrollo

2. Configurar `DATABASE_URL` en `.env`.

Ejemplo local:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/espera
```

3. Aplicar migraciones:

```bash
npm exec prisma migrate dev
```

4. Regenerar Prisma Client si hace falta:

```bash
npm exec prisma generate
```

5. Levantar el backend:

```bash
npm run dev
```

6. Probar:

```text
GET http://localhost:3000/health
```

Para una primera ronda de Postman, Redis puede quedar apagado. Vas a ver
`cache: false` en healthcheck y logs de conexion a Redis, pero los flujos de
auth que usan rate limit pueden seguir usando fallback en memoria.

## Variables sugeridas en Postman

Crear un environment con:

| Variable | Valor inicial |
| --- | --- |
| `baseUrl` | `http://localhost:3000/api` |
| `accessToken` | vacio |
| `refreshToken` | vacio |
| `verificationToken` | vacio |
| `resetToken` | vacio |
| `businessUserId` | vacio |
| `businessId` | vacio |

Postman puede guardar automaticamente `accessToken` desde la respuesta de
login. El refresh token tambien puede viajar como cookie `httpOnly`, por lo que
puede no estar disponible para scripts si se usa solo cookie.

## Escenarios recomendados

### 1. Healthcheck

Request:

```text
GET {{baseUrl}}/../health
```

Resultado esperado:

- `200` si PostgreSQL y Redis estan disponibles
- `503` si algun componente esta degradado

### 2. Registro local

Request:

```text
POST {{baseUrl}}/auth/register
```

Body:

```json
{
  "email": "cliente@example.com",
  "password": "Password1",
  "firstName": "Cliente",
  "lastName": "Demo"
}
```

Resultado esperado:

- `201`
- respuesta con `userId`
- usuario creado como `USER`
- email pendiente de verificacion

Observacion: si Resend no esta configurado con credenciales validas, este flujo
no envia un email real en desarrollo. En su lugar, el backend escribe en consola
un log con el `url` de verificacion para poder continuar la prueba manual.

### 3. Verificacion de email

Si Resend no esta configurado, copiar desde la consola del backend el campo
`url` del log:

```text
Email delivery skipped because Resend is not configured; use logged URL for local testing
```

El link tiene esta forma:

```text
http://localhost:3000/auth/verify-email?token=...
```

Para probarlo contra la API, usar solo el token:

Request:

```text
GET {{baseUrl}}/auth/verify-email?token={{verificationToken}}
```

Resultado esperado:

- `200`
- mensaje de email verificado correctamente
- el usuario queda con `isEmailVerified: true`

### 4. Login local antes de verificar email

Request:

```text
POST {{baseUrl}}/auth/login
```

Body:

```json
{
  "email": "cliente@example.com",
  "password": "Password1"
}
```

Resultado esperado:

- `403`
- codigo funcional `EMAIL_NOT_VERIFIED`

### 5. Login local exitoso

Este escenario requiere que el usuario este verificado en base de datos.

Request:

```text
POST {{baseUrl}}/auth/login
```

Body:

```json
{
  "email": "cliente@example.com",
  "password": "Password1"
}
```

Resultado esperado:

- `200`
- `accessToken` en el body
- `refreshToken` en el body
- cookie `refreshToken` seteada

Guardar `accessToken` en la variable `accessToken`.

### 6. Refresh token

Request:

```text
POST {{baseUrl}}/auth/refresh-token
```

Resultado esperado:

- `200`
- nuevo `accessToken`
- nuevo `refreshToken`
- cookie `refreshToken` actualizada

### 7. Me

Request:

```text
GET {{baseUrl}}/auth/me
Authorization: Bearer {{accessToken}}
```

Resultado esperado:

- `200`
- datos del usuario autenticado

Nota: esta ruta sirve para detectar errores de permisos transversales.

### 8. Logout

Request:

```text
POST {{baseUrl}}/auth/logout
```

Resultado esperado:

- `200`
- cookie `refreshToken` limpiada
- el refresh token anterior deja de ser valido

### 9. Forgot password

Request:

```text
POST {{baseUrl}}/auth/forgot-password
```

Body:

```json
{
  "email": "cliente@example.com"
}
```

Resultado esperado:

- `200`
- respuesta generica aunque el email exista o no
- si el usuario existe, queda token de recuperacion y se intenta enviar email
- sin Resend configurado, el backend loguea el `url` de recuperacion

Regla con OAuth:

- si la cuenta es `LOCAL`, se genera token de recuperacion
- si la cuenta es `GOOGLE`, no se genera token local y la respuesta sigue siendo
  generica para no revelar si el email existe
- el usuario Google debe recuperar acceso desde Google, no desde password local

### 10. Reset password

Request:

```text
POST {{baseUrl}}/auth/reset-password
```

Body:

```json
{
  "token": "{{resetToken}}",
  "password": "NewPassword1",
  "confirmPassword": "NewPassword1"
}
```

Resultado esperado:

- `200`
- password actualizada
- sesiones activas revocadas

Para cuentas Google, cualquier intento de reset debe responder como link
invalido o expirado.

### 11. Registro de negocio (flujo autenticado — HU-1.8)

El registro de negocio requiere una cuenta verificada y sesion activa. El flujo
completo es: registrar cuenta (escenario 2) → verificar email (escenario 3) →
login (escenario 5) → registrar negocio.

Con el `accessToken` del login (role: user):

Request:

```text
POST {{baseUrl}}/business
Authorization: Bearer {{accessToken}}
```

Body:

```json
{
  "name": "Cafe Espera",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "address": "Av. Corrientes 1234, CABA"
}
```

Resultado esperado:

- `201`
- `businessId`: guardar en variable `businessId`
- `businessSlug`: identificador publico para navegacion
- `status`: `pending`

Inmediatamente despues llamar refresh-token para obtener JWT con role: business_admin:

```text
POST {{baseUrl}}/auth/refresh-token
```

Nota: `POST /api/auth/register-business` sigue activo pero esta deprecado.
No usarlo en flujos nuevos.

### 12. Login con negocio pendiente

Un usuario con negocio en estado `pending` puede iniciar sesion normalmente
y ver el estado de revision desde el panel.

Request:

```text
POST {{baseUrl}}/auth/login
```

Body:

```json
{
  "email": "owner@example.com",
  "password": "Password1"
}
```

Resultado esperado:

- `200`
- `accessToken` y `refreshToken`
- el panel muestra el negocio en estado "En revision"

### 13. Aprobacion de negocio

Requiere un usuario autenticado con rol `SUPER_ADMIN`.

Request:

```text
PATCH {{baseUrl}}/auth/business-accounts/{{businessUserId}}/approve
Authorization: Bearer {{accessToken}}
```

Resultado esperado:

- `200`
- `approvalStatus`: `approved`
- email de bienvenida best-effort

### 14. Login / Registro con Google OAuth (HU-1.9)

`POST /api/auth/login/google` implementa find-or-create: si el email de Google
no tiene cuenta en Espera, la crea automaticamente (role: user). El mismo
endpoint sirve para el boton de Google en login y en registro.

Antes de probar, configurar credenciales en Google Cloud Console:

```text
https://console.cloud.google.com/apis/credentials
```

Registrar este redirect URI exacto (debe coincidir con `GOOGLE_CALLBACK_URL` en `.env`):

```text
http://localhost:5173/oauth/google/callback
```

`.env`:

```env
GOOGLE_CALLBACK_URL=http://localhost:5173/oauth/google/callback
```

Paso 1 — obtener URL de autorizacion:

```text
GET {{baseUrl}}/auth/google/url
```

Resultado esperado:

- `200`
- respuesta con `url` y `state`
- cookie firmada `googleOAuthState`

Paso 2 — abrir el valor de `url` en el navegador. Google redirige a
`/oauth/google/callback` con query params `code` y `state`.

Paso 3 — desde el frontend (o Postman conservando la cookie del navegador):

```text
POST {{baseUrl}}/auth/login/google
```

Body:

```json
{
  "code": "code-devuelto-por-google",
  "state": "state-devuelto-por-google"
}
```

Resultado esperado (cuenta nueva o existente aprobada/pendiente):

- `200`
- `accessToken` y `refreshToken`
- cookie `refreshToken` seteada

Si la cuenta es nueva (role: user), para registrar un negocio continuar con
escenario 11.

Resultado esperado si el email existe con cuenta local:

- `400`
- codigo funcional `AUTH_PROVIDER_MISMATCH`

Notas:

- La llamada debe conservar la cookie `googleOAuthState` emitida en el paso 1.
- Si aparece `GOOGLE_OAUTH_STATE_MISMATCH`, generar una URL nueva y repetir.
- Si aparece `redirect_uri_mismatch`, verificar que el Redirect URI en Google
  Cloud Console coincida exactamente con `GOOGLE_CALLBACK_URL` en `.env`.
- El backend no expone `GET /api/auth/google/callback`; el callback pertenece al frontend.
- `POST /api/auth/register-business/google` esta deprecado; no usarlo.

### 15. Login con Google OAuth — cuenta con negocio pendiente

Un usuario con negocio en estado `pending` puede iniciar sesion con Google
normalmente. No hay bloqueo por `pending`.

Seguir los mismos pasos del escenario 14. Resultado esperado:

- `200`
- `accessToken` y `refreshToken`
- el panel muestra el negocio en estado "En revision"

## Evidencia sugerida

Para cada corrida manual registrar:

- fecha
- ambiente
- version o branch
- escenario
- request relevante
- status code obtenido
- resultado observado
- deuda o bug detectado

## Criterio de uso

Postman debe usarse especialmente para:

- validar manualmente una historia antes de cerrarla
- reproducir bugs reportados desde frontend
- comprobar cookies y headers
- verificar integraciones reales en local o staging

Cuando un escenario de Postman detecta un bug critico o una regresion probable,
ese caso deberia convertirse luego en test automatizado de API o integracion.

## Troubleshooting

### `ioredis ECONNREFUSED`

Significa que el backend intento conectarse a Redis y no encontro un servicio
escuchando en `REDIS_URL`, normalmente `redis://localhost:6379`.

Acciones:

- confirmar que Redis este levantado
- revisar `REDIS_URL` en `.env`
- ejecutar `GET /health` y verificar el campo `cache`

En desarrollo algunos flujos tienen fallback en memoria para rate limit e
intentos de login, pero Redis debe estar disponible para validar el ambiente
local de forma completa.

### Resend no configurado

En `development` y `test`, si `RESEND_API_KEY` esta vacia o conserva el
placeholder `re_your_api_key`, el backend no intenta enviar email real. En su
lugar loguea el link que se hubiera enviado.

Esto permite probar manualmente:

- verificacion de email
- recuperacion de password
- aprobacion de negocio con email de bienvenida best-effort

En `production`, Resend sigue siendo obligatorio.

### OAuth, verificacion y recuperacion de password

Las cuentas creadas por Google se guardan con `authProvider: GOOGLE` y
`isEmailVerified: true`, porque Google ya informa si el email fue verificado.
Por eso:

- no requieren email de verificacion de Espera
- no deberian usar `forgot-password`
- no deberian poder crear una password local mediante `reset-password`
- el login debe hacerse por el flujo Google

Las cuentas locales se guardan con `authProvider: LOCAL` y si requieren:

- verificacion de email por token de Espera
- recuperacion de password por token de Espera

### `The column users.approvalStatus does not exist`

Significa que el Prisma Client espera el esquema actual, pero la base de datos
esta en una version anterior. En este proyecto esa columna se agrega en la
migracion `20260602130000_expand_auth_and_business_schema`.

Acciones:

1. Revisar que `DATABASE_URL` apunte a la base local correcta.
2. Aplicar migraciones pendientes:

```bash
npm exec prisma migrate dev
```

3. Regenerar cliente Prisma si hace falta:

```bash
npm exec prisma generate
```

4. Reiniciar el backend.

Si la base local no contiene datos importantes y esta desalineada, puede ser mas
simple recrearla y aplicar migraciones desde cero.
