# Estado y Arquitectura del Proyecto

## Resumen ejecutivo

`espera-back` es el backend principal del producto Espera. Su estado actual debe
leerse como una primera fase de autenticacion bastante avanzada, con onboarding
de negocios y bases iniciales para las siguientes epicas.

El corte funcional real alcanzado hasta ahora llega principalmente hasta
`HU-1.9`. A partir de Epica 2 existen contratos, rutas y piezas de
infraestructura, pero no una implementacion funcional completa del backlog.

## Alcance real implementado

### Historias cubiertas en buena medida

- `HU-1.1` Registro con email y password
- `HU-1.3` Login con email y password
- `HU-1.5` Refresh token
- `HU-1.6` Logout
- `HU-1.7` Recuperacion de password
- `HU-1.8` Registro de negocio con aprobacion pendiente
- `HU-1.9` OAuth para panel de negocio

### Historias en rollover

- `HU-1.2` Registro de usuario con Google en app movil
- `HU-1.4` Login de usuario con Google en app movil

Estas historias quedaron diferidas por una dependencia externa valida:
configuracion OAuth real por plataforma y despliegue o registro previo de la
aplicacion movil.

## Modulos del sistema

### auth

Responsabilidades actuales:

- registro local
- login local
- login Google
- registro de negocio local
- registro de negocio con Google
- refresh token
- logout
- verificacion de email
- password reset
- aprobacion de cuenta de negocio

Fortalezas:

- validacion de entrada con `zod`
- hashing con `bcrypt`
- refresh tokens persistidos por hash
- rotacion de refresh token
- bloqueo temporal por intentos fallidos
- invalidacion de sesiones tras cambio de password

### business

Responsabilidades actuales:

- registro base de negocio
- configuracion inicial de cola

Estado:

- modulo preparado como base
- aun no cubre direccion, geolocalizacion, horarios, estado operativo,
  ventanillas, empleados, QR ni metricas

### queue

Responsabilidades proyectadas:

- creacion de turnos
- llamada al siguiente
- cancelacion
- prioridad
- tiempo real
- notificaciones

Estado:

- contratos y rutas creadas
- casos de uso actuales en estado base o stub

## Arquitectura tecnica

El proyecto sigue una estructura de `Modular Monolith` con carpetas por modulo:

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

- verificacion de email
- recuperacion de password
- bienvenida al negocio aprobado

## Estado de calidad actual

Comandos principales:

- `npm run typecheck`: ok
- `npm run typecheck:test`: ok
- `npm run build`: ok
- `npm run lint`: ok
- `npm run test:run`: ok con cobertura inicial de casos de uso de Epica 1

Validacion manual de Epica 1:

- registro local validado con Postman
- verificacion de email validada con token de desarrollo
- login local validado luego de verificar email
- forgot/reset password validado con token de desarrollo
- registro de negocio local validado con Postman
- verificacion de email de negocio validada con token de desarrollo
- aprobacion de negocio validada en base
- login de negocio aprobado validado con sesion refresh activa
- registro web de negocio con Google OAuth validado manualmente
- login web con Google OAuth validado manualmente con sesion refresh activa

Cobertura automatizada actual:

- tests unitarios de aplicacion sobre use cases de `auth`
- test unitario de permisos para `auth:read_self` y `/auth/me`
- tests API con `supertest` para contratos HTTP base de auth y cookies
- tests dedicados de `rateLimiter` y `errorHandler`
- repositorios en memoria para aislar reglas de negocio
- mocks para servicios externos como email, intentos de login y token service
- sin HTTP real, Prisma real, Redis real ni proveedores externos reales

Casos cubiertos hasta ahora:

- login local exitoso, credenciales invalidas y cuenta negocio pendiente
- refresh token valido con rotacion y token revocado
- forgot/reset password para cuenta local, respuesta generica y bloqueo de reset en cuentas Google
- registro de negocio pendiente y rollback ante falla de email
- verificacion de email, logout y aprobacion de negocio
- registro/login Google con perfiles mockeados
- contratos API base para registro, login, refresh, logout, `/me` y URL OAuth
- rate limiting con Redis/fallback y serializacion de errores

Pendiente para completar mejor Epica 1:

- tests de integracion con Prisma/PostgreSQL y Redis
- test dedicado de reenvio de verificacion
- validacion automatizada de Resend real y Google real en staging

## Conclusion

El proyecto tiene una base tecnica valida y una direccion arquitectonica
correcta, pero su lectura adecuada es la de una fase 1 avanzada, no la de un
MVP de producto completo.

## Siguiente epica

La siguiente epica documentada es `Epica 2 - Gestion de Negocios`.

Documento base:

- `docs/epica-2-gestion-negocios.md`

Avance actual:

- `HU-2.1` implementada en backend con direccion textual.
- Persistencia extendida en `Business` con `address`, `latitude` y `longitude`
  opcionales.
- Visibilidad publica separada mediante `listingStatus`.
- Endpoint de actualizacion de perfil: `PATCH /api/business/:businessId/profile`.
- Google Maps queda en rollover justificado hasta la experiencia mobile de
  descubrimiento/mapa.
- `HU-2.2` implementada en backend para configurar y leer horarios semanales y
  dias no laborables.
- Endpoints de horarios: `GET /api/business/:businessId/hours` y
  `PUT /api/business/:businessId/hours`.
- Regla base de disponibilidad publica preparada para que discovery mobile
  muestre solo negocios accionables en el MVP inicial.
- `HU-2.3` implementada en backend para configurar ventanillas o cajas activas.
- Endpoint de ventanillas activas:
  `PUT /api/business/:businessId/service-windows`.
- Un negocio con `0` ventanillas activas queda sin atencion disponible para
  nuevos turnos, y queda preparado un servicio puro de estimacion de espera para
  integrarse con la cola persistida en epicas posteriores.
- `HU-2.4` implementada en backend como canal QR de entrada a Espera.
- Endpoints de QR:
  `GET /api/business/:businessId/qr`,
  `POST /api/business/:businessId/qr/regenerate`,
  `GET /api/business/:businessId/qr.png` y `GET /api/qr/:token`.
- El QR apunta a `{APP_URL}/q/:token`, permite descarga PNG desde el panel y
  conserva el codigo anterior durante 24 horas al regenerar.
- `HU-2.5` implementada en backend para cambiar estado operativo del negocio.
- Endpoint de estado operativo:
  `PATCH /api/business/:businessId/operational-status`.
- Estados soportados: `normal`, `delayed`, `paused`, `closed`. `delayed`
  mantiene turnos habilitados con indicador amarillo; `paused` y `closed`
  bloquean nuevos turnos.
- Al cambiar a `closed`, se emite el evento `business.closed` para integracion
  posterior con notificaciones push a turnos activos.
- `HU-2.6` implementada en backend para editar datos del negocio y exponer
  atributos de configuracion por categoria.
- Endpoints relacionados:
  `PATCH /api/business/:businessId/profile` y
  `GET /api/business/categories/:categoryId/config`.
