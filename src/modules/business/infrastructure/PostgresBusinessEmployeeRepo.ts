import { prisma } from "@shared/infrastructure/prisma";
import type { BusinessEmployee } from "../domain/BusinessEmployee";
import type { IBusinessEmployeeRepo } from "../domain/IBusinessEmployeeRepo";

const toStatusEnum = (
  status: BusinessEmployee["status"],
): "ACTIVE" | "REVOKED" => status.toUpperCase() as "ACTIVE" | "REVOKED";

// Repositories expose lowercase domain values while Prisma keeps enum values in
// uppercase, matching the database representation.
const toDomain = (raw: {
  id: string;
  businessId: string;
  userId: string;
  status: "ACTIVE" | "REVOKED";
  invitedByUserId: string;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    email: string;
    firstName: string;
    lastName: string;
  };
}): BusinessEmployee => ({
  id: raw.id,
  businessId: raw.businessId,
  userId: raw.userId,
  email: raw.user?.email,
  firstName: raw.user?.firstName,
  lastName: raw.user?.lastName,
  status: raw.status.toLowerCase() as BusinessEmployee["status"],
  invitedByUserId: raw.invitedByUserId,
  revokedAt: raw.revokedAt ?? undefined,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

/**
 * Every `user` include below is scoped with `select` on purpose — toDomain
 * only ever reads email/firstName/lastName, but `include: { user: true }`
 * used to pull the full User row (passwordHash, googleId, reset/verify
 * tokens) into memory on every one of these calls, including the pure
 * existence check EnsureBusinessMembershipUseCase does on every staff
 * action, which never even reads `.user` at all.
 */
export class PostgresBusinessEmployeeRepo implements IBusinessEmployeeRepo {
  public async findById(id: string): Promise<BusinessEmployee | null> {
    const employee = await prisma.businessEmployee.findUnique({
      where: { id },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });
    return employee ? toDomain(employee) : null;
  }

  public async findActiveByBusinessAndUser(
    businessId: string,
    userId: string,
  ): Promise<BusinessEmployee | null> {
    const employee = await prisma.businessEmployee.findFirst({
      where: {
        businessId,
        userId,
        status: "ACTIVE",
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });
    return employee ? toDomain(employee) : null;
  }

  public async findByBusinessId(businessId: string): Promise<BusinessEmployee[]> {
    const employees = await prisma.businessEmployee.findMany({
      where: {
        businessId,
        status: "ACTIVE",
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return employees.map(toDomain);
  }

  public async save(entity: BusinessEmployee): Promise<BusinessEmployee> {
    // The unique business + user pair lets a new invitation reactivate a
    // previously revoked membership without creating duplicate access rows.
    const employee = await prisma.businessEmployee.upsert({
      where: {
        businessId_userId: {
          businessId: entity.businessId,
          userId: entity.userId,
        },
      },
      create: {
        id: entity.id,
        businessId: entity.businessId,
        userId: entity.userId,
        status: toStatusEnum(entity.status),
        invitedByUserId: entity.invitedByUserId,
        revokedAt: entity.revokedAt ?? null,
      },
      update: {
        status: toStatusEnum(entity.status),
        invitedByUserId: entity.invitedByUserId,
        revokedAt: entity.revokedAt ?? null,
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });
    return toDomain(employee);
  }

  public async revokeByBusinessAndUser(
    businessId: string,
    userId: string,
    revokedAt: Date,
  ): Promise<BusinessEmployee | null> {
    const existing = await prisma.businessEmployee.findUnique({
      where: {
        businessId_userId: {
          businessId,
          userId,
        },
      },
    });

    if (!existing || existing.status !== "ACTIVE") {
      return null;
    }

    // Keep the membership for traceability instead of deleting it outright.
    const employee = await prisma.businessEmployee.update({
      where: { id: existing.id },
      data: {
        status: "REVOKED",
        revokedAt,
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });
    return toDomain(employee);
  }
}
