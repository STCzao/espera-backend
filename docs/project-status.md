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
- `npm run build`: ok
- `npm run lint`: falla

## Conclusion

El proyecto tiene una base tecnica valida y una direccion arquitectonica
correcta, pero su lectura adecuada es la de una fase 1 avanzada, no la de un
MVP de producto completo.
