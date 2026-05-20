import type { Repository } from "../../../shared/kernel/Repository";
import type { Turn } from "./Turn";

export interface ITurnRepo extends Repository<Turn> {
  findNextWaitingTurn(queueId: string): Promise<Turn | null>;
}
