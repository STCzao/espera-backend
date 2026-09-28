import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import { CreateTurnUseCase } from "./CreateTurnUseCase";
import type { CreateTurnOutput } from "./CreateTurnUseCase";

const schema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  guestName: z.string().trim().min(1, "Guest name is required.").max(100, "Guest name is too long."),
});

// Anonymous turns a single queue holds at once. The endpoint is public and only
// rate-limited per IP, so anyone holding the QR could otherwise fill a queue
// with fake guests from many addresses; past this, the customer is sent to the
// counter (staff can still create manual turns, which are not counted here).
export const MAX_ACTIVE_GUEST_TURNS_PER_QUEUE = 50;

export type CreateGuestTurnInput = z.infer<typeof schema>;

/**
 * Public entry point for HU-4.2 (web ligera): a customer without the app or
 * an account takes a turn straight from a business's QR/link, knowing only
 * the businessId — not which Queue to use. Resolves the business's
 * active/primary Queue (same criterion as `activeQueueId` elsewhere,
 * e.g. ListMyBusinessesUseCase) and delegates the actual creation —
 * ownership/status/plan rules — to CreateTurnUseCase.
 */
export class CreateGuestTurnUseCase implements UseCase<CreateGuestTurnInput, CreateTurnOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly createTurnUseCase: CreateTurnUseCase = new CreateTurnUseCase(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
  ) {}

  public async execute(input: CreateGuestTurnInput): Promise<CreateTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findActiveByBusinessId(parsed.data.businessId);
    if (!queue) {
      throw AppError.notFound("This business has no active queue right now.", "QUEUE_NOT_FOUND");
    }

    const activeGuests = await this.turnRepo.countActiveGuestTurnsByQueue(queue.id);
    if (activeGuests >= MAX_ACTIVE_GUEST_TURNS_PER_QUEUE) {
      throw AppError.conflict(
        "This queue is not accepting more online turns right now. Please check in at the counter.",
        "GUEST_TURN_LIMIT_REACHED",
      );
    }

    return this.createTurnUseCase.execute({
      queueId: queue.id,
      guestName: parsed.data.guestName,
    });
  }
}
