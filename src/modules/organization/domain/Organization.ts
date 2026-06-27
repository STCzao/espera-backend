/**
 * Organization is the billing "account": it groups N Business (physical
 * branches) under a single Subscription plan.
 */
export interface Organization {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
