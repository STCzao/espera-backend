export type ServiceWindowType = "cashier" | "customer_service" | "information" | "admin" | "technical";

export interface ServiceWindow {
  id: string;
  queueId: string;
  name: string;
  type: ServiceWindowType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
