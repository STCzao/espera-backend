import type { Repository } from "../../../shared/kernel/Repository";
import type { Turn, TurnPriority, TurnSource } from "./Turn";

export interface CreateTurnData {
  queueId: string;
  businessId: string;
  customerId?: string;
  priority: TurnPriority;
  source: TurnSource;
  turnDate: Date;
  prefix: string;
}

export interface ITurnRepo extends Repository<Turn> {
  createWithNextNumber(data: CreateTurnData): Promise<Turn>;
  findNextWaitingTurn(queueId: string): Promise<Turn | null>;
  findCalledTurnByQueue(queueId: string): Promise<Turn | null>;
  findActiveByCustomerInAnyBusiness(customerId: string): Promise<Turn | null>;
  findActiveByCustomerInQueue(customerId: string, queueId: string): Promise<Turn | null>;
  countWaitingAhead(queueId: string, turnNumber: number, turnDate: Date): Promise<number>;
}
