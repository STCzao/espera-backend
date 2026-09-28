export interface QueueWaitEstimateInput {
  waitingTurns: number;
  activeServiceWindows: number;
  averageServiceMinutes: number;
}

export type QueueWaitEstimateOutput =
  | {
      attentionAvailable: true;
      estimatedWaitMinutes: number;
    }
  | {
      attentionAvailable: false;
      estimatedWaitMinutes: null;
      reason: "NO_ACTIVE_SERVICE_WINDOWS";
    };

/**
 * Capacity-based wait estimator.
 *
 * It deliberately ignores appointment complexity and historical averages by
 * business category for now; those inputs can be added once real queue data
 * exists.
 */
export class QueueWaitEstimateService {
  public estimate({
    waitingTurns,
    activeServiceWindows,
    averageServiceMinutes,
  }: QueueWaitEstimateInput): QueueWaitEstimateOutput {
    if (activeServiceWindows <= 0) {
      return {
        attentionAvailable: false,
        estimatedWaitMinutes: null,
        reason: "NO_ACTIVE_SERVICE_WINDOWS",
      };
    }

    const normalizedWaitingTurns = Math.max(0, Math.floor(waitingTurns));
    const normalizedAverageServiceMinutes = Math.max(
      0,
      Math.floor(averageServiceMinutes),
    );
    // Active service windows process turns in parallel, so each batch consumes
    // one average service interval.
    const batches = Math.ceil(normalizedWaitingTurns / activeServiceWindows);

    return {
      attentionAvailable: true,
      estimatedWaitMinutes: batches * normalizedAverageServiceMinutes,
    };
  }
}
