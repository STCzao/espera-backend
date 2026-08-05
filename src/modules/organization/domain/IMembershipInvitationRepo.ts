import type { Repository } from "../../../shared/kernel/Repository";
import type { MembershipInvitation } from "./MembershipInvitation";

export interface IMembershipInvitationRepo extends Repository<MembershipInvitation> {
  findByToken(token: string): Promise<MembershipInvitation | null>;
  findPendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
  ): Promise<MembershipInvitation | null>;
}
