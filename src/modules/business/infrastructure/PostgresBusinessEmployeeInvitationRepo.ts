import { prisma } from "@shared/infrastructure/prisma";
import type { BusinessEmployeeInvitation } from "../domain/BusinessEmployeeInvitation";
import type { IBusinessEmployeeInvitationRepo } from "../domain/IBusinessEmployeeInvitationRepo";

const toStatusEnum = (
  status: BusinessEmployeeInvitation["status"],
): "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" =>
  status.toUpperCase() as "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

// Repositories expose lowercase domain values while Prisma keeps enum values in
// uppercase, matching the database representation.
const toDomain = (raw: {
  id: string;
  businessId: string;
  email: string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  invitedByUserId: string;
  acceptedUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): BusinessEmployeeInvitation => ({
  id: raw.id,
  businessId: raw.businessId,
  email: raw.email,
  token: raw.token,
  status: raw.status.toLowerCase() as BusinessEmployeeInvitation["status"],
  invitedByUserId: raw.invitedByUserId,
  acceptedUserId: raw.acceptedUserId ?? undefined,
  expiresAt: raw.expiresAt,
  acceptedAt: raw.acceptedAt ?? undefined,
  revokedAt: raw.revokedAt ?? undefined,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

export class PostgresBusinessEmployeeInvitationRepo
  implements IBusinessEmployeeInvitationRepo
{
  public async findById(id: string): Promise<BusinessEmployeeInvitation | null> {
    const invitation = await prisma.businessEmployeeInvitation.findUnique({
      where: { id },
    });
    return invitation ? toDomain(invitation) : null;
  }

  public async findByToken(
    token: string,
  ): Promise<BusinessEmployeeInvitation | null> {
    const invitation = await prisma.businessEmployeeInvitation.findUnique({
      where: { token },
    });
    return invitation ? toDomain(invitation) : null;
  }

  public async findPendingByBusinessAndEmail(
    businessId: string,
    email: string,
  ): Promise<BusinessEmployeeInvitation | null> {
    // When multiple historical invitations exist, the latest pending one is
    // the only candidate that can still block a new invitation.
    const invitation = await prisma.businessEmployeeInvitation.findFirst({
      where: {
        businessId,
        email,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });
    return invitation ? toDomain(invitation) : null;
  }

  public async findPendingByBusinessId(
    businessId: string,
  ): Promise<BusinessEmployeeInvitation[]> {
    const invitations = await prisma.businessEmployeeInvitation.findMany({
      where: { businessId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map(toDomain);
  }

  public async save(
    entity: BusinessEmployeeInvitation,
  ): Promise<BusinessEmployeeInvitation> {
    const invitation = await prisma.businessEmployeeInvitation.upsert({
      where: { id: entity.id },
      create: {
        id: entity.id,
        businessId: entity.businessId,
        email: entity.email,
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
