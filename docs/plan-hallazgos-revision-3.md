# Plan de ataque: hallazgos de la revisión calificada (Sept 2026)

Estado de partida: `develop` en el PR #114. `tsc`, lint y 831 tests unitarios/API en verde. Los tests de integración no se corrieron con los cambios recientes (Docker apagado). Nota general de la revisión: **7,5 / 10**.

## Reglas de trabajo

- Una rama por unidad de trabajo, siempre saliendo de `develop` (nunca apilada sobre otra rama abierta). Convención: `bugfix/`, `feature/`, `refactor/`, `chore/`.
- Antes de cerrar cada rama: `npx vitest run tests/unit tests/api`, `npx tsc --noEmit`, `npm run lint`.
- Si la rama toca una query, un constraint o una migración: además `npm run test:integration` contra Postgres real (requiere Docker).
- Un commit por cambio lógico, con mensaje en español explicando el porqué.
- Push y PR los abre el equipo desde GitHub (`gh` no está instalado).

## Fase A: antes del piloto

### A1. `bugfix/rate-limit-guest-turns` (hallazgo 1, alto)
**Problema:** `POST /guest-turns` permite 5 turnos cada 10 min por IP y `GET /:token` 30 por minuto por IP. Los clientes de un local comparten la wifi del local (o, con `TRUST_PROXY` mal configurado, la IP del proxy), así que a partir del sexto cliente reciben 429.
**Cambio:** en `src/middleware/rateLimiter.ts`, la clave de `guest-turns` pasa a ser IP + `businessId` (o se elimina el límite por IP, según la decisión). Revisar `qr-resolve` con el mismo criterio. Actualizar `tests/unit/middleware/rateLimiter*.test.ts` y el guard `rateLimiterCoverage`.
**Decisión pendiente:** (a) IP + `businessId` con un límite más alto, o (b) sin límite por IP y solo un tope de turnos activos por cola.
**Verificación:** test que simule 6+ invitados desde la misma IP en el mismo negocio y compruebe el comportamiento elegido.

### A2. `chore/actualiza-dependencias` (hallazgo 3, alto)
**Problema:** `npm audit --omit=dev` reporta 10 vulnerabilidades (5 altas): `ws` (vía socket.io), `body-parser`, `qs`, `deepmerge-ts`.
**Cambio:** `npm audit fix` (sin `--force` primero); revisar el diff del lockfile; si algo requiere un salto mayor, evaluarlo aparte.
**Verificación:** suite completa, `tsc`, lint y arrancar el server localmente para confirmar que Socket.IO conecta.

### A3. Validación con Docker (hallazgo 9, sin rama de código)
**Cuándo:** apenas se pueda levantar Docker Desktop.
**Pasos:** `docker compose up -d`, `npm run test:integration:setup`, `npm run test:integration`.
**Además:** ejecutar contra la base de producción (o una copia) las consultas de chequeo previas a las migraciones nuevas:
- `20260918000000_unique_active_qr_per_business`: más de un QR activo por negocio.
- `20260918010000_unique_active_turn_per_customer`: más de un turno activo por cliente.
- `20260924000000_unique_admin_membership_per_user`: consulta dentro del comentario de la migración.
**Salida:** informe de qué pasa y qué datos habría que limpiar antes de aplicar.

## Fase B: antes de abrir al público

### B1. `bugfix/refresh-token-atomico` (hallazgo 2, alto)
**Problema:** `RefreshTokenUseCase` lee y luego guarda sin guard atómico: dos pestañas que refrescan a la vez provocan un logout aleatorio. No hay detección de reuso ni tope absoluto (la sesión se extiende 30 días con cada refresh).
**Cambio:** rotación con `updateMany` condicionado a `tokenHash` actual (mismo patrón CAS que en turnos); si un token ya rotado se reutiliza, revocar la sesión; agregar `createdAt` como límite absoluto de vida.
**Decisión pendiente:** cuántos días de tope absoluto (propuesta: 90).
**Verificación:** test unitario de la carrera y test de integración con dos refresh concurrentes.

### B2. `bugfix/lockout-login-por-ip-y-email` (hallazgo 6, medio)
**Problema:** 5 intentos fallidos bloquean la cuenta 5 min (15 para super admin) por email: cualquiera puede bloquear a otro.
**Cambio:** contar los intentos por email + IP, de modo que un tercero solo se bloquee a sí mismo. Mantener un límite global alto por email como freno de fuerza bruta distribuida.
**Verificación:** tests en `loginAttemptTracker` y `LoginUseCase`.

### B3. `bugfix/rate-limit-atomico` (hallazgo 7, medio)
**Problema:** `incr` seguido de `expire` no es atómico; si el proceso muere en medio, la clave queda sin expiración y esa IP queda bloqueada para siempre.
**Cambio:** un script Lua (o `SET NX EX` + `INCR`) que haga ambas cosas en una sola operación, en `rateLimiter.ts` y en `loginAttemptTracker.ts` si aplica.
**Verificación:** tests con Redis mockeado y, con Docker, prueba real de expiración.

### B4. `feature/proteccion-turnos-invitado` (hallazgo 8, medio)
**Problema:** cualquiera con el QR puede llenar una cola rotando IPs y el invitado no puede cancelar su propio turno.
**Cambio:** endpoint `POST /guest-turns/:turnId/cancel` (la clave de acceso es el `turnId`, igual que el polling) y un tope de turnos de invitado activos por cola.
**Decisión pendiente:** si se agrega captcha (implica coordinar con el frontend). Por defecto, no.

## Fase C: operabilidad

### C1. `feature/ci-y-dockerfile` (hallazgo 4, alto)
**Cambio:** workflow de GitHub Actions (instalar, `tsc`, lint, tests unitarios/API, `npm audit --omit=dev --audit-level=high`); `Dockerfile` multi-etapa con `prisma generate` y `prisma migrate deploy`; alinear `.env.example` con el esquema real (quitar `JWT_REFRESH_SECRET`, `FCM_*` y `RATE_LIMIT_*` si no se usan, o implementarlos).
**Decisión pendiente:** dónde se va a desplegar (define el formato del Dockerfile y del pipeline de deploy).

### C2. `feature/apagado-ordenado` (hallazgo 4)
**Cambio:** manejar `SIGTERM`/`SIGINT`: dejar de aceptar conexiones, cerrar Socket.IO, `prisma.$disconnect()` y `redis.quit()`, con un timeout de seguridad. Test unitario de la función de cierre.

## Fase D: limpieza (una sola rama, baja prioridad)

### D1. `refactor/limpieza-menor`
- Hallazgo 10: quitar `role`/`approvalStatus` de los claims del access token (ya no se leen desde `authenticate`).
- Hallazgo 11: fijar `algorithms: ["HS256"]` en `jwt.verify` y en `jwt.sign`.
- Hallazgo 12: en `LoginUseCase`, hacer un `bcrypt.compare` contra un hash falso cuando el usuario no existe, para igualar los tiempos de respuesta.
- Hallazgo 13: en `ListAllBusinessesUseCase`, mover el filtro por suscripción a la consulta para no paginar en memoria.

## Diferidos (no se hacen en este plan)

- **Hallazgo 5, socket del panel de staff sin autenticar: backend hecho**
  (rama `bugfix/socket-panel-autenticado`). El handshake valida el access
  token y `queue:join` sin `turnId` exige dueño o empleado activo del negocio
  de esa cola. Sale en dos etapas con `SOCKET_REQUIRE_STAFF_AUTH` (default
  `false`) para no dejar al panel sin tiempo real: falta que `espera-frontend`
  mande el token (`auth: (cb) => cb({ token })` en `useQueueRoom`) y, cuando
  no queden warnings de `legacy panel`, poner el flag en `true`.
- **Hallazgo 14, notificaciones push (`OutboxProcessor`, `FCMNotifier`):** pospuesto a propósito hasta probar tracción en los rubros que no las necesitan.

## Orden y dependencias

1. A1 y A2 en paralelo (independientes). A3 apenas haya Docker.
2. B1, B2, B3 y B4 en cualquier orden; B3 conviene antes que B2 si ambos tocan el mismo módulo.
3. C1 y C2 al final de la fase B o intercalados.
4. D1 cuando haya tiempo.

## Decisiones que necesito antes de empezar

| Punto | Opciones |
|---|---|
| A1 | (a) IP + `businessId` con límite más alto, o (b) sin límite por IP |
| B1 | Días de tope absoluto de sesión (propuesta: 90) |
| B4 | Captcha sí/no (propuesta: no) |
| C1 | Plataforma de despliegue |
| A3 | Cuándo se puede levantar Docker |
