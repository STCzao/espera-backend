export interface Queue {
  id: string;
  businessId: string;
  name: string;
  prefix: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
