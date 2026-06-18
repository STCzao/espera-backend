/**
 * Minimal persistence port shared by modules.
 *
 * Module-specific repositories extend this interface when they need queries
 * that express domain language, such as finding active employees for a business.
 */
export interface Repository<Entity, Id = string> {
  findById(id: Id): Promise<Entity | null>;
  save(entity: Entity): Promise<Entity>;
}
