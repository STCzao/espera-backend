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

## HU-2.6 - Editar datos del negocio

Story points: `2`

Como negocio, quiero editar los datos de mi negocio.

### Criterios de aceptacion

- Dado que edito el nombre o direccion, cuando guardo, entonces los cambios se
  reflejan inmediatamente en la app de usuarios.
- Dado que cambio la categoria, entonces los atributos especificos de la nueva
  categoria se habilitan en el formulario de configuracion.

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
