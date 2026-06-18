export type TurnStatus = "waiting" | "called" | "cancelled" | "completed";

/**
 * Customer position inside a queue.
 *
 * `number` is the human-facing sequence and must be allocated by the future
 * persistent queue workflow, not by callers.
 */
export interface Turn {
  id: string;
  queueId: string;
  customerId?: string;
  number: number;
  status: TurnStatus;
  createdAt: Date;
  updatedAt: Date;
}
