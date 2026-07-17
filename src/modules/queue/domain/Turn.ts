export type TurnStatus = "waiting" | "called" | "cancelled" | "completed";
export type TurnPriority = "arrived" | "physical" | "in_transit" | "registered";
export type TurnSource = "app" | "manual" | "qr" | "web";

export interface Turn {
  id: string;
  queueId: string;
  businessId: string;
  customerId?: string;
  guestName?: string;
  number: number;
  displayNumber: string;
  status: TurnStatus;
  priority: TurnPriority;
  source: TurnSource;
  turnDate: Date;
  calledAt?: Date;
  attendedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
