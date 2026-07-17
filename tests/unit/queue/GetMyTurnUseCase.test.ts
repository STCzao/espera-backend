import { describe, expect, it } from "vitest";

import { GetMyTurnUseCase } from "../../../src/modules/queue/application/GetMyTurnUseCase";
import {
  InMemoryQueueRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";
const TODAY = new Date("2026-01-01T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?: InMemoryTurnRepo;
} = {}) => {
  const queueRepo =
    options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  return { useCase: new GetMyTurnUseCase(queueRepo, turnRepo), turnRepo };
};

describe("GetMyTurnUseCase", () => {
  it("returns position 1 when the customer is first in line", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result).toMatchObject({
      displayNumber: "A-001",
      status: "waiting",
      position: 1,
    });
  });

  it("returns correct position when there are turns ahead", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, status: "waiting", turnDate: TODAY }),
      buildTurn({
        id: "t-3",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 3,
        displayNumber: "A-003",
        status: "waiting",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.position).toBe(3);
    expect(result.displayNumber).toBe("A-003");
  });

  it("returns position 0 and status called when the turn is being called", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-1",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 1,
        status: "called",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result).toMatchObject({ status: "called", position: 0 });
  });

  it("does not count cancelled turns as positions ahead", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "cancelled", turnDate: TODAY }),
      buildTurn({
        id: "t-2",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 2,
        displayNumber: "A-002",
        status: "waiting",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.position).toBe(1);
  });

  it("throws NOT_FOUND when the queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws NOT_FOUND when the customer has no active turn in this queue", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid", customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
