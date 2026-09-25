import { Prisma } from "@prisma/client";

import { AppError } from "@shared/kernel/AppError";
import type { TransactionHandle } from "@shared/kernel/Repository";
import { TurnConflictError, TurnNotFoundError } from "../domain/ITurnRepo";
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
  tx?: TransactionHandle,
): Promise<Turn> => {
  try {
    return await turnRepo.save(entity, tx);
  } catch (error) {
    if (error instanceof TurnConflictError) {
      throw AppError.conflict(
        "This turn was just updated by someone else. Please refresh and try again.",
        "TURN_CONFLICT",
      );
    }
    if (error instanceof TurnNotFoundError) {
      throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");
    }
    throw error;
  }
};

/**
 * Same as saveTurnOrThrowConflict, plus the P2002 translation AttendTurnUseCase
 * and RedirectTurnUseCase both need: their in-app "is this window free"
 * check has a read-then-write race the DB's partial unique index (one
 * ATTENDING/REDIRECTED turn per serviceWindowId — see migration
 * 20260820000000_unique_active_turn_per_service_window) closes, and both use
 * cases must report that exact race the same way as the check itself.
 */
export const saveTurnClaimingServiceWindowOrThrowConflict = async (
  turnRepo: Pick<ITurnRepo, "save">,
  entity: Turn,
  tx?: TransactionHandle,
): Promise<Turn> => {
  try {
    return await saveTurnOrThrowConflict(turnRepo, entity, tx);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw AppError.conflict("This service window is already attending another turn.", "SERVICE_WINDOW_OCCUPIED");
    }
    throw error;
  }
};
