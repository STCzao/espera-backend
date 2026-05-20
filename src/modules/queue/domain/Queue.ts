export interface Queue {
  id: string;
  businessId: string;
  name: string;
  prefix: string;
  currentTurnNumber: number;
  isActive: boolean;
}
