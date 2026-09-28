/**
 * Opaque handle a caller can thread through save() to run it inside an
 * ongoing database transaction (see kernel/UnitOfWork.ts) — kept as
 * `unknown` here so the domain layer never has to know about Prisma or any
 * other concrete client; infrastructure repos cast it back to their real
 * transaction client type. Optional and ignored by any repo that doesn't
 * need it, so adding this to the base interface doesn't require touching
 * every existing repo implementation.
 */
export type TransactionHandle = unknown;

/**
 * Minimal persistence port shared by modules.
 *
 * Module-specific repositories extend this interface when they need queries
 * that express domain language, such as finding active employees for a business.
 */
export interface Repository<Entity, Id = string> {
  findById(id: Id): Promise<Entity | null>;
  save(entity: Entity, tx?: TransactionHandle): Promise<Entity>;
}
