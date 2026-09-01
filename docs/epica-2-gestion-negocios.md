# Épica 2 - Gestión de Negocios

## Resumen

La Épica 2 corresponde a la gestión operativa inicial del negocio. Su objetivo
es que una cuenta de negocio aprobada pueda completar la información necesaria
para aparecer y operar dentro de Espera.

Alcance total estimado: `18 pts`.

Formato de referencia:

- `docs/story-documentation-standard.md`

## Estado general

- Estado: `implementado`.
- Historias implementadas: `HU-2.1`, `HU-2.2`, `HU-2.3`, `HU-2.4`,
  `HU-2.5`, `HU-2.6`, `HU-2.8`.
- Historia omitida en numeración: `HU-2.7` no está definida en el backlog
  documentado de esta épica.

## Contratos principales de la épica

Panel de negocio:

```text
POST /api/business
GET /api/business/me
PATCH /api/business/:businessId/profile
GET /api/business/categories/:categoryId/config
GET /api/business/:businessId/hours
PUT /api/business/:businessId/hours
PATCH /api/business/:businessId/operational-status
GET /api/business/:businessId/qr
POST /api/business/:businessId/qr/regenerate
GET /api/business/:businessId/qr.png
POST /api/business/:businessId/employees/invitations
GET /api/business/:businessId/employees
GET /api/business/:businessId/employees/invitations
DELETE /api/business/:businessId/employees/:userId
DELETE /api/business/:businessId/employees/invitations/:invitationId
```

Público:

```text
GET /api/qr/:token
POST /api/business/employee-invitations/:token/accept
```

## Corte recomendado para panel

El primer corte funcional del panel debería cubrir:

- completar y editar perfil del negocio
- configurar horarios y días no laborables
- configurar ventanillas activas
- consultar y descargar QR
- regenerar QR
- cambiar estado operativo
- invitar, listar y revocar empleados

Este corte permite validar valor para negocios sin depender todavía de app
mobile completa ni cola persistida.

## HU-2.1 - Registrar negocio con nombre, categoría y dirección

Story points: `3`

Estado: `implementado`.

Como negocio, quiero registrar mi negocio con nombre, categoría y dirección.

### Criterios de Aceptación

- Dado que completo nombre, categoría y dirección, cuando guardo, entonces mi
  negocio queda registrado con estado `pendiente de aprobación`.
- Dado que ingreso una dirección, cuando la confirmo, entonces se almacena como
  dirección textual del negocio.
- Dado que no completo un campo obligatorio, cuando intento guardar, entonces
  veo validación específica por campo.

### Rollover justificado de Google Maps

La geocodificación automática con Google Maps queda diferida. Motivo: en esta
épica el panel del negocio necesita gestionar datos operativos, no visualizar un
mapa. La aparición del negocio en mapa/listado corresponde a la experiencia del
usuario final en la app mobile.

El modelo deja preparados `latitude` y `longitude`, pero son opcionales. Si
`GOOGLE_MAPS_API_KEY` está configurada, el backend puede enriquecer el negocio
con coordenadas. Si no está configurada, el guardado de la dirección textual no
se bloquea.

La validación completa de geocoding y mapa debería retomarse en:

- `HU-7.1` búsqueda de negocios cercanos
- `HU-7.7` mapa de negocios cercanos

### Implementación backend

Estado: `implementado`.

Persistencia agregada en `Business`:

- `address`
- `latitude` opcional
- `longitude` opcional
- `listingStatus`

`listingStatus` separa la visibilidad pública del negocio del acceso al panel.
Estados iniciales:

- `DRAFT`: el negocio puede configurarse desde el panel, pero no aparece en la
  app mobile ni en el mapa.
- `HIDDEN`: el negocio fue ocultado voluntariamente por el owner o por una regla
  operativa, pero conserva acceso al panel.
- `PUBLISHED`: el negocio aparece para usuarios finales en búsqueda/mapa cuando
  también cumple las reglas operativas correspondientes.

Esta separación evita mezclar tres conceptos distintos:

- aprobación de cuenta: si el negocio puede acceder al panel
- visibilidad pública: si aparece en la app mobile/mapa
- estado operativo: si acepta turnos en ese momento

Endpoints relevantes:

```text
POST /api/business
PATCH /api/business/:businessId/profile
```

`POST /api/business` permite crear un negocio con nombre, categoría, slug y
dirección para cualquier usuario autenticado (sin `authorize("business:edit")`:
ese permiso solo lo tiene `business_admin`, y el propósito del endpoint es
justamente promover a `business_admin` a un usuario que todavía no lo es). El
use case rechaza internamente cuentas con rol `employee`
(`EMPLOYEE_CANNOT_CREATE_BUSINESS`), que es el único caso que necesita
bloquearse. El owner queda como `business_admin` pendiente de aprobación
cuando corresponde.

Este endpoint no reemplaza a `POST /api/auth/register-business`. La diferencia
de producto es:

- `POST /api/auth/register-business`: onboarding público que crea cuenta de
  negocio y negocio inicial en una misma solicitud.
- `POST /api/business`: creación desde una cuenta autenticada existente; puede
  iniciar el onboarding de negocio para esa cuenta promoviendo al owner a
  `business_admin` pendiente cuando corresponda.

`PATCH /api/business/:businessId/profile` permite completar o editar el perfil
operativo de un negocio existente. Valida ownership del negocio y guarda la
dirección textual. Si hay API key de Google Maps configurada, también guarda
coordenadas.

Variable opcional para geocoding real:

```env
GOOGLE_MAPS_API_KEY=
```

Ejemplo de body para completar perfil:

```json
{
  "name": "Cafe Espera",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "address": "Av. Corrientes 1234, CABA"
}
```

Respuesta esperada de `POST /api/business`:

```json
{
  "businessId": "uuid",
  "businessSlug": "cafe-espera",
  "status": "pending"
}
```

Usar `businessId` para llamadas subsiguientes a `/:businessId/*`. Usar `businessSlug` para navegación y display. Llamar `POST /api/auth/refresh-token` inmediatamente después para obtener un JWT con `role: business_admin`.

Respuesta esperada de `PATCH /api/business/:businessId/profile`:

```json
{
  "businessId": "uuid",
  "address": "Av. Corrientes 1234, CABA",
  "latitude": -34.6037,
  "longitude": -58.3816,
  "listingStatus": "draft"
}
```

`latitude` y `longitude` pueden omitirse si geocoding no está configurado.

### Cobertura

- `tests/unit/business/RegisterBusinessUseCase.test.ts`
- `tests/unit/business/UpdateBusinessProfileUseCase.test.ts`

Cobertura actual:

- creación de negocio con dirección textual
- promoción de owner a `business_admin` pendiente cuando corresponde
- validación de slug duplicado
- validación de dirección obligatoria
- edición de perfil con validación de ownership
- persistencia de dirección textual sin requerir Google Maps
- persistencia opcional de latitud/longitud cuando el geocoder devuelve datos
- mantenimiento de `listingStatus: draft` al completar el perfil

## HU-2.2 - Configurar horarios de atención

Story points: `3`

Estado: `implementado`.

Como negocio, quiero configurar mis horarios de atención.

### Criterios de Aceptación

- Dado que configuro horarios por día de semana, cuando guardo, entonces el
  panel conserva la configuración para determinar disponibilidad operativa.
- Dado que es fuera de mi horario de atención, cuando un usuario final busca
  negocios disponibles, entonces mi negocio no aparece como disponible para
  nuevos turnos.
- Dado que configuro días no laborables, entonces esos días no aparezco como
  disponible para nuevos turnos.

### Decisión de producto

Espera prioriza inmediatez: entrar en cola, reservar lugar o anticipar una
visita mientras el usuario está en camino. A diferencia de un catálogo de
locales, el mapa/listado principal de la app mobile debe mostrar negocios
accionables.

Para el MVP inicial, un negocio fuera de horario no aparece en discovery
principal. La visualización de negocios cerrados por búsqueda directa,
favoritos, historial o turnos programados queda fuera de alcance.

### Implementación backend

Estado: `implementado`.

Persistencia agregada:

- `BusinessOpeningHour`: rangos recurrentes por día de semana.
- `BusinessNonWorkingDay`: fechas excepcionales en las que el negocio no
  atiende.

Convención de días:

- `0`: domingo
- `1`: lunes
- `2`: martes
- `3`: miércoles
- `4`: jueves
- `5`: viernes
- `6`: sábado

Endpoint relevante:

```text
GET /api/business/:businessId/hours
PUT /api/business/:businessId/hours
```

`GET /api/business/:businessId/hours` permite al panel recuperar la grilla
guardada para editarla.

`PUT /api/business/:businessId/hours` reemplaza la configuración completa de
horarios del negocio. Valida ownership, formato horario `HH:mm`, apertura
anterior al cierre, rangos no solapados para el mismo día y fechas no
laborables válidas en formato `YYYY-MM-DD`.

Ejemplo de body:

```json
{
  "weeklyHours": [
    {
      "dayOfWeek": 1,
      "opensAt": "09:00",
      "closesAt": "13:00"
    },
    {
      "dayOfWeek": 1,
      "opensAt": "14:00",
      "closesAt": "18:00"
    }
  ],
  "nonWorkingDays": [
    {
      "date": "2026-12-25",
      "reason": "Feriado"
    }
  ]
}
```

Respuesta esperada:

```json
{
  "businessId": "uuid",
  "weeklyHours": [
    {
      "dayOfWeek": 1,
      "opensAt": "09:00",
      "closesAt": "13:00"
    }
  ],
  "nonWorkingDays": [
    {
      "date": "2026-12-25",
      "reason": "Feriado"
    }
  ]
}
```

### Contratos diferidos

La HU queda cerrada para configuración desde panel y regla base de
disponibilidad. La app mobile futura deberá consumir esa regla para filtrar
negocios disponibles.

Regla inicial de disponibilidad pública:

- `listingStatus` debe ser `published`.
- La fecha actual no debe ser un día no laborable.
- La hora actual debe caer dentro de un rango configurado para el día actual.

Por ahora no se soportan rangos nocturnos que crucen medianoche, por ejemplo
`22:00` a `02:00`. Si el producto incorpora rubros nocturnos, esa regla deberá
ampliarse explícitamente.

### Cobertura

- `tests/unit/business/ConfigureBusinessHoursUseCase.test.ts`
- `tests/unit/business/GetBusinessHoursUseCase.test.ts`
- `tests/unit/business/BusinessAvailabilityService.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- configuración de horarios semanales y días no laborables
- lectura de horarios para el panel
- validación de ownership
- validación de apertura anterior al cierre
- validación de rangos solapados
- validación de días no laborables duplicados
- validación de fechas calendario inválidas
- disponibilidad pública dentro de horario
- ocultamiento fuera de horario
- ocultamiento en días no laborables
- ocultamiento cuando el negocio no está publicado
- contrato HTTP de `GET` y `PUT` de horarios

## HU-2.3 - Definir ventanillas o cajas activas

Story points: `2`

Estado: `implementado`.

Como negocio, quiero definir cuantas ventanillas o cajas tengo activas.

### Criterios de Aceptación

- Dado que cambio la cantidad de ventanillas activas, cuando guardo, entonces el
  tiempo estimado de espera se recalcula automáticamente.
- Dado que tengo `0` ventanillas activas, cuando un usuario ve mi negocio,
  entonces aparece como `Sin atención disponible`.

### Implementación backend

Estado: `implementado`.

Persistencia agregada en `Business`:

- `activeServiceWindows`: cantidad de ventanillas, cajas o puntos de atención
  activos para procesar turnos en paralelo.

Reglas:

- El valor inicial es `1`.
- Se permite `0` para indicar que el negocio no tiene atención disponible.
- No se permiten valores negativos, decimales ni cantidades mayores a `50`.
- Un negocio con `activeServiceWindows = 0` no se considera disponible para
  recibir nuevos turnos aunque esté publicado y dentro del horario de atención.

Endpoint relevante:

```text
PUT /api/business/:businessId/service-windows
```

El endpoint permite al panel actualizar la cantidad de ventanillas activas.
Valida ownership del negocio y requiere permiso `business:edit`.

Ejemplo de body:

```json
{
  "activeServiceWindows": 3
}
```

Respuesta esperada:

```json
{
  "businessId": "uuid",
  "activeServiceWindows": 3,
  "attentionAvailable": true
}
```

Si el valor es `0`, `attentionAvailable` vuelve como `false`.

### Contrato de estimación inicial

Como la cola persistida y el conteo real de turnos activos pertenecen a épicas
posteriores, esta HU deja preparado un servicio puro de estimación. La regla
inicial calcula la espera por capacidad paralela:

```text
ceil(turnos_en_espera / ventanillas_activas) * minutos_promedio_por_turno
```

Si no hay ventanillas activas, la estimación devuelve estado sin atención
disponible en lugar de minutos.

### Cobertura

- `tests/unit/business/BusinessAvailabilityService.test.ts`
- `tests/unit/queue/QueueWaitEstimateService.test.ts`
- `tests/api/business/business.api.test.ts`

### Superseded (bugfix `bugfix/resolve-service-window-model-gap`, 2026-08-10)

`PUT /api/business/:businessId/service-windows`,
`ConfigureBusinessServiceWindowsUseCase` y, en un segundo paso (Fase B, misma
rama), el propio campo `Business.activeServiceWindows` **se eliminaron por
completo** — dominio, columna de base (migración
`20260810010000_drop_business_active_service_windows`) y los ~13 archivos
que todavía lo leían o le asignaban un default. Ver `docs/epica-3-cola.md`,
secciones *"Bugfix — cierre del modelo de ventanillas, Fase A"* y *"Fase
B"*, para el detalle completo: el modelo real `ServiceWindow` (Épica 3) pasó
a crearse automáticamente en toda `Queue` nueva, haciendo innecesario todo
lo que describe esta sección de HU-2.3 (que queda documentada solo como
referencia histórica de qué se implementó originalmente).

Cobertura actual:

- configuración de ventanillas activas
- permiso solo para owner del negocio
- validación de `0` como pausa operativa válida
- rechazo de negativos y decimales
- negocio no disponible con `0` ventanillas activas
- estimación de espera usando ventanillas como capacidad paralela

## HU-2.4 - Generar QR único del negocio

Story points: `3`

Estado: `implementado`.

Como negocio, quiero generar el QR único de mi negocio para pegarlo en el local.

### Criterios de Aceptación

- Dado que accedo a la sección QR del panel, cuando solicito generarlo, entonces
  se genera un QR único vinculado a mi negocio.
- Dado que escanean mi QR, cuando el usuario apunta la cámara, entonces es
  redirigido al flujo de sacar turno en mi negocio.
- Dado que descargo el QR, entonces obtengo un archivo PNG de alta resolución
  listo para imprimir.
- Dado que regenero el QR, entonces el QR anterior queda inválido en 24 horas,
  manteniendo una transición para quienes lo tengan guardado.

### Decisión de producto

El QR es un canal de entrada al ecosistema Espera. La persona que escanea suele
estar frente al local y tiene una necesidad inmediata: anotarse o acceder al
servicio. Por eso el primer paso no debe bloquearse con la descarga obligatoria
de la app.

Flujo deseado:

```text
Escaneo QR
-> landing ligera / deep link
-> negocio y disponibilidad
-> inicio del flujo de turno
-> invitación a descargar la app para seguimiento y avisos
```

La descarga de la app debe aparecer como una mejora clara de experiencia:

- seguir el lugar en la cola
- recibir avisos cuando falten pocos turnos
- salir del local sin perder visibilidad del turno
- guardar negocios frecuentes
- recibir cambios si el negocio pausa o cierra atención

### Implementación backend

Estado: `implementado`.

Persistencia agregada:

- `BusinessQrCode`: códigos QR vinculados a un negocio.
- `BusinessQrCodeStatus`: `ACTIVE`, `RETIRING`, `REVOKED`.

Reglas:

- Si el negocio no tiene QR activo, el backend genera uno al consultarlo.
- El QR embebe una URL pública de app/web:

```text
{APP_URL}/q/:token
```

- El panel puede regenerar el QR.
- Al regenerar, el QR anterior pasa a `RETIRING` y sigue resolviendo durante 24
  horas para mantener una transición operativa.
- Los QR retirados vencidos o revocados no resuelven.

Endpoints panel:

```text
GET /api/business/:businessId/qr
POST /api/business/:businessId/qr/regenerate
GET /api/business/:businessId/qr.png
```

Todos requieren autenticación, permiso `business:edit` y ownership del negocio.

Endpoint público:

```text
GET /api/qr/:token
```

Este endpoint resuelve un token escaneado y devuelve el contrato para abrir el
flujo de turno del negocio en web/app.

Responsabilidad de módulos: `business-qr` conserva la generación, descarga,
regeneración y resolución backend del QR. La pantalla pública frontend
`/q/:token` puede vivir en un módulo `public-entry`; ese módulo consume
`GET /api/qr/:token` y decide si abre web, deep link o invitación a app.

Ejemplo de respuesta para el panel:

```json
{
  "businessId": "uuid",
  "token": "qr-token",
  "qrUrl": "https://espera.app/q/qr-token",
  "downloadUrl": "/api/business/uuid/qr.png",
  "status": "active"
}
```

Ejemplo de respuesta pública:

```json
{
  "token": "qr-token",
  "qrUrl": "https://espera.app/q/qr-token",
  "qrStatus": "active",
  "action": "OPEN_BUSINESS_TURN_FLOW",
  "appPath": "/business/uuid/turns/new",
  "business": {
    "id": "uuid",
    "name": "Cafe Espera",
    "slug": "cafe-espera",
    "categoryId": "uuid",
    "address": "Av. Corrientes 1234, CABA",
    "listingStatus": "published",
    "activeServiceWindows": 2
  }
}

```

### Contratos diferidos

La HU deja listo el backend para la experiencia de escaneo, pero la pantalla
pública `/q/:token`, deep links nativos y medición de conversión a app quedan
del lado frontend/mobile.

El flujo real de sacar turno con cola persistida corresponde a épicas
posteriores. En esta HU el backend devuelve el contrato `OPEN_BUSINESS_TURN_FLOW`
para que esa experiencia se conecte cuando la cola este implementada.

### Cobertura

- `tests/unit/business/GetBusinessQrCodeUseCase.test.ts`
- `tests/unit/business/RegenerateBusinessQrCodeUseCase.test.ts`
- `tests/unit/business/ResolveBusinessQrCodeUseCase.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- generación perezosa de QR activo
- lectura del QR activo existente
- regeneración con transición de 24 horas
- resolución de QR activo y QR en transición
- rechazo de QR vencido
- contratos HTTP de panel y resolución pública

## HU-2.5 - Cambiar estado operativo del negocio

Story points: `2`

Estado: `implementado`.

Como negocio, quiero cambiar mi estado operativo desde el panel.

### Criterios de Aceptación

- Dado que cambio a estado `Con demoras`, cuando un usuario ve mi negocio,
  entonces ve el indicador amarillo con la leyenda correspondiente.
- Dado que cambio a estado `Pausado`, cuando usuarios intenten sacar turno,
  entonces ven que no se aceptan nuevos turnos temporalmente.
- Dado que cambio a estado `Cerrado`, entonces todos los turnos activos reciben
  notificación push de cierre anticipado.

### Implementación backend

Estado: `implementado`.

Persistencia agregada en `Business`:

- `operationalStatus`: estado operativo actual del negocio.

Estados:

- `NORMAL`: atención disponible según horario, visibilidad y ventanillas.
- `DELAYED`: acepta nuevos turnos, pero expone indicador amarillo y mensaje
  `Con demoras`.
- `PAUSED`: no acepta nuevos turnos temporalmente.
- `CLOSED`: no acepta nuevos turnos y emite evento de cierre anticipado.

Endpoint relevante:

```text
PATCH /api/business/:businessId/operational-status
```

El endpoint valida ownership del negocio y requiere permiso `business:edit`.

Ejemplo de body:

```json
{
  "operationalStatus": "delayed"
}
```

Respuesta esperada:

```json
{
  "businessId": "uuid",
  "operationalStatus": "delayed",
  "acceptsNewTurns": true,
  "indicator": "yellow",
  "customerMessage": "Con demoras."
}
```

Reglas de disponibilidad pública:

- `DELAYED` mantiene el negocio disponible para nuevos turnos.
- `PAUSED` y `CLOSED` bloquean disponibilidad para nuevos turnos.
- Las reglas previas siguen aplicando: negocio publicado, dentro de horario, sin
  día no laborable y con al menos una ventanilla activa.

### Contrato de cierre anticipado

Cuando el negocio cambia a `CLOSED`, el backend emite el evento de dominio:

```text
business.closed
```

Payload:

```json
{
  "businessId": "uuid",
  "ownerUserId": "uuid",
  "previousStatus": "delayed",
  "reason": "Cierre anticipado",
  "occurredAt": "2026-06-17T00:00:00.000Z"
}
```

La notificación push efectiva a turnos activos queda como integración diferida
hasta que exista cola persistida, dispositivos de usuarios y outbox funcional.
La HU deja listo el contrato para esa integración.

### Cobertura

- `tests/unit/business/UpdateBusinessOperationalStatusUseCase.test.ts`
- `tests/unit/business/BusinessAvailabilityService.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- cambio a `DELAYED` con indicador amarillo y turnos habilitados
- cambio a `PAUSED` con turnos bloqueados
- cambio a `CLOSED` con turnos bloqueados
- emisión de `business.closed` al cerrar por primera vez
- no reemitir evento si ya estaba cerrado
- validación de ownership
- contrato HTTP del endpoint de estado operativo

## HU-2.6 - Editar datos del negocio

Story points: `2`

Estado: `implementado`.

Como negocio, quiero editar los datos de mi negocio.

### Criterios de Aceptación

- Dado que edito el nombre o dirección, cuando guardo, entonces los cambios se
  reflejan inmediatamente en la app de usuarios.
- Dado que cambio la categoría, entonces los atributos específicos de la nueva
  categoría se habilitan en el formulario de configuración.

### Implementación backend

Estado: `implementado`.

La edición de datos reutiliza el endpoint de perfil operativo ya existente:

```text
PATCH /api/business/:businessId/profile
```

Permite actualizar:

- `name`
- `categoryId`
- `address`

El endpoint valida ownership, persiste los cambios inmediatamente y devuelve la
configuración de atributos correspondiente a la categoría seleccionada para que
el panel pueda actualizar el formulario sin depender de reglas hardcodeadas en
frontend.

Ejemplo de body:

```json
{
  "name": "Cafe Espera Renovado",
  "categoryId": "33333333-3333-4333-8333-333333333333",
  "address": "Av. Santa Fe 1234, CABA"
}
```

Respuesta esperada:

```json
{
  "businessId": "uuid",
  "name": "Cafe Espera Renovado",
  "categoryId": "33333333-3333-4333-8333-333333333333",
  "address": "Av. Santa Fe 1234, CABA",
  "listingStatus": "draft",
  "categoryConfig": {
    "categoryId": "33333333-3333-4333-8333-333333333333",
    "attributes": [
      {
        "key": "averageServiceMinutes",
        "label": "Tiempo promedio por trámite",
        "type": "number",
        "required": true
      }
    ]
  }
}
```

Endpoint auxiliar para consultar atributos antes de guardar:

```text
GET /api/business/categories/:categoryId/config
```

Este endpoint permite que el panel habilite atributos específicos apenas el
usuario cambia la categoría en el formulario.

### Contratos diferidos

La persistencia de valores de atributos específicos por categoría queda diferida
hasta que el producto defina cuáles impactan reglas operativas reales. En esta
HU el backend deja cerrado el contrato de metadata que habilita el formulario.

### Cobertura

- `tests/unit/business/UpdateBusinessProfileUseCase.test.ts`
- `tests/unit/business/GetBusinessCategoryConfigUseCase.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- edición de nombre, categoría y dirección
- persistencia inmediata de cambios del perfil
- respuesta con atributos de la categoría seleccionada
- endpoint auxiliar de configuración de categoría
- fallback de atributos base para categorías no catalogadas
- validación de ownership

## HU-2.8 - Invitar empleados al panel

Story points: `3`

Estado: `implementado`.

Como negocio, quiero invitar empleados a operar mi panel con su propio acceso.

### Criterios de Aceptación

- Dado que ingreso el email de un empleado y envío invitación, cuando el
  empleado acepta, entonces tiene acceso al panel con rol `employee`.
- Dado que un empleado tiene rol `employee`, entonces puede operar la cola pero
  no puede acceder a configuración del negocio ni métricas.
- Dado que revoco el acceso de un empleado, entonces su sesión activa se
  invalida inmediatamente.

### Objetivo de producto

Permitir que un negocio delegue la operación diaria de la cola sin compartir la
cuenta owner/admin del negocio.

### Decisiones de alcance

La historia queda cerrada en backend para el corte de panel. La invitación se
modela como un flujo por token: el owner envía una invitación al email del
empleado, el empleado acepta con sus datos de acceso y el sistema crea o
promueve la cuenta con rol global `employee`.

El rol global `employee` no alcanza por sí solo para determinar dónde puede
operar. Por eso se agregó una relación explícita entre usuario empleado y
negocio.

### Implementación backend

Estado: `implementado`.

Persistencia agregada:

- `BusinessEmployee`: relación entre negocio y usuario empleado.
- `BusinessEmployeeInvitation`: invitaciones pendientes, aceptadas, revocadas o
  expiradas.

Estados de empleado:

- `ACTIVE`
- `REVOKED`

Estados de invitación:

- `PENDING`
- `ACCEPTED`
- `REVOKED`
- `EXPIRED`

Endpoints panel:

```text
POST /api/business/:businessId/employees/invitations
GET /api/business/:businessId/employees
GET /api/business/:businessId/employees/invitations
DELETE /api/business/:businessId/employees/:userId
DELETE /api/business/:businessId/employees/invitations/:invitationId
```

Todos requieren autenticación, permiso `employee:manage` y ownership del
negocio.

Endpoint público de aceptación:

```text
POST /api/business/employee-invitations/:token/accept
```

Este endpoint permite aceptar la invitación sin sesión previa. Si el email no
existe, crea una cuenta local aprobada y verificada con rol `employee`. Si el
usuario ya existe y su rol es compatible, lo vincula al negocio como empleado.

Ejemplo de invitación:

```json
{
  "email": "empleado@local.com"
}
```

Respuesta esperada:

```json
{
  "invitationId": "uuid",
  "businessId": "uuid",
  "email": "empleado@local.com",
  "status": "pending",
  "expiresAt": "2026-06-24T00:00:00.000Z"
}
```

Ejemplo de aceptación:

```json
{
  "firstName": "Ana",
  "lastName": "García",
  "password": "Password123!"
}
```

Respuesta esperada:

```json
{
  "businessId": "uuid",
  "userId": "uuid",
  "role": "employee",
  "status": "active"
}
```

### Reglas de negocio

- Solo `business_admin` owner del negocio puede invitar o revocar empleados.
- No se puede invitar al owner como empleado de su propio negocio.
- No se puede duplicar una relación activa ni una invitación pendiente vigente.
- Las invitaciones expiran a los 7 días.
- El empleado puede operar cola del negocio asignado.
- El empleado no puede editar configuración del negocio ni acceder a métricas.
- Revocar acceso marca la relación como `REVOKED` e invalida las refresh
  sessions activas del empleado.

### Bugfix — visibilidad de invitaciones pendientes (`bugfix/panel-clarity-fixes`, 2026-08-10)

`ListBusinessEmployeesUseCase` solo lista empleados ya activos (`status`
hardcodeado a `"active"`) — no existía forma consultable de ver una
invitación enviada que todavía no fue aceptada. Si el dueño invitaba a
alguien y esa persona nunca abría el mail, no había ninguna señal de que
algo quedó colgado.

Nuevo endpoint, mismo permiso (`employee:manage`, ownership):

```text
GET /api/business/:businessId/employees/invitations
```

```json
{
  "businessId": "uuid",
  "invitations": [
    { "invitationId": "uuid", "email": "empleado@local.com", "invitedAt": "2026-08-10T00:00:00.000Z", "expiresAt": "2026-08-17T00:00:00.000Z" }
  ]
}
```

`ListPendingBusinessEmployeeInvitationsUseCase` (nuevo) filtra por
`status: "pending"` **y** `expiresAt > now` en el propio use case — no
confía únicamente en el estado persistido, porque nada pasa una invitación
vencida a `EXPIRED` automáticamente (mismo espíritu de reconciliación
perezosa que `ResolveEffectiveSubscriptionStatusUseCase` con el trial de
`Subscription`).

### Documentación inline

Se dejó contexto inline en los puntos donde la intención no es obvia solo por
tipos o nombres:

- `BusinessEmployee`: aclara la diferencia entre rol global `employee` y
  membresía por negocio.
- `BusinessEmployeeInvitation`: aclara el alcance del token de invitación.
- `InviteBusinessEmployeeUseCase`: documenta ownership, invitaciones vigentes y
  token opaco.
- `AcceptBusinessEmployeeInvitationUseCase`: documenta expiración persistida,
  promoción de usuarios existentes y reactivación de membresía.
- `ListBusinessEmployeesUseCase`: documenta por qué el panel lista solo
  membresías activas.
- `ListPendingBusinessEmployeeInvitationsUseCase`: documenta el gap que cierra
  y por qué filtra `expiresAt` en vez de confiar en el status persistido.
- `RevokeBusinessEmployeeUseCase`: documenta el alcance de la revocación de
  refresh sessions frente a access tokens ya emitidos.
- Repositorios Postgres de empleados e invitaciones: documentan mapeo de enums,
  reactivación por `upsert` y trazabilidad de membresías revocadas.

### Contratos diferidos

- Diseño final del email transaccional de invitación.
- UI de aceptación de invitación en panel o landing web.
- Chequeo contextual de membresía por negocio al conectar la cola persistida.
- Invalidación inmediata de access tokens ya emitidos si se requiere revocación
  estricta antes del vencimiento natural del token.

### Cobertura

- `tests/unit/business/InviteBusinessEmployeeUseCase.test.ts`
- `tests/unit/business/AcceptBusinessEmployeeInvitationUseCase.test.ts`
- `tests/unit/business/ListBusinessEmployeesUseCase.test.ts`
- `tests/unit/business/RevokeBusinessEmployeeUseCase.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- invitación de empleados por owner
- rechazo de invitaciones duplicadas vigentes
- rechazo de invitación al owner
- aceptación de invitación vigente
- expiración de invitaciones vencidas
- creación de usuario empleado al aceptar
- vinculación de usuario existente con rol compatible
- listado de empleados activos
- revocación de empleado
- invalidación de refresh sessions al revocar
- contratos HTTP de invitación, listado, aceptación y revocación

### Bugfix — no existía forma de cancelar una invitación pendiente (2026-09-01)

Rama: `bugfix/ownership-operaciones-cola` (mismo trabajo que los bugfixes
anteriores de esta rama). Encontrado en la auditoría general del proyecto:
`InviteBusinessEmployeeUseCase` no tenía contraparte de cancelación — una
invitación enviada por error (email equivocado, candidato que el negocio
descartó) quedaba con un link de aceptación válido por los 7 días
completos, sin que el owner pudiera hacer nada al respecto. El modelo de
datos ya anticipaba esto (`BusinessEmployeeInvitationStatus` incluye
`"revoked"`, `revokedAt` ya existía en el schema) — simplemente ningún caso
de uso lo escribía.

Nuevo endpoint, mismo permiso y ownership que el resto de la gestión de
empleados:

```text
DELETE /api/business/:businessId/employees/invitations/:invitationId   employee:manage
```

`CancelBusinessEmployeeInvitationUseCase` (nuevo): valida ownership del
negocio, resuelve la invitación por id y confirma que pertenece a ese
negocio (mismo espíritu que los fixes de IDOR de `epica-3-cola.md` — evita
que un id de invitación de otro negocio, adivinado o filtrado, sea
cancelable desde una request ajena), exige que esté `"pending"` (409
`EMPLOYEE_INVITATION_NOT_PENDING` si ya fue aceptada/revocada), y la marca
`"revoked"` con `revokedAt`. `AcceptBusinessEmployeeInvitationUseCase` ya
rechaza cualquier invitación que no esté `"pending"` con
`EMPLOYEE_INVITATION_NOT_FOUND` — cancelar corta el link de aceptación de
inmediato, sin tocar ese use case.

Response:

```json
{ "invitationId": "uuid", "businessId": "uuid", "status": "revoked" }
```

Cobertura: `tests/unit/business/CancelBusinessEmployeeInvitationUseCase.test.ts`
(9 casos: cancelación exitosa, corta la aceptación posterior, `404` negocio
inexistente, `403` no-owner, `404` invitación inexistente, `404` invitación
de otro negocio, `409` ya aceptada, `409` ya revocada, `400` id inválido).

669 tests en verde (suite completa), `tsc --noEmit` limpio en `src` y en
tests.

## Bugfix - Resolución del negocio del usuario autenticado

Estado: `implementado`.

### Problema

`GET /api/auth/me` nunca devolvía el negocio del usuario autenticado: el JWT no
firmaba `businessId` y el modelo `User` no tiene esa relación directa. Además,
la relación real `User -> Business` es `1:N` vía `Business.ownerUserId` (no
`1:1`), por lo que un campo único en el token no podía representarla.

### Contrato backend

```text
GET /api/business/me
```

Requiere solo autenticación (sin `authorize("business:edit")`): es un endpoint
de descubrimiento, no de edición. Una cuenta con rol `user` que todavía no
creó un negocio debe recibir `200 { businesses: [] }`, no `403`, porque el
caso de uso ya scopea por `ownerUserId = request.user.id` — el gate de rol no
agregaba ninguna protección real y mezclaba "sin negocio" con "sin permiso".

Devuelve los negocios donde el usuario autenticado es `ownerUserId`, resueltos
en cada request (no embebidos en el JWT) para evitar que el token quede
desactualizado si el usuario crea un negocio después de loguearse.

Respuesta esperada:

```json
{
  "businesses": [
    {
      "id": "uuid",
      "name": "Cafe Espera",
      "slug": "cafe-espera",
      "status": "pending",
      "listingStatus": "draft",
      "operationalStatus": "normal"
    }
  ]
}
```

### Decisión de alcance

Se eliminó el campo `businessId` del payload de `request.user`
(`middleware/authenticate.ts`, `shared/types/express.d.ts`): nunca se firmaba
en el JWT y ningún código lo leía, por lo que mantenerlo perpetuaba la
confusión que originó este bug. `GET /api/auth/me` sigue devolviendo solo
identidad (`id`, `email`, `role`, `approvalStatus`); la resolución de negocios
queda exclusivamente en `GET /api/business/me`.

### Cobertura

- Validado con `npm run typecheck`, `npm run lint` y `npm run test:run`
  (suite existente, sin tests nuevos: el módulo `business` no tiene tests
  unitarios para use cases todavía).

## Bugfix - Permiso incorrecto en POST /api/business

Estado: `implementado`.

### Problema

`POST /api/business` (`RegisterBusinessUseCase`) existe para que una cuenta ya
autenticada con rol `user` inicie el onboarding de negocio, promoviéndose a
`business_admin` `pending` en el proceso. La ruta exigía
`authorize("business:edit")`, permiso que solo tiene `business_admin`
(`middleware/authorize.ts`) — bloqueaba exactamente al actor para el que el
endpoint fue diseñado, con `403`, antes de llegar al use case. Mismo patrón
que el bug de `GET /api/business/me` corregido arriba.

### Fix

Se quitó `authorize("business:edit")` de la ruta. El use case ya valida
internamente el único caso que debe bloquearse (`user.role === "employee"` →
`EMPLOYEE_CANNOT_CREATE_BUSINESS`), así que el gate de rol en la ruta no
aportaba protección adicional.

```text
POST /api/business
```

Ahora requiere solo autenticación.

### Cobertura

- Validado con `npm run typecheck`, `npm run lint` y `npm run test:run`
  (suite existente).

## Bugfix - Slug autogenerado en registro de negocio (HU-2.1)

Estado: `implementado`.

Rama: `bugfix/pre-e3-schema-debt`.

### Problema

Los tres flujos de creación de negocio (`POST /api/business`,
`POST /api/auth/register-business` y `POST /api/auth/register-business/google`)
requerían que el cliente enviara un campo `slug` / `businessSlug` en el body.
El formulario de registro lo exponía como "Identificador del negocio" sin
contexto de que era una URL pública única, generando fricciones y slugs
inconsistentes.

### Solución

Se introduce `src/shared/utils/slug.ts` con `generateUniqueSlug(name, findBySlug)`:

- Convierte el nombre del negocio a slug kebab-case sin tildes ni caracteres
  especiales (`toBaseSlug`).
- Si el slug base ya existe, intenta con sufijo numérico (`-2`, `-3` … `-10`).
- Si los diez intentos colisionan, añade un sufijo alfanumérico aleatorio de
  4 caracteres como fallback.

Los tres use cases de creación de negocio dejan de aceptar `slug` /
`businessSlug` como campo de entrada y lo generan internamente.

### Contratos actualizados

`POST /api/business` — ya no acepta `slug` en el body:

```json
{
  "name": "Cafe Espera",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "address": "Av. Corrientes 1234, CABA"
}
```

`POST /api/auth/register-business` — ya no acepta `businessSlug`.

`POST /api/auth/register-business/google` — ya no acepta `businessSlug`.

## Bugfix - Catálogo de categorías de negocio (HU-2.1)

Estado: `implementado`.

Rama: `bugfix/h-2.1-business-category-entity`.

### Problema

`Business.categoryId` era un `String` libre sin FK ni entidad de respaldo.
`BusinessCategoryConfigRegistry` usaba un `Map` hardcodeado con UUIDs literales
(`11111111-1111-...`, `33333333-3333-...`) sin nombre ni descripción. No
existía ningún endpoint que listara las categorías disponibles, por lo que el
formulario de alta pedía al usuario escribir el UUID de categoría en texto libre.

### Solución

Se introduce `BusinessCategory` como entidad real en el módulo `business`.

Persistencia agregada:

- `BusinessCategory`: tabla `business_categories` con `id`, `name`, `slug`.
- FK `Business.categoryId → business_categories.id`.
- Seed con 9 categorías. Los dos UUIDs legacy del registry se conservan como IDs
  reales para no romper registros existentes en desarrollo.

Categorías iniciales:

| id (primeros 8 chars) | name | slug |
|---|---|---|
| 11111111 | Gastronomía | gastronomia |
| 22222222 | Peluquería y Estética | peluqueria-y-estetica |
| 33333333 | Trámites y Oficinas | tramites-y-oficinas |
| 44444444 | Salud | salud |
| 55555555 | Comercio y Tiendas | comercio-y-tiendas |
| 66666666 | Farmacia y Óptica | farmacia-y-optica |
| 77777777 | Veterinaria | veterinaria |
| 88888888 | Taller y Servicios | taller-y-servicios |
| 99999999 | Otro | otro |

Endpoint nuevo (público, sin auth):

```text
GET /api/business/categories
```

Respuesta:

```json
{
  "categories": [
    { "id": "uuid", "name": "Gastronomía", "slug": "gastronomia" },
    { "id": "uuid", "name": "Peluquería y Estética", "slug": "peluqueria-y-estetica" }
  ]
}
```

Cambios en use cases existentes:

- `RegisterBusinessUseCase`: valida que `categoryId` exista en la tabla antes
  de guardar el negocio (error `INVALID_CATEGORY`). Antes aceptaba cualquier UUID.
- `BusinessCategoryConfigRegistry`: los dos keys del `Map` ahora apuntan a los
  IDs reales del seed, eliminando los UUIDs arbitrarios.

### Contratos diferidos

La configuración de atributos por categoría (`BusinessCategoryConfig`) sigue
viviendo en código (`BusinessCategoryConfigRegistry`). Llevarla a la DB queda
para cuando el producto defina atributos que impacten reglas operativas reales.

## Bugfix - `business.status` faltante en flujos del panel (2026-08-10)

Rama: `bugfix/business-status-guards`.

Estado: `implementado`.

### Problema

Auditoría sistemática (arrancó al revisar la creación automática de cola al
aprobar un negocio, ver `docs/epica-3-cola.md` y
`docs/epica-2-5-cuentas-organizaciones.md` para los hallazgos relacionados
de `Subscription`) encontró que, salvo `CreateTurnUseCase`,
`CreateManualTurnUseCase` y `SuspendBusinessUseCase`, ningún use case
de negocio verificaba `business.status` — solo ownership. Un negocio
`pending`, `rejected` o `suspended` podía seguir invitando empleados,
generando/regenerando QR, configurando horarios y ventanillas, cambiando su
estado operativo, y creando colas nuevas — todo antes de chocar (si es que
llegaba a chocar) contra el único chequeo real, en la creación de turnos.

Un caso concreto y más severo: `AcceptBusinessEmployeeInvitationUseCase` ni
siquiera cargaba el `Business` — una invitación emitida antes de suspender
un negocio seguía siendo aceptable durante toda su ventana de 7 días,
creando acceso de empleado real (`role: employee`) a un negocio que
HU-8.4 dice que debería estar cerrado.

Además, `ApproveBusinessUseCase` aceptaba re-aprobar un negocio
`suspended` (su guard solo bloqueaba `status === "approved"`), saltando por
completo `ReactivateBusinessUseCase` y su registro de auditoría
(`reactivatedByUserId`/`reactivatedAt`).

### Fix

Se agregó `if (business.status !== "approved") throw AppError.conflict(...,
"BUSINESS_NOT_OPERATING")` (mismo código en todos, para no inventar uno por
use case) en:

- `InviteBusinessEmployeeUseCase`
- `AcceptBusinessEmployeeInvitationUseCase` (ahora carga `IBusinessRepo` —
  dependencia nueva; se re-chequea en el momento de aceptar, no solo al
  invitar, porque el negocio puede haber cambiado de estado durante la
  ventana de 7 días de la invitación)
- `GetBusinessQrCodeUseCase`
- `RegenerateBusinessQrCodeUseCase`
- `ConfigureBusinessHoursUseCase`
- `ConfigureBusinessServiceWindowsUseCase`
- `UpdateBusinessOperationalStatusUseCase`
- `CreateQueueUseCase` (módulo `queue`)

`ResolveBusinessQrCodeUseCase` (el resolver público que corre al escanear el
QR) usa un código distinto, `BUSINESS_NOT_ACCEPTING_CUSTOMERS` — mismo que
`CreateTurnUseCase` — porque es cliente-facing, no panel-facing: en vez de
mandar al cliente a un flujo que muere al final en `CreateTurnUseCase`, corta
antes con un mensaje coherente.

`ApproveBusinessUseCase` gana un chequeo explícito para `suspended` —
`409 BUSINESS_SUSPENDED_USE_REACTIVATE` — separado del ya existente
`BUSINESS_ALREADY_APPROVED`, dejando el guard efectivo en
`status ∈ {pending, rejected}`.

### Deliberadamente afuera de este bugfix

- `RevokeBusinessEmployeeUseCase` — revocar acceso debe poder hacerse
  siempre, incluso con el negocio suspendido/rechazado.
- `UpdateBusinessProfileUseCase` — bloquear edición en `rejected` impediría
  corregir los datos que motivaron el rechazo antes de re-solicitar,
  contradiciendo el flujo que promete el AC de HU-8.3.

### Cobertura

- `tests/unit/business/InviteBusinessEmployeeUseCase.test.ts`
- `tests/unit/business/AcceptBusinessEmployeeInvitationUseCase.test.ts`
- `tests/unit/business/GetBusinessQrCodeUseCase.test.ts`
- `tests/unit/business/RegenerateBusinessQrCodeUseCase.test.ts`
- `tests/unit/business/ResolveBusinessQrCodeUseCase.test.ts`
- `tests/unit/business/ConfigureBusinessHoursUseCase.test.ts`
- `tests/unit/business/ConfigureBusinessServiceWindowsUseCase.test.ts`
- `tests/unit/business/UpdateBusinessOperationalStatusUseCase.test.ts`
- `tests/unit/queue/CreateQueueUseCase.test.ts`
- `tests/unit/business/ApproveBusinessUseCase.test.ts` (caso
  `BUSINESS_SUSPENDED_USE_REACTIVATE`)

## Observaciones técnicas iniciales

- Algunos criterios dependen de épicas posteriores:
  - cálculo de tiempo estimado: relacionado con cola y turnos.
  - notificaciones push por cierre: relacionado con notificaciones/outbox.
  - redirección del QR al flujo de sacar turno: relacionado con canales de
    entrada y app/web ligera.
- La implementación debería separar lo que queda completamente dentro de Épica 2
  de lo que se deja como contrato para Épica 3, 4 o 5.
