import { describe, expect, it } from "vitest";

import { ListBusinessQueuesUseCase } from "../../../src/modules/queue/application/ListBusinessQueuesUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, buildQueue } from "../../helpers/queueFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  queueRepo?: InMemoryQueueRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([
    buildQueue({ id: "queue-1", businessId: BUSINESS_ID, prefix: "A" }),
    buildQueue({ id: "queue-2", businessId: BUSINESS_ID, prefix: "B" }),
  ]);
  return { businessRepo, queueRepo, useCase: new ListBusinessQueuesUseCase(businessRepo, queueRepo) };
};

describe("ListBusinessQueuesUseCase", () => {
  it("lists every queue for the business", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result).toHaveLength(2);
    expect(result.map((q) => q.id).sort()).toEqual(["queue-1", "queue-2"]);
  });

  describe("errores", () => {
    it("throws 404 when the business does not exist", async () => {
      const { useCase } = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 403 when the requester does not own the business", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OTHER_USER_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
    });
  });
});
