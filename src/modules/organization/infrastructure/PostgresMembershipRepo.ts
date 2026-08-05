import { prisma } from "@shared/infrastructure/prisma";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { Membership, MembershipRole, MembershipStatus } from "../domain/Membership";

const toRoleEnum = (role: MembershipRole): "ADMIN" | "EMPLOYEE" =>
  role.toUpperCase() as "ADMIN" | "EMPLOYEE";

const toStatusEnum = (status: MembershipStatus): "ACTIVE" | "REVOKED" =>
  status.toUpperCase() as "ACTIVE" | "REVOKED";

const toMembership = (record: {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  status: string;
  invitedByUserId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    email: string;
    firstName: string;
    lastName: string;
  };
}): Membership => ({
  id: record.id,
  userId: record.userId,
  organizationId: record.organizationId,
  email: record.user?.email,
  firstName: record.user?.firstName,
  lastName: record.user?.lastName,
  role: record.role.toLowerCase() as MembershipRole,
  status: record.status.toLowerCase() as MembershipStatus,
  invitedByUserId: record.invitedByUserId ?? undefined,
  revokedAt: record.revokedAt ?? undefined,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export class PostgresMembershipRepo implements IMembershipRepo {
  public async findById(id: string): Promise<Membership | null> {
    const membership = await prisma.membership.findUnique({ where: { id }, include: { user: true } });
    return membership ? toMembership(membership) : null;
  }

  public async findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    const membership = await prisma.membership.findFirst({
      where: { userId, organizationId, status: "ACTIVE" },
      include: { user: true },
    });
    return membership ? toMembership(membership) : null;
  }

  public async findByUser(userId: string): Promise<Membership[]> {
    const memberships = await prisma.membership.findMany({ where: { userId }, include: { user: true } });
    return memberships.map(toMembership);
  }

  public async findAdminByOrganization(organizationId: string): Promise<Membership | null> {
    const membership = await prisma.membership.findFirst({
      where: { organizationId, role: "ADMIN", status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    });
    return membership ? toMembership(membership) : null;
  }

  public async findByOrganizationId(organizationId: string): Promise<Membership[]> {
    const memberships = await prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    });
    return memberships.map(toMembership);
  }

  public async save(entity: Membership): Promise<Membership> {
    // The unique organization + user pair lets a new invitation reactivate a
    // previously revoked membership without creating duplicate access rows.
    const membership = await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: entity.userId,
          organizationId: entity.organizationId,
        },
      },
      create: {
        id: entity.id,
        userId: entity.userId,
        organizationId: entity.organizationId,
        role: toRoleEnum(entity.role),
        status: toStatusEnum(entity.status),
        invitedByUserId: entity.invitedByUserId ?? null,
        revokedAt: entity.revokedAt ?? null,
      },
      update: {
        role: toRoleEnum(entity.role),
        status: toStatusEnum(entity.status),
        invitedByUserId: entity.invitedByUserId ?? null,
        revokedAt: entity.revokedAt ?? null,
      },
      include: { user: true },
    });

    return toMembership(membership);
  }

  public async revokeByOrganizationAndUser(
    organizationId: string,
    userId: string,
    revokedAt: Date,
  ): Promise<Membership | null> {
    const existing = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });

    if (!existing || existing.status !== "ACTIVE") {
      return null;
    }

    // Keep the membership for traceability instead of deleting it outright.
    const membership = await prisma.membership.update({
      where: { id: existing.id },
      data: { status: "REVOKED", revokedAt },
      include: { user: true },
    });
    return toMembership(membership);
  }
}
