export type TurnStatus = "waiting" | "called" | "attending" | "redirected" | "cancelled" | "completed" | "no_show";
export type TurnPriority = "arrived" | "physical" | "in_transit" | "registered";
export type TurnSource = "app" | "manual" | "qr" | "web" | "phone";

export interface Turn {
  id: string;
  queueId: string;
  businessId: string;
  customerId?: string;
  guestName?: string;
  phone?: string;
  serviceWindowId?: string;
  number: number;
  displayNumber: string;
  status: TurnStatus;
  priority: TurnPriority;
  source: TurnSource;
  turnDate: Date;
  // When this turn actually starts counting for queue position/wait display —
  // equal to createdAt except for a phone reservation with a declared ETA,
  // where it's createdAt + that ETA. Keeps a reservation taken well in
  // advance from unfairly outranking people who register live in between
  // (HU-4.5). createdAt itself stays a plain audit timestamp.
  queueJoinedAt: Date;
  calledAt?: Date;
  startedAttentionAt?: Date;
  attendedAt?: Date;
  cancelledAt?: Date;
  // Set when CallNextUseCase supersedes a turn that was "called" but never
  // confirmed as attending — the person didn't show up when it was their
  // turn. Distinct from attendedAt (real attention) and cancelledAt
  // (customer/staff proactively backed out) so history and metrics don't
  // misreport a skip as a successful completion.
  noShowAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
