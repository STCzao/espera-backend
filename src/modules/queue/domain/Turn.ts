export type TurnStatus = "waiting" | "called" | "cancelled" | "completed";

export interface Turn {
  id: string;
  queueId: string;
  customerId?: string;
  number: number;
  status: TurnStatus;
  createdAt: Date;
  updatedAt: Date;
}
