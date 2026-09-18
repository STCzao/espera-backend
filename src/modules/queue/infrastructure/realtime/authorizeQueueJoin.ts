import type { ITurnRepo } from "../../domain/ITurnRepo";

export interface QueueJoinRequest {
  queueId?: string;
  turnId?: string;
}

/**
 * Guards Socket.IO's `queue:join` event. A `turnId` proves the caller
 * actually holds a turn in that queue — same trust model as
 * GetGuestTurnStatusUseCase's public polling endpoint (the turnId itself, an
 * unguessable UUID, is the access key). This lets an anonymous web-ligera
 * visitor (HU-4.2) join safely without any login.
 *
 * When no `turnId` is given, the join is allowed unchanged (the legacy path
 * the staff panel still uses, see useQueueRoom.js in espera-frontend) —
 * closing that gap requires the panel to authenticate its socket connection
 * with an access token, which hasn't shipped yet.
 */
export const authorizeQueueJoin = async (
  request: QueueJoinRequest,
  turnRepo: Pick<ITurnRepo, "findById">,
): Promise<boolean> => {
  if (!request.queueId) return false;
  if (!request.turnId) return true;

  const turn = await turnRepo.findById(request.turnId);
  return Boolean(turn && turn.queueId === request.queueId);
};
