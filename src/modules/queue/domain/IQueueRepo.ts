import type { Repository } from "../../../shared/kernel/Repository";
import type { Queue } from "./Queue";

export interface IQueueRepo extends Repository<Queue> {
  findByBusinessId(businessId: string): Promise<Queue[]>;
}
