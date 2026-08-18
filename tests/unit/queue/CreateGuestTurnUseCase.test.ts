import { describe, expect, it } from "vitest";

import { CreateGuestTurnUseCase } from "../../../src/modules/queue/application/CreateGuestTurnUseCase";
import { CreateTurnUseCase } from "../../../src/modules/queue/application/CreateTurnUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryTurnRepo, buildQueue } from "../../helpers/queueFakes";

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const QUEUE_ID = "22222222-2222-4222-8222-222222222222";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  businessRepo?: InMemoryBusinessRepo;
  turnRepo?: InMemoryTurnRepo;
} = {}) => {
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([
    buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: true }),
  ]);
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, status: "approved", operationalStatus: "normal" }),
  ]);
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const createTurnUseCase = new CreateTurnUseCase(queueRepo, turnRepo, businessRepo);
  return { useCase: new CreateGuestTurnUseCase(queueRepo, createTurnUseCase), turnRepo };
};

describe("CreateGuestTurnUseCase", () => {
  it("resolves the business's active queue and creates a guest turn", async () => {
    const { useCase, turnRepo } = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" });

    expect(result.queueId).toBe(QUEUE_ID);
    expect(result.displayNumber).toBe("A-001");
    expect(turnRepo.all()[0]).toMatchObject({ guestName: "Juan Pérez", source: "web" });
  });

  describe("errores", () => {
    it("throws 404 when the business has no active queue", async () => {
      const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
    });

    it("throws 400 for an invalid businessId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: "not-a-uuid", guestName: "Juan Pérez" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 when guestName is empty", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, guestName: "" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("propagates business rules from CreateTurnUseCase (e.g. business paused)", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, status: "approved", operationalStatus: "paused" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_OPERATIONAL_STATUS_BLOCKED" });
    });
  });
});
