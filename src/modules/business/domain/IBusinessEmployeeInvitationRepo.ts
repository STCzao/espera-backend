import type { Repository } from "@shared/kernel/Repository";
import type { BusinessEmployeeInvitation } from "./BusinessEmployeeInvitation";

export interface IBusinessEmployeeInvitationRepo
  extends Repository<BusinessEmployeeInvitation> {
  findByToken(token: string): Promise<BusinessEmployeeInvitation | null>;
  findPendingByBusinessAndEmail(
    businessId: string,
    email: string,
  ): Promise<BusinessEmployeeInvitation | null>;
}
