# Estándar de Documentación de Historias

Este documento define el formato común para documentar historias de usuario en
Espera. El objetivo es que las épicas funcionen como referencia de producto y
de ingeniería sin cambiar contratos ya implementados.

## Estilo de Escritura

- Usar español con tildes, `Ñ` y signos propios del idioma cuando corresponda.
- Mantener nombres técnicos, endpoints, enums, campos y códigos exactamente
  como están implementados.
- No cambiar contratos existentes solo para traducir o embellecer documentación.

## Formato Por Historia

Cada historia debe usar esta estructura:

```text
## HU-X.Y - Título

Story points: N

Estado: implementado | parcial | diferido | pendiente

### Objetivo de producto

Describe el problema que resuelve, para quién y qué experiencia se espera.

### Criterios de aceptación

Mantiene los criterios originales de producto. No se reemplazan por detalles de
implementación.

### Decisiones de alcance

Explica qué entra, qué queda fuera y por qué. Si hay rollover o diferidos, se
documentan acá.

### Contrato backend

Lista endpoints, permisos, request/response relevantes y efectos observables.

### Modelo y persistencia

Enumera entidades, campos, migraciones o datos persistidos.

### Reglas de negocio

Describe validaciones, estados, cálculos, permisos y efectos de dominio.

### Eventos e integraciones

Documenta emails, eventos de dominio, notificaciones, OAuth, outbox, Redis,
Socket.IO u otras integraciones.

### Documentación inline

Indica qué decisiones quedaron explicadas en el código y dónde. No hace falta
listar cada comentario, pero sí mencionar los puntos donde el contexto inline es
parte de la mantenibilidad de la historia.

Ejemplos esperados:

- entidades de dominio con aclaración de intención y límites
- use cases con reglas de negocio no evidentes
- repositorios con decisiones de persistencia, `upsert`, soft delete o mapeos
- middleware con separación entre permisos globales y autorización contextual
- stubs o contratos diferidos marcados explícitamente como tales

### Contratos diferidos

Lista contratos preparados pero no cerrados end-to-end, sin presentarlos como
funcionalidad completa.

### Cobertura

Lista tests automatizados, validación manual y riesgos residuales.
```

## Principios

- No cambiar contratos existentes solo para renombrar documentación.
- Separar estado de cuenta, visibilidad pública y estado operativo.
- Marcar diferidos con motivo concreto y próxima épica probable.
- Evitar declarar como completado lo que solo está preparado como contrato.
- Priorizar ejemplos de request/response cuando el frontend vaya a consumir el
  contrato.
- Mantener Postman como guía de validación manual, no como fuente principal de
  alcance.
- Agregar documentación inline cuando el código contenga una decisión de
  producto, un límite técnico, una regla temporal, un contrato diferido o una
  separación de responsabilidades que no sea evidente por nombres y tipos.
- Evitar comentarios inline redundantes que describan sintaxis obvia; el foco
  es explicar intención, tradeoffs y riesgos de mantenimiento.
