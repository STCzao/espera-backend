/**
 * Service queue configured by a business.
 *
 * This is still a lightweight domain contract; persistence and concurrency
 * rules will be expanded when turn management becomes the active epic.
 */
export interface Queue {
  id: string;
  businessId: string;
  name: string;
  prefix: string;
  currentTurnNumber: number;
  isActive: boolean;
}
