# Espera Backend

Backend principal de producto para Espera. Expone API REST para autenticacion,
registro de negocios y bases iniciales para colas, junto con infraestructura de
Redis, PostgreSQL, JWT, email y Socket.IO.

## Estado del proyecto

El alcance implementado y validado hasta ahora corresponde principalmente a la
Epica 1 hasta `HU-1.9`, con foco en autenticacion y onboarding de negocios.

Historias en buen estado de avance:

- `HU-1.1` Registro de usuario con email y password
- `HU-1.3` Login con email y password
- `HU-1.5` Refresh token
- `HU-1.6` Logout con invalidacion de sesion
- `HU-1.7` Recuperacion de password
- `HU-1.8` Registro de negocio con cuenta pendiente
- `HU-1.9` Flujo OAuth para negocio en panel web

Historias en rollover justificado:

- `HU-1.2` Registro de usuario con Google en app movil
- `HU-1.4` Login de usuario con Google en app movil

Motivo: dependen de configuracion real de OAuth por plataforma (`iOS` y
`Android`) y del alta previa de la app en el ecosistema correspondiente.

Desde Epica 2 en adelante, el repositorio contiene base tecnica y contratos
iniciales, pero no debe interpretarse como implementacion funcional cerrada.

La Epica 2.5 - Cuentas y Organizaciones (`HU-2.5.1` a `HU-2.5.4`) ya esta
implementada en backend: introduce `Organization`, `Membership` y
`Subscription` para que una cuenta pueda agrupar varias sucursales segun su
plan (Basic/Pro/Premium), sin romper el modelo de `Business` de Epica 2.
Bloqueaba la Epica 3 (Queue), que ahora puede arrancar.

## Stack

- Node.js + TypeScript
- Express
- Prisma + PostgreSQL
- Redis
- JWT + cookies
- Socket.IO
- Zod
- Resend
- Pino

## Arquitectura

El proyecto esta organizado como un `Modular Monolith` con cuatro modulos
principales:

- `auth`: registro, login, refresh token, recuperacion de password, RBAC
- `business`: registro y configuracion base de negocios (sucursales)
- `organization`: cuentas multi-sucursal (`Organization`, `Membership`,
  `Subscription` y limites por plan)
- `queue`: base inicial para turnos y cola

Estructura principal:

```text
src/
  app.ts
  middleware/
  modules/
    auth/
    business/
    organization/
    queue/
  shared/
```

Documentacion adicional:

- [Estado y arquitectura](D:/Programacion/SaaS/Espera/espera-back/docs/project-status.md)
- [Epica 2 - Gestion de Negocios](D:/Programacion/SaaS/Espera/espera-back/docs/epica-2-gestion-negocios.md)
- [Epica 2.5 - Cuentas y Organizaciones](D:/Programacion/SaaS/Espera/espera-back/docs/epica-2-5-cuentas-organizaciones.md)
- [Decision de modelo de cuentas y negocios](D:/Programacion/SaaS/Espera/espera-back/docs/decision-modelo-cuentas-negocios.md)
- [Estrategia de calidad y testing](D:/Programacion/SaaS/Espera/espera-back/docs/quality-and-testing.md)
- [Pruebas manuales con Postman - Epica 1](D:/Programacion/SaaS/Espera/espera-back/docs/postman-epica-1.md)
- [Roadmap de implementacion](D:/Programacion/SaaS/Espera/espera-back/docs/implementation-roadmap.md)

## Requisitos

- Node.js 22+
- npm 10+
- PostgreSQL
- Redis

## Variables de entorno

Partir de `.env.example`.

Variables principales:

- `PORT`
- `NODE_ENV`
- `APP_ORIGIN`
- `API_PREFIX`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `COOKIE_SECRET`
- `TRUST_PROXY` (obligatoria detrás de un proxy: el rate limit y el bloqueo
  de login agrupan por `request.ip`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `GOOGLE_MAPS_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_URL`

## Puesta en marcha local

1. Instalar dependencias:

```bash
npm install
```

2. Levantar infraestructura local:

```bash
docker-compose up -d
```

3. Configurar `.env` a partir de `.env.example`

4. Generar cliente Prisma si hace falta:

```bash
npm exec prisma generate
```

5. Ejecutar en modo desarrollo:

```bash
npm run dev
```

## Scripts

- `npm run dev`: desarrollo con recarga
- `npm run build`: compila TypeScript a `dist`
- `npm run start`: ejecuta la build compilada
- `npm run lint`: corre ESLint
- `npm run typecheck`: chequeo de tipos sin emitir archivos
- `npm run typecheck:test`: chequeo de tipos incluyendo tests y config de Vitest
- `npm run test:run`: corre la suite automatizada una vez (sin base de datos)
- `npm run test:integration:setup`: aplica las migraciones a `espera_test`
- `npm run test:integration`: corre los tests contra Postgres y Redis reales

## Integración continua

`.github/workflows/ci.yml` corre en cada push y pull request a `develop`/`main`:
tipos (src y tests), lint, suite unitaria/API, build, tests de integración
contra Postgres y Redis reales, `npm audit` y el build de la imagen Docker.

## Imagen Docker

```bash
docker build -t espera-backend .
docker run --rm -p 3000:3000 --env-file .env espera-backend
```

Imagen multi-etapa: compila con las dependencias completas y publica solo
`dist` más las de producción, como usuario `node`. Antes de arrancar una
versión nueva hay que aplicar las migraciones:

```bash
npx prisma migrate deploy
```

El proceso maneja `SIGTERM`/`SIGINT`: deja de aceptar conexiones, cierra
Socket.IO, Redis y Prisma, y responde `503` en `/health` mientras drena.

## Despliegue en Render

`render.yaml` declara el servicio web (a partir del `Dockerfile`), el Postgres
y el Redis. Se crea todo con Blueprints → *New Blueprint Instance* apuntando al
repo; los secretos marcados `sync: false` se cargan una vez en el dashboard.

Variables que hay que setear a mano: `APP_ORIGIN` (el backend no arranca en
producción sin ella), `JWT_ACCESS_SECRET`, `COOKIE_SECRET`, `APP_URL`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` y las tres de Google si se usa OAuth.

### Migraciones

`preDeployCommand` corre `npx prisma migrate deploy` en la imagen ya
construida, antes de mandarle tráfico: si una migración falla, esa versión no
llega a atender. Requiere un plan pago. En el plan free hay que sacar esa línea
y aplicarlas a mano contra la base de Render:

```bash
DATABASE_URL='<external connection string>' npx prisma migrate deploy
```

### Health check

`healthCheckPath: /health` decide si la instancia recibe tráfico. El código de
respuesta distingue tres casos:

| Situación | Código | `status` |
| --- | --- | --- |
| Postgres y Redis responden | 200 | `ok` |
| Redis caído, Postgres arriba | 200 | `degraded` |
| Postgres caído | 503 | `unavailable` |
| Apagándose (`SIGTERM`) | 503 | `shutting_down` |

Redis caído devuelve 200 a propósito: el rate limiter y el contador de intentos
de login caen a memoria por proceso y lo registran en el log, así que sacar la
instancia de rotación convertiría una degradación prevista en una caída.

### `TRUST_PROXY`

Render termina TLS en su proxy, así que `request.ip` sale de `X-Forwarded-For`.
`render.yaml` lo fija en `1` (un solo salto). Si quedara sin setear, todos los
clientes comparten el mismo bucket de rate limit y el mismo bloqueo de login;
si fuera más alto, un cliente puede falsificar el header y elegir su bucket.

## Endpoints principales

Base prefix: `API_PREFIX`, por defecto `/api`.

Auth:

- `POST /api/auth/register`
- `POST /api/auth/register-business`
- `GET /api/auth/google/url`
- `POST /api/auth/register-business/google`
- `PATCH /api/auth/business-accounts/:userId/approve`
- `GET /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/login`
- `POST /api/auth/login/google`
- `POST /api/auth/refresh-token`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Business:

- `POST /api/business`
- `POST /api/business/configure-queue`

Queue:

- `POST /api/queue/turns`
- `POST /api/queue/turns/call-next`
- `POST /api/queue/turns/cancel`

Healthcheck:

- `GET /health`

## Calidad actual

Estado actual de comandos principales:

- `typecheck`: pasa
- `typecheck:test`: pasa
- `build`: pasa
- `lint`: pasa
- `test:run`: pasa

Cobertura automatizada inicial:

- use cases de login, refresh token, reset password y registro de negocio
- tests unitarios de aplicacion con repositorios en memoria y mocks
- todavia no cubre contratos HTTP, Prisma real, Redis real ni OAuth real
