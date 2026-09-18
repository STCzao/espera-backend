import { AppError } from "@shared/kernel/AppError";
import { TurnConflictError } from "../domain/ITurnRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import type { Turn } from "../domain/Turn";

/**
 * Thin wrapper every use case calls instead of `turnRepo.save()` directly,
 * so a concurrent write to the same turn (see TurnConflictError) surfaces as
 * the same structured 409 everywhere, instead of each use case reinventing
 * (or forgetting) the translation.
 */
export const saveTurnOrThrowConflict = async (
  turnRepo: Pick<ITurnRepo, "save">,
  entity: Turn,
): Promise<Turn> => {
  try {
    return await turnRepo.save(entity);
  } catch (error) {
    if (error instanceof TurnConflictError) {
      throw AppError.conflict(
        "This turn was just updated by someone else. Please refresh and try again.",
        "TURN_CONFLICT",
      );
    }
    throw error;
  }
};
