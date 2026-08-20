import { QueueWaitEstimateService } from "../domain/QueueWaitEstimateService";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import type { Turn } from "../domain/Turn";

const DEFAULT_SERVICE_MINUTES = 5;

const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const estimateService = new QueueWaitEstimateService();

export interface TurnWaitStatus {
  status: "waiting" | "called" | "attending" | "redirected";
  position: number;
  estimatedWaitMinutes: number | null;
  serviceWindowId: string | null;
}

export interface ResolveTurnWaitStatusDeps {
  turnRepo: ITurnRepo;
  windowRepo: IServiceWindowRepo;
}

/**
 * Shared by GetMyTurnUseCase (authenticated) and GetGuestTurnStatusUseCase
 * (public, HU-4.2) — both poll the same wait-estimate logic for an already
 * resolved Turn, they just differ in how they find that Turn.
 */
export const resolveTurnWaitStatus = async (
  turn: Turn,
  deps: ResolveTurnWaitStatusDeps,
): Promise<TurnWaitStatus> => {
  if (turn.status === "called" || turn.status === "attending" || turn.status === "redirected") {
    return {
      status: turn.status,
      position: 0,
      estimatedWaitMinutes: 0,
      serviceWindowId: turn.serviceWindowId ?? null,
    };
  }

  const today = todayUTC();
  const [ahead, windows, avgMinutes] = await Promise.all([
    deps.turnRepo.countWaitingAhead(turn.queueId, turn.queueJoinedAt, turn.number, turn.priority),
    deps.windowRepo.findByQueueId(turn.queueId),
    deps.turnRepo.getAverageServiceMinutes(turn.queueId, today),
  ]);

  const activeServiceWindows = windows.filter((w) => w.isActive).length;
  const serviceMinutes = avgMinutes ?? DEFAULT_SERVICE_MINUTES;

  const estimate = estimateService.estimate({
    waitingTurns: ahead,
    activeServiceWindows,
    averageServiceMinutes: serviceMinutes,
  });

  return {
    status: "waiting",
    position: ahead + 1,
    estimatedWaitMinutes: estimate.attentionAvailable ? estimate.estimatedWaitMinutes : null,
    serviceWindowId: null,
  };
};
