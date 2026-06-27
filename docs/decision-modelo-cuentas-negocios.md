# Decisión: Modelo de Cuentas, Negocios y Filas (Multi-negocio / Multi-fila)

## Resumen

El modelo original de Espera asume una relación 1:1:1 entre cuenta de
usuario, negocio y fila. Esa relación ya no representa la grilla comercial
real del producto y necesita extenderse antes de comprometer el diseño de
entidades de `queue/`.

Este documento registra qué quedó resuelto y qué sigue pendiente, para que
las próximas historias de Épica 2 y Épica 3 se diseñen sobre el modelo
correcto desde el día uno.

## Decisiones resueltas

### Business representa una sucursal física

`Business` pasa a representar una sucursal física, no una empresa. La
empresa/cuenta se modela en un nivel superior: `Organization`.

Mapeo con la grilla comercial:

- **Basic**: 1 `Organization` -> 1 `Business` -> 1 `Queue`.
- **Pro**: 1 `Organization` -> 1 `Business` -> varias `Queue`.
- **Premium**: 1 `Organization` -> varios `Business`, cada uno con varias
  `Queue`.

Esto resuelve la pregunta de mayor impacto en el rediseño: el plan no define
estructuras de datos distintas, define cuántos `Business` y `Queue` puede
usar activamente una `Organization`.

### Subscription vive en Organization

El plan comercial (Basic/Pro/Premium) se sostiene a nivel `Organization`, no
a nivel `Business`. Una cuenta paga un solo plan que cubre todas sus
sucursales. Esto es consistente con "Premium permite varios negocios y
varias filas" como una sola suscripción.

## Implementación (Épica 2.5, backlog v2.1)

Lo descrito arriba ya está implementado en `src/modules/organization/`:
migración con backfill 1:1 (`Organization` + `Subscription` BASIC +
`Membership` ADMIN por cada `Business` existente), `PLAN_LIMITS` como única
fuente de verdad de la grilla, `EnsureBusinessCreationAllowedUseCase`
conectado en los tres flujos de registro de negocio, y
`EnsureQueueCreationAllowedUseCase` / `UpdateOrganizationSubscriptionUseCase`
listos como piezas de dominio para Épica 3 y billing respectivamente. Ver
`docs/project-status.md` para el detalle de archivos.

## Decisiones todavía pendientes

- **Aprobación comercial**: ¿se aprueba la `Organization` una vez, se aprueba
  cada `Business` (sucursal) por separado, o ambos niveles con procesos
  distintos? Con `Business = sucursal`, lo más coherente con el flujo actual
  de Backoffice (Épica 8, HU-2.7) es aprobar a nivel `Business`, pero no está
  cerrado.
- **RBAC vía Membership**: hoy el rol (`user`, `employee`, `business_admin`,
  `super_admin`) es un campo global en `User`. Pasar a un modelo
  multi-negocio requiere resolver el rol por relación (`Membership`) en lugar
  de por campo fijo. Esto afecta `middleware/authorize.ts` y los use cases de
  `business/` que hoy validan ownership comparando `ownerUserId` directamente
  (ver más abajo).
- **ServiceWindow como entidad propia**: hoy `activeServiceWindows` es un
  contador simple en `Business` (HU-2.3), no una entidad. Mientras no haya
  demanda comercial concreta de operar varios puestos con identidad propia
  (ej. asignar un turno a un puesto específico), se mantiene como contador.

## Impacto en el código actual

`Queue` ya está implementado (`CreateTurnUseCase`, `CallNextUseCase`, etc.)
con `businessId` directo, y el ownership check (`ownerUserId === input.ownerUserId`)
está duplicado en los ~15 use cases de `business/`. Cualquier entidad nueva
(`Organization`, `Membership`) que se introduzca debe poder resolverse sin
reescribir esos use cases uno por uno.

Recomendación de secuencia, sin tocar código todavía:

1. Cerrar la decisión de aprobación comercial (pendiente arriba).
2. Centralizar el ownership check de `business/` en una policy única en vez
   de repetirlo en cada use case, para que el día que exista `Membership` el
   cambio sea en un solo lugar.
3. Introducir `Organization` y `Membership` sin romper el modelo actual:
   cada `User` con un `Business` existente obtiene una `Organization`
   implícita 1:1 y un `Membership` de rol `admin`. El comportamiento
   observable no cambia para cuentas existentes.
4. Habilitar la creación de múltiples `Business`/`Queue` por `Organization`
   recién cuando el plan lo permita.

## Referencias

- `docs/epica-2-gestion-negocios.md`
- `docs/project-status.md`
