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

## Base de datos local

Los datos de Postgres viven en `./data/postgres` (bind mount declarado en
`docker-compose.yml`), no en un volumen nombrado de Docker. Reinstalar Docker
Desktop o hacer *reset to factory defaults* borra los volúmenes nombrados,
pero no toca esa carpeta. Está en `.gitignore`.

Levantá siempre con **`docker compose up -d`**, no con `docker run -v ...`:
desde Git Bash en Windows, `$(pwd)` se mangla y el contenedor arranca
igual pero escribe los datos en otro lado, así que se pierden sin ningún
error visible. Compose resuelve las rutas relativas por su cuenta y no tiene
ese problema.

Las credenciales salen de `.env` (partí de `.env.example`). `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB` y `POSTGRES_PORT` los lee el contenedor;
`DATABASE_URL` la lee la app. Son la misma base vista de dos lados: si
cambiás una, actualizá la otra.

### Datos de desarrollo (seed)

Una base recién migrada sólo trae las categorías de rubro. Para tener un
escenario usable en cualquier PC, sin registrar nada a mano:

```bash
docker compose up -d
npx prisma migrate deploy
npm run db:seed
```

Eso crea: super admin, dueño con negocio aprobado (plan PRO en trial), cola
con dos ventanillas, empleada, cliente y 6 turnos del día en distintos estados
(completado, no-show, en atención, llamado y dos esperando), más un segundo
negocio **pendiente** para probar el backoffice. Todas las cuentas usan la
clave `Password1` y el script imprime los emails, el `queueId` y el `turnId`
del invitado al terminar.

Es idempotente: borra lo que creó antes y lo vuelve a crear, así que correrlo
de nuevo sirve para volver a cero. Y se niega a correr si `DATABASE_URL` no
apunta a una base local, porque borra filas.

**Este es el mecanismo de portabilidad entre máquinas.** El bind mount de
abajo conserva lo que acumules en *esta* PC; el seed es lo que te da un
entorno igual en cualquier otra.

### Backup y restore

```bash
# Dump comprimido a ./backups/espera-<fecha>.dump
./scripts/db-backup.sh

# Restaurar en la base local (pide confirmación: pisa lo que haya)
./scripts/db-restore.sh backups/espera-20260928-151936.dump

# Restaurar en Render, con su External Database URL
RENDER_DATABASE_URL='postgresql://...' ./scripts/db-restore-render.sh backups/espera-....dump
```

El formato es el custom de `pg_dump` (`-Fc`), no SQL plano: pesa menos y
permite restaurar tablas sueltas. Los tres scripts corren `pg_dump`/
`pg_restore` dentro de un contenedor, así que no hace falta instalar el
cliente de Postgres en Windows y la versión del cliente siempre coincide con
la del servidor.

La URL de Render va por variable de entorno y no como argumento: los
argumentos quedan en el historial del shell y se ven en la lista de procesos.

### Migrar desde el volumen nombrado

Si venís de la versión anterior del compose, tus datos están en el volumen
`espera-backend_postgres_data` y el bind mount arranca **vacío**. Para no
perderlos, con los contenedores viejos todavía arriba:

```bash
./scripts/db-backup.sh          # 1. dump de lo que hay hoy
docker compose down             # 2. el volumen viejo NO se borra
docker compose up -d            # 3. arranca sobre ./data/postgres, vacío
npx prisma migrate deploy       # 4a. esquema limpio...
./scripts/db-restore.sh backups/<el-dump>   # 4b. ...o restaurá los datos
```

El volumen viejo queda intacto por si algo sale mal. Cuando confirmes que la
base nueva está bien: `docker volume rm espera-backend_postgres_data`.

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

### Cookies y dominios

Las cookies de sesión (`refreshToken` y la de estado de Google) sólo viajan si
el frontend y el backend son **el mismo sitio** para el navegador. El sitio se
decide por el dominio registrable, no por el puerto: `localhost:5173` y
`localhost:3000` son el mismo sitio, y por eso en local todo anda.

| Despliegue | ¿Mismo sitio? | Qué hacer |
| --- | --- | --- |
| `app.tudominio` + `api.tudominio` | Sí | Nada. `COOKIE_SAMESITE` sin setear |
| `*.vercel.app` + `*.onrender.com` | No | `COOKIE_SAMESITE=none` en Render |

`*.vercel.app` y `*.onrender.com` están en la Public Suffix List, así que cada
subdominio es un sitio distinto: no hay forma de hacerlos same-site.

Si el despliegue es cross-site y no se pone `none`, el síntoma es confuso: el
login anda, pero **el usuario se desloguea a los 15 minutos** (falla el refresh)
y el login con Google da `GOOGLE_OAUTH_STATE_MISMATCH`.

`none` es un puente, no el destino: quita la protección CSRF que da `strict`.
El daño real es acotado — sólo `/auth/refresh-token` y `/auth/logout`
autentican por cookie, el resto usa el Bearer token, y CORS impide leer la
respuesta desde otro origen — así que lo peor que logra un sitio malicioso es
forzar un logout. Aun así, **en cuanto haya dominio propio conviene sacar la
variable** y volver a `strict`.

`COOKIE_DOMAIN` queda **sin setear** en producción: con front y back en
dominios distintos no hay dominio común que compartir, y con subdominios la
cookie del backend sólo necesita volver al backend.

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
