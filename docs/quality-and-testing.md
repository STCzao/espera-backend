# Estrategia de Calidad y Testing

## Proposito del documento

Este documento define el marco general de calidad y testing para `espera-back`
y, por extension, para el ecosistema Espera cuando se replique la misma logica
en otros repositorios.

Su objetivo es evitar que la calidad quede librada a decisiones ad hoc por
feature, y reemplazar ese enfoque por criterios consistentes, progresivos y
adaptados al riesgo real de cada historia.

Este documento no reemplaza al backlog funcional ni a los criterios de
aceptacion por historia. Los complementa. El backlog dice que debe hacer el
producto. Este documento dice con que nivel de evidencia consideramos que una
implementacion esta suficientemente validada.

Tambien se relaciona de forma directa con:

- la `Definition of Done` del proyecto
- el flujo de trabajo basado en `feature/*`, `develop` y `main`
- la calidad operativa de staging y produccion
- la futura estrategia de CI/CD

En Espera, "calidad" no significa solo ausencia de errores. Significa:

- que los flujos criticos del negocio funcionan de forma verificable
- que los cambios no rompen capacidades ya entregadas
- que la arquitectura sigue siendo mantenible
- que el sistema conserva consistencia funcional y tecnica a medida que crece el
  MVP

## Principios rectores

### Calidad progresiva

La calidad debe crecer junto con el producto. No exigimos el mismo nivel de
validacion a una base inicial que a un MVP consolidado, pero cada etapa debe
dejar el sistema mas seguro que antes, no mas fragil.

### Riesgo sobre volumen

No se prioriza cantidad de tests ni cobertura cosmetica. Se prioriza cubrir los
flujos con mayor impacto en negocio, seguridad, concurrencia, integraciones o
riesgo de regresion.

### Cobertura inteligente

Una historia no esta bien cubierta por tener muchos tests, sino por tener las
pruebas correctas en la capa adecuada. Un caso de uso critico sin prueba de
integracion vale mas que diez tests triviales sobre getters o mapeos sin riesgo.

### Testing como parte de la feature

El testing no debe tratarse como tarea opcional ni como actividad separada del
desarrollo funcional. La intencion del proyecto es que, con el correr del MVP,
cada feature nueva llegue con el nivel de evidencia correspondiente a su riesgo.

### Prioridad en los flujos criticos

En Espera, primero deben protegerse:

- autenticacion y autorizacion
- registro y aprobacion de negocios
- reglas de cola y prioridad
- integridad de sesiones
- consistencia de notificaciones
- disponibilidad operativa del negocio

### Evitar suites fragiles

Los tests deben ser utiles, legibles y estables. Debemos evitar pruebas que:

- dependan de detalles internos faciles de refactorizar
- repliquen la implementacion en lugar de validar comportamiento
- fallen por tiempos, orden o datos aleatorios no controlados
- obliguen a un costo de mantenimiento mayor que el valor que entregan

## Estrategia de testing por capas

La estrategia general combina distintos tipos de prueba. No todos son
obligatorios para todas las historias.

### Tests unitarios

Cubren reglas puntuales y comportamiento aislado.

Aplican especialmente a:

- validaciones
- reglas de prioridad
- calculos derivados
- adaptadores pequenos con ramas criticas
- casos de uso con dependencias mockeables

Sirven para feedback rapido y para fijar reglas de negocio sin costo alto de
infraestructura.

### Tests de integracion

Validan la colaboracion real entre capas del backend.

Aplican especialmente a:

- repositorios Prisma
- middlewares
- casos de uso con persistencia
- auth con tokens y sesiones
- flujo negocio mas outbox o Redis cuando corresponda

En `espera-back` son los tests de mas valor relativo porque el mayor riesgo no
esta en funciones puras, sino en comportamiento de modulo, persistencia y
contratos HTTP.

### Tests de contrato o API

Validan que los endpoints expongan el comportamiento esperado por clientes como
`espera-panel` o `espera-app`.

Aplican a:

- status codes
- shape del payload
- headers o cookies
- errores funcionales esperados

Son especialmente valiosos en `auth`, `business` y `queue`.

### Tests end-to-end

Validan flujos completos atravesando varias capas y, eventualmente, varios
repositorios. En este repo no son el primer frente a construir, pero si deben
existir en el ecosistema del producto a medida que madure el MVP.

Aplican a:

- login y permanencia de sesion
- onboarding de negocio
- operacion de cola
- sincronizacion panel/app

### Smoke tests

Son validaciones cortas posteriores a deploy o merge relevante.

Ejemplos:

- `GET /health`
- flujo basico de boot de la app
- acceso a rutas criticas

No reemplazan tests funcionales, pero si ayudan a detectar fallas groseras de
configuracion o despliegue.

### Pruebas manuales guiadas

Mientras el sistema de testing automatizado madura, algunas validaciones
seguiran siendo manuales. Esto es aceptable solo si:

- estan explicitadas
- tienen alcance acotado
- no reemplazan indefinidamente pruebas automatizables de alto riesgo

Las pruebas manuales guiadas deben describir:

- escenario
- datos de entrada
- resultado esperado
- evidencia observada

Postman es la herramienta recomendada para estas pruebas manuales de API. Debe
usarse para validar contratos HTTP reales, cookies, headers, status codes e
integraciones locales o de staging. La guia operativa inicial esta en
`docs/postman-epica-1.md`.

## Criterios generales de completitud de una feature

Una historia o feature debe evaluarse en cuatro dimensiones complementarias.

### Completitud funcional

La feature cumple el comportamiento esperado por su historia y sus criterios de
aceptacion principales.

### Completitud tecnica

La implementacion:

- respeta los limites arquitectonicos vigentes
- no introduce deuda innecesaria
- no rompe modulos existentes
- deja migraciones y contratos consistentes

### Completitud de calidad

La feature cuenta con validacion acorde a su riesgo, incluyendo:

- `lint`
- `typecheck`
- `build`
- pruebas automatizadas cuando correspondan
- validacion manual guiada cuando aun no exista la automatizacion adecuada

### Completitud operativa

La feature puede desplegarse y operarse razonablemente, con:

- configuracion documentada
- variables de entorno identificadas
- comportamiento observable
- errores controlados

## Definition of Done general

### Para merge a `develop`

Una feature esta lista para mergear a `develop` cuando:

- implementa el alcance acordado
- no deja errores de compilacion o lint
- `npm run typecheck` pasa
- `npm run build` pasa
- las migraciones necesarias estan incluidas
- el impacto en documentacion esta contemplado
- la evidencia de validacion es razonable para su riesgo
- cualquier deuda remanente esta explicitada

### Para promocion a `main` o produccion

Ademas de lo anterior:

- la feature fue validada en staging si aplica
- no hay defectos criticos abiertos
- los flujos impactados tienen evidencia de regresion suficiente
- existen checks operativos minimos, como healthcheck o smoke test

### Excepciones aceptables

Puede aceptarse una excepcion cuando:

- la historia es de bajo riesgo
- la deuda esta documentada
- existe acuerdo explicito del equipo
- no compromete seguridad, integridad ni flujos centrales

No es aceptable usar esta clausula para omitir sistematicamente pruebas sobre:

- autenticacion
- sesiones
- aprobaciones
- reglas de cola
- concurrencia
- notificaciones transaccionales

## Criterios de testing por tipo de historia

La exigencia de testing debe variar segun el tipo de riesgo involucrado.

### Autenticacion y seguridad

Requieren alta exigencia. Deben priorizar:

- tests de integracion
- tests de API
- regresion de errores funcionales y permisos

Ejemplos:

- login correcto e incorrecto
- expiracion o refresh token
- logout e invalidacion de sesion
- autorizacion por rol
- bloqueo por intentos fallidos

### Reglas de negocio

Requieren al menos una combinacion de:

- unitarios sobre reglas
- integracion sobre persistencia o efectos observables

Ejemplos:

- aprobacion de negocio
- estados operativos
- restricciones de registro
- cambios de prioridad

### Concurrencia

Requiere cobertura superior a la media y evidencia fuerte, porque los defectos
son costosos y a veces no se ven en testing manual simple.

Ejemplos:

- asignacion de posiciones sin duplicados
- llamada al siguiente bajo contencion
- cancelaciones simultaneas
- consistencia entre DB, Redis y eventos

### Integraciones externas

Deben probarse con estrategia mixta:

- tests sobre adaptadores
- stubs o mocks controlados
- validacion manual o de staging sobre credenciales reales cuando corresponda

Ejemplos:

- Google OAuth
- Resend
- Firebase Cloud Messaging
- Google Maps

### Notificaciones

No alcanza con comprobar que "se llama una funcion". Debe validarse:

- generacion del evento
- persistencia del outbox cuando aplique
- reintentos
- no perdida de consistencia ante fallos

### UI o panel

Aunque no se implementen en este repo, el criterio transversal del proyecto
debe contemplar:

- estados visibles claros
- permisos por rol
- comportamiento responsive cuando sea critico para operacion

### Reporting y metricas

Requieren validar:

- exactitud del dato
- filtros o agrupaciones
- consistencia temporal

## Matriz de criticidad

La siguiente matriz sirve para decidir el nivel de testing requerido.

| Criticidad | Tipo de impacto | Exigencia sugerida |
| --- | --- | --- |
| Alta | Seguridad, dinero, concurrencia, sesiones, aprobaciones, integridad de cola | Integracion obligatoria, API obligatoria, regresion obligatoria |
| Media | Reglas de negocio, configuracion operativa, cambios de estado, calculos visibles | Unitarios o integracion segun el caso, mas validacion manual guiada |
| Baja | Presentacion, textos, mapeos simples, cambios de soporte | Validacion ligera, con automatizacion opcional si el costo lo justifica |

## Politica progresiva por etapa del MVP

### Etapa inicial

Objetivo:

- construir base funcional sin perder control

Exigencias:

- `lint`, `typecheck` y `build`
- pruebas manuales guiadas para toda historia relevante
- automatizacion prioritaria solo en flujos criticos

### Etapa MVP consolidado

Objetivo:

- reducir regresiones y permitir evolucion mas segura

Exigencias:

- tests de integracion en auth y business criticos
- tests de API sobre endpoints clave
- trazabilidad minima entre criterios y evidencia

### Etapa de crecimiento

Objetivo:

- escalar desarrollo con menor riesgo operativo

Exigencias:

- suite de regresion mas estable
- cobertura fuerte en queue, concurrencia y notificaciones
- smoke tests formales en pipeline
- mayor automatizacion de escenarios cross-repo

## Estrategia especifica para `espera-back`

En este repositorio, el orden sugerido de cobertura es:

### 1. Auth

Prioridades:

- registro local
- login
- refresh token
- logout
- password reset
- aprobacion de negocio

Razon:

Es la base de acceso y sesion del producto. Un fallo aca compromete todo lo
demas.

### 2. Business

Prioridades:

- registro de negocio
- aprobacion y restricciones por rol
- futura configuracion de horarios, estado operativo y ventanillas

Razon:

Epica 2 va a expandirse sobre este modulo y necesita una base segura antes de
sumar complejidad operativa.

### 3. Queue

Prioridades:

- creacion de turno
- cancelacion
- llamada al siguiente
- prioridad
- concurrencia

Razon:

Es el nucleo del producto y la parte mas sensible a inconsistencias.

### 4. Middleware y seguridad transversal

Prioridades:

- `authenticate`
- `authorize`
- `rateLimiter`
- manejo de errores

### 5. Persistencia e infraestructura

Prioridades:

- repositorios Prisma criticos
- adaptadores de Redis
- outbox y notificaciones cuando pasen a uso real

## Cobertura automatizada actual

La suite automatizada inicial esta enfocada en casos de uso de Epica 1. Son
tests unitarios de aplicacion: ejercitan reglas de negocio de los use cases con
repositorios en memoria, servicios externos mockeados y datos pequenos. No
levantan Express, PostgreSQL, Redis ni Resend reales.

Esta decision es intencional para esta etapa: permite fijar rapidamente reglas
criticas de autenticacion, sesiones y onboarding sin introducir todavia el costo
operativo de una base de datos de test. La cobertura no reemplaza futuros tests
de integracion ni de API.

### Alcance cubierto

| Area | Archivo | Comportamiento cubierto | Tipo |
| --- | --- | --- | --- |
| Login local | `tests/unit/auth/LoginUseCase.test.ts` | Login exitoso de usuario verificado, rechazo de credenciales invalidas, bloqueo de cuenta negocio pendiente | Unitario de aplicacion |
| Refresh token | `tests/unit/auth/RefreshTokenUseCase.test.ts` | Rotacion de refresh token valido, rechazo de token revocado | Unitario de aplicacion |
| Reset password | `tests/unit/auth/ResetPasswordUseCase.test.ts` | Cambio de password, revocacion de sesiones activas, rechazo de token expirado | Unitario de aplicacion |
| Forgot password | `tests/unit/auth/RequestPasswordResetUseCase.test.ts` | Token para cuentas locales, respuesta generica para emails inexistentes, bloqueo silencioso de recuperacion para cuentas Google | Unitario de aplicacion |
| Verificacion de email | `tests/unit/auth/VerifyEmailUseCase.test.ts` | Verificacion con token valido y rechazo de token expirado | Unitario de aplicacion |
| Logout | `tests/unit/auth/LogoutUseCase.test.ts` | Revocacion de sesion refresh e idempotencia cuando el token no existe | Unitario de aplicacion |
| Aprobacion de negocio | `tests/unit/auth/ApproveBusinessAccountUseCase.test.ts` | Aprobacion de `business_admin` y rechazo de cuentas no negocio | Unitario de aplicacion |
| Registro de negocio | `tests/unit/auth/RegisterBusinessAccountUseCase.test.ts` | Creacion de usuario `business_admin` pendiente, creacion de negocio, envio de verificacion, rollback ante falla de email | Unitario de aplicacion |
| Registro negocio Google | `tests/unit/auth/RegisterBusinessWithGoogleUseCase.test.ts` | Creacion de negocio Google pendiente, cuenta existente y rechazo de email Google no verificado | Unitario de aplicacion |
| Login Google | `tests/unit/auth/LoginWithGoogleUseCase.test.ts` | Login exitoso aprobado, bloqueo pendiente y rechazo de cuenta local | Unitario de aplicacion |
| Permisos | `tests/unit/middleware/authorize.test.ts` | Acceso a perfil propio para negocio, rechazo por falta de permiso y falta de autenticacion | Unitario de middleware |
| Rate limiter | `tests/unit/middleware/rateLimiter.test.ts` | Politicas por endpoint, Redis, expiracion, bloqueo 429 y fallback en memoria | Unitario de middleware |
| Error handler | `tests/unit/middleware/errorHandler.test.ts` | Respuestas de `AppError`, logging de errores internos y ocultamiento de errores inesperados | Unitario de middleware |
| Auth API | `tests/api/auth/auth.api.test.ts` | Contratos HTTP base para register, login, refresh, logout, `/me` y URL OAuth, incluyendo cookies | API con use cases mockeados |

### Historias impactadas

| Historia | Cobertura actual | Estado |
| --- | --- | --- |
| `HU-1.3` Login con email y password | Casos principales de credenciales, usuario verificado y cuenta negocio pendiente | Parcial |
| `HU-1.5` Refresh token | Rotacion y rechazo de token revocado | Parcial |
| `HU-1.7` Recuperacion de password | Solicitud para cuenta local, respuesta generica, bloqueo de cuenta Google, reset con token valido, token expirado e invalidacion de sesiones | Parcial |
| `HU-1.8` Registro de negocio con cuenta pendiente | Creacion feliz y rollback ante falla de email | Parcial |
| `HU-1.9` OAuth web de negocio | Registro y login validados manualmente, reglas OAuth cubiertas por unit tests y URL OAuth cubierta por API test | Cubierto funcionalmente |

### Lo que aun no cubre

- ~~Persistencia real automatizada con Prisma/PostgreSQL.~~ Arrancado (ver
  sección "Tests de integración contra Postgres real" más abajo) — un solo
  repositorio cubierto por ahora, el resto queda como deuda a extender.
- Redis real para rate limit y bloqueo de intentos.
- Integracion real con Resend o Google OAuth.
- Intercambio real automatizado contra Google OAuth.
- Reenvio de verificacion automatizado.

### Comandos de calidad

Los comandos actuales separan el typecheck de produccion y el de tests:

- `npm run typecheck`: valida el codigo incluido en `tsconfig.json`.
- `npm run typecheck:test`: valida codigo de `src`, tests y configuracion de
  Vitest usando `tsconfig.test.json`.
- `npm run test:run`: ejecuta la suite automatizada una vez (sin tocar
  Postgres/Redis reales — todo con fakes en memoria).
- `npm run test:integration:setup`: aplica las migraciones pendientes a la
  base de test (`espera_test`), sin depender de la `DATABASE_URL` que tenga
  seteada la terminal.
- `npm run test:integration`: corre los tests contra Postgres real (ver
  sección "Tests de integración contra Postgres real" más abajo). Requiere
  Docker levantado (`docker compose up -d`) y haber corrido el setup antes.
- `npm run lint`: valida ESLint sobre `src`.
- `npm run build`: compila el backend a `dist`.

### Tests de integración contra Postgres real (2026-09-01)

Rama: `bugfix/ownership-operaciones-cola` (mismo trabajo que los bugfixes
anteriores de esta rama). Encontrado en la auditoría general del proyecto:
ningún test en todo el repo tocaba una Postgres real — la capa SQL (Prisma)
dependía 100% de revisión manual. Se estableció la base pedida por el
hallazgo (`aunque sea uno, como base`).

**Gap adicional encontrado al intentar migrar una base desde cero:** la
migración `20260810000000_revert_membership_self_service` revierte
`20260809000000_membership_self_service`, pero ese archivo había sido
borrado del repo (el feature se revirtió por completo — ver
`docs/project-status.md` / PR #79-#80). Eso rompía `prisma migrate deploy`
contra cualquier base nueva: `develop` y producción no lo notaban porque ya
tenían ambas migraciones aplicadas de cuando existían, pero cualquier
entorno nuevo (CI, un teammate nuevo, esta base de test) fallaba con `P3018
— table "membership_invitations" does not exist`. Se restauró el archivo
original desde el historial de git (commit `c621d62`) — el par
feature+revert vuelve a ser un no-op neto, igual que hoy en `schema.prisma`,
y la cadena de 32 migraciones aplica limpia desde cero.

**Infraestructura agregada:**

- `docker-compose.yml`: el servicio `redis` ahora persiste con un volumen
  (`redis_data:/data`), igual que ya hacía `postgres` — antes perdía todo
  al recrear el contenedor.
- `vitest.integration.config.ts`: config separada, `include:
  ["tests/integration/**/*.test.ts"]`, `fileParallelism: false` (todos los
  tests comparten una sola base real). `vitest.config.ts` (la suite
  default) excluye `tests/integration/**` explícitamente — `npm test`
  nunca necesita Docker levantado.
- `tests/setup/integration-env.ts`: reusa `tests/setup/env.ts` y agrega una
  guarda — si `DATABASE_URL` no contiene `"test"` en el nombre, lanza un
  error en vez de correr. Protege contra el caso de que la terminal ya
  tenga `DATABASE_URL` exportada apuntando a la base de desarrollo.
- `src/scripts/setup-test-db.ts` (`npm run test:integration:setup`): corre
  `prisma migrate deploy` fijando `DATABASE_URL` a la base de test
  explícitamente (default `postgresql://postgres:postgres@localhost:5432/espera_test`,
  overrideable con `TEST_DATABASE_URL`) — así el paso de migrar nunca
  depende de qué `DATABASE_URL` tenga la terminal, y nunca migra por
  accidente la base de desarrollo.
- `tests/integration/PostgresUserRepo.integration.test.ts` (nuevo, 3
  casos): guarda un `User` real y lo relee por id/email verificando que el
  mapeo de enums (`role`/`approvalStatus`/`authProvider`) y campos
  opcionales sea correcto contra Postgres real (no solo contra el fake);
  actualiza una fila existente vía upsert; confirma que el constraint
  `UNIQUE(email)` se hace cumplir a nivel de base, algo que ningún fake en
  memoria puede detectar si diverge. Cada test limpia sus propias filas al
  terminar (`afterEach`).

**Cómo correrlo:**

```
docker compose up -d
npm run test:integration:setup
npm run test:integration
```

660 tests en verde en la suite default (sin Docker), 3 en la suite de
integración (con Docker), `tsc --noEmit` limpio en `src` y en tests
(`tsconfig.test.json` ahora también incluye `vitest.integration.config.ts`).

**Pendiente, deuda reconocida:** un solo repositorio cubierto
(`PostgresUserRepo`, elegido por no tener dependencias de FK). Los
candidatos de mayor valor para extender esto —`PostgresTurnRepo`, en
particular `countWaitingAhead`/`findActiveByQueue` documentados en el
bugfix de `epica-4-canales-entrada.md`— requieren primero crear
Organization/Business/Queue reales (cadena de FKs), así que quedan fuera
de este "mínimo, como base".

### Pruebas manuales con Postman

Ademas de los comandos automatizados, Epica 1 puede validarse manualmente con
Postman siguiendo `docs/postman-epica-1.md`.

Estas pruebas cubren el sistema desde afuera de la API y son especialmente
utiles para:

- verificar cookies `httpOnly` de refresh token
- confirmar status codes y codigos funcionales de error
- validar flujos que dependen de datos reales en PostgreSQL
- detectar diferencias entre el contrato esperado y la respuesta HTTP real
- documentar evidencia manual antes de cerrar una historia

Un escenario validado solo con Postman sigue siendo deuda automatizable si
protege un flujo critico. La expectativa es convertir progresivamente esos
escenarios en tests de API o integracion.

## Trazabilidad con backlog y criterios de aceptacion

Cada historia deberia poder mapearse contra evidencia concreta.

Modelo sugerido:

| Historia | Criterio de aceptacion | Tipo de prueba | Estado | Observaciones |
| --- | --- | --- | --- | --- |
| `HU-1.3` | Login con credenciales correctas devuelve sesion valida | Integracion o API | Pendiente / Parcial / Cubierto | Referencia al test o evidencia manual |

Reglas de trazabilidad:

- ningun criterio critico deberia quedar sin validar
- si un criterio no esta automatizado, debe quedar explicitado
- la deuda debe vincularse a la historia, no perderse como comentario informal

## Manejo de deuda de testing

La deuda de testing es aceptable solo cuando esta controlada.

### Cuando puede aceptarse

- feature de bajo riesgo
- limitacion temporal razonable
- infraestructura de pruebas aun no disponible
- dependencia externa pendiente

### Como registrarla

Cada deuda deberia indicar:

- historia afectada
- riesgo asociado
- cobertura faltante
- motivo de la excepcion
- criterio para cerrarla

### Cuando deja de ser razonable

Deja de ser deuda razonable y pasa a ser negligencia cuando:

- afecta flujos criticos
- se repite en multiples features
- no tiene responsable ni plan
- bloquea evolucion segura del sistema

## Recomendaciones practicas de implementacion

### Convenciones de nombres

Sugerencias:

- `*.unit.test.ts`
- `*.integration.test.ts`
- `*.api.test.ts`

### Organizacion

Una alternativa razonable para este repo es:

```text
tests/
  integration/
    auth/
    business/
    queue/
  api/
    auth/
    business/
    queue/
  fixtures/
  helpers/
```

### Fixtures y test data

Preferir:

- datos pequenos y expresivos
- builders o factories simples
- aislamiento entre escenarios

Evitar:

- seeds gigantes para todos los tests
- mocks excesivos en reglas que necesitan integracion real
- dependencia encadenada entre casos

### Legibilidad

Cada test debe dejar claro:

- que escenario cubre
- que comportamiento espera
- por que ese caso importa

## Tabla reutilizable por epica

La siguiente tabla puede reutilizarse para cualquier epica futura:

| Historia | Riesgo | Tipo de prueba requerida | Estado de cobertura | Observaciones |
| --- | --- | --- | --- | --- |
| `HU-x.y` | Alto / Medio / Bajo | Unitario / Integracion / API / Manual | Pendiente / Parcial / Cubierto | Notas de deuda, enlaces, alcance |

## Checklist final reutilizable

Antes de cerrar una feature o historia, revisar:

- el alcance funcional acordado esta completo
- los criterios de aceptacion relevantes tienen evidencia
- `lint`, `typecheck` y `build` pasan
- las migraciones necesarias estan incluidas
- el impacto en roles, permisos o seguridad fue validado
- la documentacion afectada fue actualizada
- la deuda de testing, si existe, quedo registrada
- el nivel de cobertura es coherente con la criticidad de la historia

## Criterio operativo actual

Dado el estado actual del repo, este documento se incorpora primero como marco
de referencia. La aplicacion sistematica de tests por feature quedara sujeta a
decision explicita del equipo en funcion del avance del MVP y de la prioridad de
cada epica.

Hasta que se formalice una politica mas estricta, la expectativa minima sigue
siendo:

- no romper `lint`, `typecheck` ni `build`
- no romper `test:run` cuando existan pruebas automatizadas para el alcance tocado
- documentar deuda o cobertura faltante
- priorizar automatizacion en los flujos mas riesgosos
