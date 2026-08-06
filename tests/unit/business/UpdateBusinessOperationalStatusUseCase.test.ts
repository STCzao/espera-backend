import { describe, expect, it, vi } from "vitest";

import { EventBus } from "../../../src/shared/EventBus";
import { UpdateBusinessOperationalStatusUseCase } from "../../../src/modules/business/application/UpdateBusinessOperationalStatusUseCase";
import { buildBusiness, InMemoryBusinessRepo } from "../../helpers/authFakes";

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  operationalStatus: "delayed" as const,
};

describe("UpdateBusinessOperationalStatusUseCase", () => {
  it("sets delayed status while keeping new turns enabled", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
        status: "approved",
      }),
    ]);
    const useCase = new UpdateBusinessOperationalStatusUseCase(
      businessRepo,
      new EventBus(),
    );

    const result = await useCase.execute(validInput);
    const updatedBusiness = await businessRepo.findById(validInput.businessId);

    expect(result).toEqual({
      businessId: validInput.businessId,
      operationalStatus: "delayed",
      acceptsNewTurns: true,
      indicator: "yellow",
      customerMessage: "Con demoras.",
    });
    expect(updatedBusiness?.operationalStatus).toBe("delayed");
  });

  it("sets paused status and blocks new turns", async () => {
    const useCase = new UpdateBusinessOperationalStatusUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          status: "approved",
        }),
      ]),
      new EventBus(),
    );

    const result = await useCase.execute({
      ...validInput,
      operationalStatus: "paused",
    });

    expect(result).toMatchObject({
      operationalStatus: "paused",
      acceptsNewTurns: false,
      indicator: "gray",
    });
  });

  it("emits a business closed event when transitioning to closed", async () => {
    const eventBus = new EventBus();
    const listener = vi.fn();
    eventBus.on("business.closed", listener);
    const useCase = new UpdateBusinessOperationalStatusUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          operationalStatus: "delayed",
          status: "approved",
        }),
      ]),
      eventBus,
    );

    const result = await useCase.execute({
      ...validInput,
      operationalStatus: "closed",
      reason: "Cierre anticipado",
    });

    expect(result).toMatchObject({
      operationalStatus: "closed",
      acceptsNewTurns: false,
      indicator: "red",
    });
    expect(listener).toHaveBeenCalledWith({
      businessId: validInput.businessId,
      ownerUserId: validInput.ownerUserId,
      previousStatus: "delayed",
      reason: "Cierre anticipado",
      occurredAt: expect.any(Date),
    });
  });

  it("does not emit a business closed event when it was already closed", async () => {
    const eventBus = new EventBus();
    const listener = vi.fn();
    eventBus.on("business.closed", listener);
    const useCase = new UpdateBusinessOperationalStatusUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          operationalStatus: "closed",
          status: "approved",
        }),
      ]),
      eventBus,
    );

    await useCase.execute({
      ...validInput,
      operationalStatus: "closed",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects updates when the business is not operating", async () => {
    const useCase = new UpdateBusinessOperationalStatusUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          status: "pending",
        }),
      ]),
      new EventBus(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BUSINESS_NOT_OPERATING",
    });
  });

  it("rejects updates from users that do not own the business", async () => {
    const useCase = new UpdateBusinessOperationalStatusUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: "33333333-3333-4333-8333-333333333333",
        }),
      ]),
      new EventBus(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });
});
