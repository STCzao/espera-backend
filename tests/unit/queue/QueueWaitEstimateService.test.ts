import { describe, expect, it } from "vitest";

import { QueueWaitEstimateService } from "../../../src/modules/queue/domain/QueueWaitEstimateService";

describe("QueueWaitEstimateService", () => {
  it("calculates wait time using active service windows as parallel capacity", () => {
    const service = new QueueWaitEstimateService();

    const estimate = service.estimate({
      waitingTurns: 7,
      activeServiceWindows: 3,
      averageServiceMinutes: 5,
    });

    expect(estimate).toEqual({
      attentionAvailable: true,
      estimatedWaitMinutes: 15,
    });
  });

  it("returns no attention availability when there are no active service windows", () => {
    const service = new QueueWaitEstimateService();

    const estimate = service.estimate({
      waitingTurns: 7,
      activeServiceWindows: 0,
      averageServiceMinutes: 5,
    });

    expect(estimate).toEqual({
      attentionAvailable: false,
      estimatedWaitMinutes: null,
      reason: "NO_ACTIVE_SERVICE_WINDOWS",
    });
  });
});
