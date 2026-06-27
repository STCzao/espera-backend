import { prisma } from "@shared/infrastructure/prisma";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { Membership, MembershipRole } from "../domain/Membership";

const toRoleEnum = (role: MembershipRole): "ADMIN" | "EMPLOYEE" =>
  role.toUpperCase() as "ADMIN" | "EMPLOYEE";

const toMembership = (record: {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): Membership => ({
  id: record.id,
  userId: record.userId,
  organizationId: record.organizationId,
  role: record.role.toLowerCase() as MembershipRole,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export class PostgresMembershipRepo implements IMembershipRepo {
  public async findById(id: string): Promise<Membership | null> {
    const membership = await prisma.membership.findUnique({ where: { id } });
    return membership ? toMembership(membership) : null;
  }

  public async findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return membership ? toMembership(membership) : null;
  }

  public async findByUser(userId: string): Promise<Membership[]> {
    const memberships = await prisma.membership.findMany({ where: { userId } });
    return memberships.map(toMembership);
  }

  public async save(entity: Membership): Promise<Membership> {
    const membership = await prisma.membership.upsert({
      where: { id: entity.id },
      create: {
        id: entity.id,
        userId: entity.userId,
        organizationId: entity.organizationId,
        role: toRoleEnum(entity.role),
      },
      update: {
        role: toRoleEnum(entity.role),
      },
    });

    return toMembership(membership);
  }
}
