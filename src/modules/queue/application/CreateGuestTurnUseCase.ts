import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { CreateTurnUseCase } from "./CreateTurnUseCase";
import type { CreateTurnOutput } from "./CreateTurnUseCase";

const schema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  guestName: z.string().trim().min(1, "Guest name is required.").max(100, "Guest name is too long."),
});

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
  ) {}

  public async execute(input: CreateGuestTurnInput): Promise<CreateTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findActiveByBusinessId(parsed.data.businessId);
    if (!queue) {
      throw AppError.notFound("This business has no active queue right now.", "QUEUE_NOT_FOUND");
    }

    return this.createTurnUseCase.execute({
      queueId: queue.id,
      guestName: parsed.data.guestName,
    });
  }
}
