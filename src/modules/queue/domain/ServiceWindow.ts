export type ServiceWindowType = "standard" | "priority" | "specialized";

export interface ServiceWindow {
  id: string;
  queueId: string;
  name: string;
  type: ServiceWindowType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
