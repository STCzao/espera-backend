import type { IQueueRepo } from "../../domain/IQueueRepo";
import type { ITurnRepo } from "../../domain/ITurnRepo";

export interface QueueJoinRequest {
  queueId?: string;
  turnId?: string;
  /** Resolved from the handshake token; null for an anonymous socket. */
  userId?: string | null;
}

export interface QueueJoinDeps {
  turnRepo: Pick<ITurnRepo, "findById">;
  queueRepo: Pick<IQueueRepo, "findById">;
  /**
   * Resolves to nothing when the user owns or actively works at the
   * business, and rejects otherwise. Injected rather than called directly
   * because this module may not import the business module (see the
   * boundaries rules in .eslintrc.json); app.ts wires it to
   * EnsureBusinessMembershipUseCase so the ownership rule lives in exactly
   * one place.
   */
  assertStaffAccess: (businessId: string, userId: string) => Promise<void>;
  /** SOCKET_REQUIRE_STAFF_AUTH — see the second stage of the rollout. */
  requireStaffAuth: boolean;
}

export type QueueJoinDecision =
  | { allowed: true; reason: "guest_turn" | "staff" | "unauthenticated_legacy" }
  | { allowed: false; reason: "no_queue_id" | "turn_mismatch" | "queue_not_found" | "not_staff" };

/**
 * Guards Socket.IO's `queue:join` event. Two kinds of caller share this room:
 *
 * - A `turnId` proves the caller holds a turn in that queue — same trust
 *   model as GetGuestTurnStatusUseCase's public polling endpoint (the
 *   turnId itself, an unguessable UUID, is the access key). This is how an
 *   anonymous web-ligera visitor (HU-4.2) joins, with or without a session.
 * - Without a `turnId`, the caller is the staff panel watching the whole
 *   queue. That used to be allowed unconditionally, so anyone who knew (or
 *   guessed) a queueId could listen in on guest names, turn ids and service
 *   windows. It now requires an authenticated socket whose user belongs to
 *   the queue's business.
 *
 * The outcome carries a reason instead of being a bare boolean so the caller
 * can log `unauthenticated_legacy` — a panel that hasn't started sending its
 * token yet — apart from a genuine refusal. That distinction is what makes
 * it possible to tell when SOCKET_REQUIRE_STAFF_AUTH can be turned on.
 */
export const authorizeQueueJoin = async (
  request: QueueJoinRequest,
  deps: QueueJoinDeps,
): Promise<QueueJoinDecision> => {
  if (!request.queueId) return { allowed: false, reason: "no_queue_id" };

  if (request.turnId) {
    const turn = await deps.turnRepo.findById(request.turnId);
    return turn && turn.queueId === request.queueId
      ? { allowed: true, reason: "guest_turn" }
      : { allowed: false, reason: "turn_mismatch" };
  }

  if (!request.userId) {
    return deps.requireStaffAuth
      ? { allowed: false, reason: "not_staff" }
      : { allowed: true, reason: "unauthenticated_legacy" };
  }

  const queue = await deps.queueRepo.findById(request.queueId);
  if (!queue) return { allowed: false, reason: "queue_not_found" };

  try {
    await deps.assertStaffAccess(queue.businessId, request.userId);
  } catch {
    // Owner/employee checks reject by throwing (AppError). Which of the two
    // reasons it was doesn't change what happens to the socket.
    return { allowed: false, reason: "not_staff" };
  }

  return { allowed: true, reason: "staff" };
};
