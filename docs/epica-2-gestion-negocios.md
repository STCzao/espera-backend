# Epica 2 - Gestion de Negocios

## Resumen

La Epica 2 corresponde a la gestion operativa inicial del negocio. Su objetivo
es que una cuenta de negocio aprobada pueda completar la informacion necesaria
para aparecer y operar dentro de Espera.

Alcance total estimado: `18 pts`.

## HU-2.1 - Registrar negocio con nombre, categoria y direccion

Story points: `3`

Como negocio, quiero registrar mi negocio con nombre, categoria y direccion.

### Criterios de aceptacion

- Dado que completo nombre, categoria y direccion, cuando guardo, entonces mi
  negocio queda registrado con estado `pendiente de aprobacion`.
- Dado que ingreso una direccion, cuando la confirmo, entonces se almacena como
  direccion textual del negocio.
- Dado que no completo un campo obligatorio, cuando intento guardar, entonces
  veo validacion especifica por campo.

### Rollover justificado de Google Maps

La geocodificacion automatica con Google Maps queda diferida. Motivo: en esta
epica el panel del negocio necesita gestionar datos operativos, no visualizar un
mapa. La aparicion del negocio en mapa/listado corresponde a la experiencia del
usuario final en la app mobile.

El modelo deja preparados `latitude` y `longitude`, pero son opcionales. Si
`GOOGLE_MAPS_API_KEY` esta configurada, el backend puede enriquecer el negocio
con coordenadas. Si no esta configurada, el guardado de la direccion textual no
se bloquea.

La validacion completa de geocoding y mapa deberia retomarse en:

- `HU-7.1` busqueda de negocios cercanos
- `HU-7.7` mapa de negocios cercanos

### Implementacion backend

Estado: `implementado`.

Persistencia agregada en `Business`:

- `address`
- `latitude` opcional
- `longitude` opcional
- `listingStatus`

`listingStatus` separa la visibilidad publica del negocio del acceso al panel.
Estados iniciales:

- `DRAFT`: el negocio puede configurarse desde el panel, pero no aparece en la
  app mobile ni en el mapa.
- `HIDDEN`: el negocio fue ocultado voluntariamente por el owner o por una regla
  operativa, pero conserva acceso al panel.
- `PUBLISHED`: el negocio aparece para usuarios finales en busqueda/mapa cuando
  tambien cumple las reglas operativas correspondientes.

Esta separacion evita mezclar tres conceptos distintos:

- aprobacion de cuenta: si el negocio puede acceder al panel
- visibilidad publica: si aparece en la app mobile/mapa
- estado operativo: si acepta turnos en ese momento

Endpoints relevantes:

```text
POST /api/business
PATCH /api/business/:businessId/profile
```

`POST /api/business` permite crear un negocio con nombre, categoria, slug y
direccion para usuarios con permiso `business:edit`. El owner queda como
`business_admin` pendiente de aprobacion cuando corresponde.

`PATCH /api/business/:businessId/profile` permite completar o editar el perfil
operativo de un negocio existente. Valida ownership del negocio y guarda la
direccion textual. Si hay API key de Google Maps configurada, tambien guarda
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

Respuesta esperada:

```json
{
  "businessId": "uuid",
  "address": "Av. Corrientes 1234, CABA",
  "latitude": -34.6037,
  "longitude": -58.3816,
  "listingStatus": "draft"
}
```

`latitude` y `longitude` pueden omitirse si geocoding no esta configurado.

### Cobertura

- `tests/unit/business/RegisterBusinessUseCase.test.ts`
- `tests/unit/business/UpdateBusinessProfileUseCase.test.ts`

Cobertura actual:

- creacion de negocio con direccion textual
- promocion de owner a `business_admin` pendiente cuando corresponde
- validacion de slug duplicado
- validacion de direccion obligatoria
- edicion de perfil con validacion de ownership
- persistencia de direccion textual sin requerir Google Maps
- persistencia opcional de latitud/longitud cuando el geocoder devuelve datos
- mantenimiento de `listingStatus: draft` al completar el perfil

## HU-2.2 - Configurar horarios de atencion

Story points: `3`

Como negocio, quiero configurar mis horarios de atencion.

### Criterios de aceptacion

- Dado que configuro horarios por dia de semana, cuando guardo, entonces el
  panel conserva la configuracion para determinar disponibilidad operativa.
- Dado que es fuera de mi horario de atencion, cuando un usuario final busca
  negocios disponibles, entonces mi negocio no aparece como disponible para
  nuevos turnos.
- Dado que configuro dias no laborables, entonces esos dias no aparezco como
  disponible para nuevos turnos.

### Decision de producto

Espera prioriza inmediatez: entrar en cola, reservar lugar o anticipar una
visita mientras el usuario esta en camino. A diferencia de un catalogo de
locales, el mapa/listado principal de la app mobile debe mostrar negocios
accionables.

Para el MVP inicial, un negocio fuera de horario no aparece en discovery
principal. La visualizacion de negocios cerrados por busqueda directa,
favoritos, historial o turnos programados queda fuera de alcance.

### Implementacion backend

Estado: `implementado`.

Persistencia agregada:

- `BusinessOpeningHour`: rangos recurrentes por dia de semana.
- `BusinessNonWorkingDay`: fechas excepcionales en las que el negocio no
  atiende.

Convencion de dias:

- `0`: domingo
- `1`: lunes
- `2`: martes
- `3`: miercoles
- `4`: jueves
- `5`: viernes
- `6`: sabado

Endpoint relevante:

```text
GET /api/business/:businessId/hours
PUT /api/business/:businessId/hours
```

`GET /api/business/:businessId/hours` permite al panel recuperar la grilla
guardada para editarla.

`PUT /api/business/:businessId/hours` reemplaza la configuracion completa de
horarios del negocio. Valida ownership, formato horario `HH:mm`, apertura
anterior al cierre, rangos no solapados para el mismo dia y fechas no
laborables validas en formato `YYYY-MM-DD`.

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

La HU queda cerrada para configuracion desde panel y regla base de
disponibilidad. La app mobile futura debera consumir esa regla para filtrar
negocios disponibles.

Regla inicial de disponibilidad publica:

- `listingStatus` debe ser `published`.
- La fecha actual no debe ser un dia no laborable.
- La hora actual debe caer dentro de un rango configurado para el dia actual.

Por ahora no se soportan rangos nocturnos que crucen medianoche, por ejemplo
`22:00` a `02:00`. Si el producto incorpora rubros nocturnos, esa regla debera
ampliarse explicitamente.

### Cobertura

- `tests/unit/business/ConfigureBusinessHoursUseCase.test.ts`
- `tests/unit/business/GetBusinessHoursUseCase.test.ts`
- `tests/unit/business/BusinessAvailabilityService.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- configuracion de horarios semanales y dias no laborables
- lectura de horarios para el panel
- validacion de ownership
- validacion de apertura anterior al cierre
- validacion de rangos solapados
- validacion de dias no laborables duplicados
- validacion de fechas calendario invalidas
- disponibilidad publica dentro de horario
- ocultamiento fuera de horario
- ocultamiento en dias no laborables
- ocultamiento cuando el negocio no esta publicado
- contrato HTTP de `GET` y `PUT` de horarios

## HU-2.3 - Definir ventanillas o cajas activas

Story points: `2`

Como negocio, quiero definir cuantas ventanillas o cajas tengo activas.

### Criterios de aceptacion

- Dado que cambio la cantidad de ventanillas activas, cuando guardo, entonces el
  tiempo estimado de espera se recalcula automaticamente.
- Dado que tengo `0` ventanillas activas, cuando un usuario ve mi negocio,
  entonces aparece como `Sin atencion disponible`.

### Implementacion backend

Estado: `implementado`.

Persistencia agregada en `Business`:

- `activeServiceWindows`: cantidad de ventanillas, cajas o puntos de atencion
  activos para procesar turnos en paralelo.

Reglas:

- El valor inicial es `1`.
- Se permite `0` para indicar que el negocio no tiene atencion disponible.
- No se permiten valores negativos, decimales ni cantidades mayores a `50`.
- Un negocio con `activeServiceWindows = 0` no se considera disponible para
  recibir nuevos turnos aunque este publicado y dentro del horario de atencion.

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

### Contrato de estimacion inicial

Como la cola persistida y el conteo real de turnos activos pertenecen a epicas
posteriores, esta HU deja preparado un servicio puro de estimacion. La regla
inicial calcula la espera por capacidad paralela:

```text
ceil(turnos_en_espera / ventanillas_activas) * minutos_promedio_por_turno
```

Si no hay ventanillas activas, la estimacion devuelve estado sin atencion
disponible en lugar de minutos.

### Cobertura

- `tests/unit/business/ConfigureBusinessServiceWindowsUseCase.test.ts`
- `tests/unit/business/BusinessAvailabilityService.test.ts`
- `tests/unit/queue/QueueWaitEstimateService.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- configuracion de ventanillas activas
- permiso solo para owner del negocio
- validacion de `0` como pausa operativa valida
- rechazo de negativos y decimales
- negocio no disponible con `0` ventanillas activas
- estimacion de espera usando ventanillas como capacidad paralela

## HU-2.4 - Generar QR unico del negocio

Story points: `3`

Como negocio, quiero generar el QR unico de mi negocio para pegarlo en el local.

### Criterios de aceptacion

- Dado que accedo a la seccion QR del panel, cuando solicito generarlo, entonces
  se genera un QR unico vinculado a mi negocio.
- Dado que escanean mi QR, cuando el usuario apunta la camara, entonces es
  redirigido al flujo de sacar turno en mi negocio.
- Dado que descargo el QR, entonces obtengo un archivo PNG de alta resolucion
  listo para imprimir.
- Dado que regenero el QR, entonces el QR anterior queda invalido en 24 horas,
  manteniendo una transicion para quienes lo tengan guardado.

### Decision de producto

El QR es un canal de entrada al ecosistema Espera. La persona que escanea suele
estar frente al local y tiene una necesidad inmediata: anotarse o acceder al
servicio. Por eso el primer paso no debe bloquearse con la descarga obligatoria
de la app.

Flujo deseado:

```text
Escaneo QR
→ landing ligera / deep link
→ negocio y disponibilidad
→ inicio del flujo de turno
→ invitacion a descargar la app para seguimiento y avisos
```

La descarga de la app debe aparecer como una mejora clara de experiencia:

- seguir el lugar en la cola
- recibir avisos cuando falten pocos turnos
- salir del local sin perder visibilidad del turno
- guardar negocios frecuentes
- recibir cambios si el negocio pausa o cierra atencion

### Implementacion backend

Estado: `implementado`.

Persistencia agregada:

- `BusinessQrCode`: codigos QR vinculados a un negocio.
- `BusinessQrCodeStatus`: `ACTIVE`, `RETIRING`, `REVOKED`.

Reglas:

- Si el negocio no tiene QR activo, el backend genera uno al consultarlo.
- El QR embebe una URL publica de app/web:

```text
{APP_URL}/q/:token
```

- El panel puede regenerar el QR.
- Al regenerar, el QR anterior pasa a `RETIRING` y sigue resolviendo durante 24
  horas para mantener una transicion operativa.
- Los QR retirados vencidos o revocados no resuelven.

Endpoints panel:

```text
GET /api/business/:businessId/qr
POST /api/business/:businessId/qr/regenerate
GET /api/business/:businessId/qr.png
```

Todos requieren autenticacion, permiso `business:edit` y ownership del negocio.

Endpoint publico:

```text
GET /api/qr/:token
```

Este endpoint resuelve un token escaneado y devuelve el contrato para abrir el
flujo de turno del negocio en web/app.

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

Ejemplo de respuesta publica:

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
publica `/q/:token`, deep links nativos y medicion de conversion a app quedan
del lado frontend/mobile.

El flujo real de sacar turno con cola persistida corresponde a epicas
posteriores. En esta HU el backend devuelve el contrato `OPEN_BUSINESS_TURN_FLOW`
para que esa experiencia se conecte cuando la cola este implementada.

### Cobertura

- `tests/unit/business/GetBusinessQrCodeUseCase.test.ts`
- `tests/unit/business/RegenerateBusinessQrCodeUseCase.test.ts`
- `tests/unit/business/ResolveBusinessQrCodeUseCase.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- generacion perezosa de QR activo
- lectura del QR activo existente
- regeneracion con transicion de 24 horas
- resolucion de QR activo y QR en transicion
- rechazo de QR vencido
- contratos HTTP de panel y resolucion publica

## HU-2.5 - Cambiar estado operativo del negocio

Story points: `2`

Como negocio, quiero cambiar mi estado operativo desde el panel.

### Criterios de aceptacion

- Dado que cambio a estado `Con demoras`, cuando un usuario ve mi negocio,
  entonces ve el indicador amarillo con la leyenda correspondiente.
- Dado que cambio a estado `Pausado`, cuando usuarios intenten sacar turno,
  entonces ven que no se aceptan nuevos turnos temporalmente.
- Dado que cambio a estado `Cerrado`, entonces todos los turnos activos reciben
  notificacion push de cierre anticipado.

### Implementacion backend

Estado: `implementado`.

Persistencia agregada en `Business`:

- `operationalStatus`: estado operativo actual del negocio.

Estados:

- `NORMAL`: atencion disponible segun horario, visibilidad y ventanillas.
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

Reglas de disponibilidad publica:

- `DELAYED` mantiene el negocio disponible para nuevos turnos.
- `PAUSED` y `CLOSED` bloquean disponibilidad para nuevos turnos.
- Las reglas previas siguen aplicando: negocio publicado, dentro de horario, sin
  dia no laborable y con al menos una ventanilla activa.

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

La notificacion push efectiva a turnos activos queda como integracion diferida
hasta que exista cola persistida, dispositivos de usuarios y outbox funcional.
La HU deja listo el contrato para esa integracion.

### Cobertura

- `tests/unit/business/UpdateBusinessOperationalStatusUseCase.test.ts`
- `tests/unit/business/BusinessAvailabilityService.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- cambio a `DELAYED` con indicador amarillo y turnos habilitados
- cambio a `PAUSED` con turnos bloqueados
- cambio a `CLOSED` con turnos bloqueados
- emision de `business.closed` al cerrar por primera vez
- no reemitir evento si ya estaba cerrado
- validacion de ownership
- contrato HTTP del endpoint de estado operativo

## HU-2.6 - Editar datos del negocio

Story points: `2`

Como negocio, quiero editar los datos de mi negocio.

### Criterios de aceptacion

- Dado que edito el nombre o direccion, cuando guardo, entonces los cambios se
  reflejan inmediatamente en la app de usuarios.
- Dado que cambio la categoria, entonces los atributos especificos de la nueva
  categoria se habilitan en el formulario de configuracion.

### Implementacion backend

Estado: `implementado`.

La edicion de datos reutiliza el endpoint de perfil operativo ya existente:

```text
PATCH /api/business/:businessId/profile
```

Permite actualizar:

- `name`
- `categoryId`
- `address`

El endpoint valida ownership, persiste los cambios inmediatamente y devuelve la
configuracion de atributos correspondiente a la categoria seleccionada para que
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
        "label": "Tiempo promedio por tramite",
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

Este endpoint permite que el panel habilite atributos especificos apenas el
usuario cambia la categoria en el formulario.

### Contratos diferidos

La persistencia de valores de atributos especificos por categoria queda diferida
hasta que el producto defina cuales impactan reglas operativas reales. En esta
HU el backend deja cerrado el contrato de metadata que habilita el formulario.

### Cobertura

- `tests/unit/business/UpdateBusinessProfileUseCase.test.ts`
- `tests/unit/business/GetBusinessCategoryConfigUseCase.test.ts`
- `tests/api/business/business.api.test.ts`

Cobertura actual:

- edicion de nombre, categoria y direccion
- persistencia inmediata de cambios del perfil
- respuesta con atributos de la categoria seleccionada
- endpoint auxiliar de configuracion de categoria
- fallback de atributos base para categorias no catalogadas
- validacion de ownership

## HU-2.8 - Invitar empleados al panel

Story points: `3`

Como negocio, quiero invitar empleados a operar mi panel con su propio acceso.

### Criterios de aceptacion

- Dado que ingreso el email de un empleado y envio invitacion, cuando el
  empleado acepta, entonces tiene acceso al panel con rol `employee`.
- Dado que un empleado tiene rol `employee`, entonces puede operar la cola pero
  no puede acceder a configuracion del negocio ni metricas.
- Dado que revoco el acceso de un empleado, entonces su sesion activa se
  invalida inmediatamente.

## Observaciones tecnicas iniciales

- La base actual solo persiste `Business` con `name`, `slug`, `categoryId` y
  `ownerUserId`.
- Para esta epica hacen falta nuevas entidades o campos para direccion,
  geolocalizacion, horarios, dias no laborables, estado operativo, ventanillas,
  QR e invitaciones de empleados.
- Algunos criterios dependen de epicas posteriores:
  - calculo de tiempo estimado: relacionado con cola y turnos.
  - notificaciones push por cierre: relacionado con notificaciones/outbox.
  - redireccion del QR al flujo de sacar turno: relacionado con canales de
    entrada y app/web ligera.
- La implementacion deberia separar lo que queda completamente dentro de Epica 2
  de lo que se deja como contrato para Epica 3, 4 o 5.
