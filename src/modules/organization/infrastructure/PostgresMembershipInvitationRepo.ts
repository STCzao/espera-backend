import { prisma } from "@shared/infrastructure/prisma";
import type { IMembershipInvitationRepo } from "../domain/IMembershipInvitationRepo";
import type { MembershipInvitation } from "../domain/MembershipInvitation";
import type { MembershipRole } from "../domain/Membership";

const toStatusEnum = (
  status: MembershipInvitation["status"],
): "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" =>
  status.toUpperCase() as "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

const toRoleEnum = (role: MembershipRole): "ADMIN" | "EMPLOYEE" =>
  role.toUpperCase() as "ADMIN" | "EMPLOYEE";

const toDomain = (raw: {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  invitedByUserId: string;
  acceptedUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MembershipInvitation => ({
  id: raw.id,
  organizationId: raw.organizationId,
  email: raw.email,
  role: raw.role.toLowerCase() as MembershipRole,
  token: raw.token,
  status: raw.status.toLowerCase() as MembershipInvitation["status"],
  invitedByUserId: raw.invitedByUserId,
  acceptedUserId: raw.acceptedUserId ?? undefined,
  expiresAt: raw.expiresAt,
  acceptedAt: raw.acceptedAt ?? undefined,
  revokedAt: raw.revokedAt ?? undefined,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

export class PostgresMembershipInvitationRepo implements IMembershipInvitationRepo {
  public async findById(id: string): Promise<MembershipInvitation | null> {
    const invitation = await prisma.membershipInvitation.findUnique({ where: { id } });
    return invitation ? toDomain(invitation) : null;
  }

  public async findByToken(token: string): Promise<MembershipInvitation | null> {
    const invitation = await prisma.membershipInvitation.findUnique({ where: { token } });
    return invitation ? toDomain(invitation) : null;
  }

  public async findPendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
  ): Promise<MembershipInvitation | null> {
    const invitation = await prisma.membershipInvitation.findFirst({
      where: { organizationId, email, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    return invitation ? toDomain(invitation) : null;
  }

  public async save(entity: MembershipInvitation): Promise<MembershipInvitation> {
    const invitation = await prisma.membershipInvitation.upsert({
      where: { id: entity.id },
      create: {
        id: entity.id,
        organizationId: entity.organizationId,
        email: entity.email,
        role: toRoleEnum(entity.role),
        token: entity.token,
        status: toStatusEnum(entity.status),
        invitedByUserId: entity.invitedByUserId,
        acceptedUserId: entity.acceptedUserId ?? null,
        expiresAt: entity.expiresAt,
        acceptedAt: entity.acceptedAt ?? null,
        revokedAt: entity.revokedAt ?? null,
      },
      update: {
        status: toStatusEnum(entity.status),
        acceptedUserId: entity.acceptedUserId ?? null,
        expiresAt: entity.expiresAt,
        acceptedAt: entity.acceptedAt ?? null,
        revokedAt: entity.revokedAt ?? null,
      },
    });
    return toDomain(invitation);
  }
}
