export type ReportedEntityType = "user" | "business";
export type ReportStatus = "pending" | "resolved" | "suspended" | "dismissed";

export interface Report {
  id: string;
  reportedType: ReportedEntityType;
  reportedId: string;
  reason: string;
  reportedByUserId: string;
  status: ReportStatus;
  internalNote?: string;
  reviewedByUserId?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
