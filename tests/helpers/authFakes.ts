import type { IUserRepo } from "../../src/modules/auth/domain/IUserRepo";
import type { IRefreshSessionRepo } from "../../src/modules/auth/domain/IRefreshSessionRepo";
import type { RefreshSession } from "../../src/modules/auth/domain/RefreshSession";
import type { User } from "../../src/modules/auth/domain/User";
import type { FindManyBusinessesFilters, IBusinessRepo } from "../../src/modules/business/domain/IBusinessRepo";
import type { Business } from "../../src/modules/business/domain/Business";
import type { BusinessCategory } from "../../src/modules/business/domain/BusinessCategory";
import type { IBusinessCategoryRepo } from "../../src/modules/business/domain/IBusinessCategoryRepo";
import type { BusinessHoursConfig } from "../../src/modules/business/domain/BusinessHours";
import type { IBusinessHoursRepo } from "../../src/modules/business/domain/IBusinessHoursRepo";
import type { BusinessQrCode } from "../../src/modules/business/domain/BusinessQrCode";
import type { IBusinessQrCodeRepo } from "../../src/modules/business/domain/IBusinessQrCodeRepo";
import type { BusinessEmployee } from "../../src/modules/business/domain/BusinessEmployee";
import type { BusinessEmployeeInvitation } from "../../src/modules/business/domain/BusinessEmployeeInvitation";
import type { IBusinessEmployeeRepo } from "../../src/modules/business/domain/IBusinessEmployeeRepo";
import type { IBusinessEmployeeInvitationRepo } from "../../src/modules/business/domain/IBusinessEmployeeInvitationRepo";

export const buildUser = (overrides: Partial<User> = {}): User => ({
  id: "user-1",
  email: "user@example.com",
  firstName: "Test",
  lastName: "User",
  passwordHash: undefined,
  role: "user",
  approvalStatus: "approved",
  authProvider: "local",
  isEmailVerified: true,
  isBlocked: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildSession = (
  overrides: Partial<RefreshSession> = {},
): RefreshSession => ({
  id: "session-1",
  userId: "user-1",
  tokenHash: "old-hash",
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildBusiness = (
  overrides: Partial<Business> = {},
): Business => ({
  id: "business-1",
  name: "Cafe Espera",
  slug: "cafe-espera",
  categoryId: "11111111-1111-4111-8111-111111111111",
  status: "pending",
  phone: "+54 11 1234-5678",
  address: "Av. Siempre Viva 123",
  latitude: -34.6037,
  longitude: -58.3816,
  listingStatus: "draft",
  operationalStatus: "normal",
  ownerUserId: "user-1",
  organizationId: "organization-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildBusinessCategory = (
  overrides: Partial<BusinessCategory> = {},
): BusinessCategory => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Cafetería",
  slug: "cafeteria",
  ...overrides,
});

export class InMemoryBusinessCategoryRepo implements IBusinessCategoryRepo {
  private readonly categories = new Map<string, BusinessCategory>();

  public constructor(initialCategories: BusinessCategory[] = [buildBusinessCategory()]) {
    initialCategories.forEach((category) => {
      this.categories.set(category.id, category);
    });
  }

  public async findAll(): Promise<BusinessCategory[]> {
    return [...this.categories.values()];
  }

  public async findById(id: string): Promise<BusinessCategory | null> {
    return this.categories.get(id) ?? null;
  }
}

export class InMemoryUserRepo implements IUserRepo {
  public readonly deletedIds: string[] = [];
  private readonly users = new Map<string, User>();

  public constructor(initialUsers: User[] = []) {
    initialUsers.forEach((user) => {
      this.users.set(user.id, user);
    });
  }

  public async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    return (
      [...this.users.values()].find((user) => user.email === email) ?? null
    );
  }

  public async findByVerificationToken(token: string): Promise<User | null> {
    return (
      [...this.users.values()].find(
        (user) => user.emailVerificationToken === token,
      ) ?? null
    );
  }

  public async findByPasswordResetToken(token: string): Promise<User | null> {
    return (
      [...this.users.values()].find((user) => user.passwordResetToken === token) ??
      null
    );
  }

  public async save(user: User): Promise<User> {
    const saved = { ...user, updatedAt: user.updatedAt ?? new Date() };
    this.users.set(saved.id, saved);
    return saved;
  }

  public async delete(id: string): Promise<void> {
    this.deletedIds.push(id);
    this.users.delete(id);
  }

  public async count(): Promise<number> {
    return this.users.size;
  }

  public all(): User[] {
    return [...this.users.values()];
  }
}

export class InMemoryRefreshSessionRepo implements IRefreshSessionRepo {
  public readonly revokedUserIds: string[] = [];
  public readonly revokedSessionIds: string[] = [];
  private readonly sessions = new Map<string, RefreshSession>();

  public constructor(initialSessions: RefreshSession[] = []) {
    initialSessions.forEach((session) => {
      this.sessions.set(session.id, session);
    });
  }

  public async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    return (
      [...this.sessions.values()].find(
        (session) => session.tokenHash === tokenHash,
      ) ?? null
    );
  }

  public async save(session: RefreshSession): Promise<RefreshSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  public async revokeById(id: string): Promise<void> {
    this.revokedSessionIds.push(id);
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.set(id, { ...session, revokedAt: new Date() });
    }
  }

  public async revokeAllByUserId(userId: string): Promise<void> {
    this.revokedUserIds.push(userId);
  }

  public async deleteExpired(): Promise<void> {}

  public all(): RefreshSession[] {
    return [...this.sessions.values()];
  }
}

export class InMemoryBusinessRepo implements IBusinessRepo {
  public readonly deletedIds: string[] = [];
  private readonly businesses = new Map<string, Business>();

  public constructor(initialBusinesses: Business[] = []) {
    initialBusinesses.forEach((business) => {
      this.businesses.set(business.id, business);
    });
  }

  public async findById(id: string): Promise<Business | null> {
    return this.businesses.get(id) ?? null;
  }

  public async findBySlug(slug: string): Promise<Business | null> {
    return (
      [...this.businesses.values()].find((business) => business.slug === slug) ??
      null
    );
  }

  public async save(entity: Business): Promise<Business> {
    this.businesses.set(entity.id, entity);
    return entity;
  }

  public async delete(id: string): Promise<void> {
    this.deletedIds.push(id);
    this.businesses.delete(id);
  }

  public async findByOwnerUserId(ownerUserId: string): Promise<Business[]> {
    return [...this.businesses.values()].filter(
      (business) => business.ownerUserId === ownerUserId,
    );
  }

  public async countByOrganizationId(organizationId: string): Promise<number> {
    return [...this.businesses.values()].filter(
      (business) => business.organizationId === organizationId && business.status !== "rejected",
    ).length;
  }

  public async countByStatus(status: Business["status"]): Promise<number> {
    return [...this.businesses.values()].filter(
      (business) => business.status === status,
    ).length;
  }

  public async findMany(filters: FindManyBusinessesFilters = {}): Promise<Business[]> {
    return [...this.businesses.values()].filter((business) => {
      if (filters.organizationId && business.organizationId !== filters.organizationId) return false;
      if (filters.categoryId && business.categoryId !== filters.categoryId) return false;
      if (filters.status && business.status !== filters.status) return false;
      return true;
    });
  }

  public async findByOrganizationId(organizationId: string): Promise<Business[]> {
    return [...this.businesses.values()].filter(
      (business) => business.organizationId === organizationId,
    );
  }

  public async findPending(filters: {
    organizationId?: string;
    categoryId?: string;
    fromDate?: Date;
    toDate?: Date;
  } = {}): Promise<Business[]> {
    return [...this.businesses.values()].filter((business) => {
      if (business.status !== "pending") return false;
      if (filters.organizationId && business.organizationId !== filters.organizationId) return false;
      if (filters.categoryId && business.categoryId !== filters.categoryId) return false;
      if (filters.fromDate && business.createdAt.getTime() < filters.fromDate.getTime()) return false;
      if (filters.toDate && business.createdAt.getTime() > filters.toDate.getTime()) return false;
      return true;
    });
  }

  public all(): Business[] {
    return [...this.businesses.values()];
  }
}

export class InMemoryBusinessHoursRepo implements IBusinessHoursRepo {
  private readonly configs = new Map<string, BusinessHoursConfig>();

  public constructor(initialConfigs: BusinessHoursConfig[] = []) {
    initialConfigs.forEach((config) => {
      this.configs.set(config.businessId, config);
    });
  }

  public async findByBusinessId(businessId: string): Promise<BusinessHoursConfig> {
    return (
      this.configs.get(businessId) ?? {
        businessId,
        weeklyHours: [],
        nonWorkingDays: [],
      }
    );
  }

  public async replaceForBusiness(
    config: BusinessHoursConfig,
  ): Promise<BusinessHoursConfig> {
    this.configs.set(config.businessId, config);
    return config;
  }
}

export const buildBusinessQrCode = (
  overrides: Partial<BusinessQrCode> = {},
): BusinessQrCode => ({
  id: "qr-1",
  businessId: "business-1",
  token: "qr-token-1234567890",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export class InMemoryBusinessQrCodeRepo implements IBusinessQrCodeRepo {
  private readonly qrCodes = new Map<string, BusinessQrCode>();

  public constructor(initialQrCodes: BusinessQrCode[] = []) {
    initialQrCodes.forEach((qrCode) => {
      this.qrCodes.set(qrCode.id, qrCode);
    });
  }

  public async findById(id: string): Promise<BusinessQrCode | null> {
    return this.qrCodes.get(id) ?? null;
  }

  public async findActiveByBusinessId(
    businessId: string,
  ): Promise<BusinessQrCode | null> {
    return (
      [...this.qrCodes.values()].find(
        (qrCode) =>
          qrCode.businessId === businessId && qrCode.status === "active",
      ) ?? null
    );
  }

  public async findResolvableByToken(
    token: string,
    now: Date,
  ): Promise<BusinessQrCode | null> {
    return (
      [...this.qrCodes.values()].find((qrCode) => {
        if (qrCode.token !== token) {
          return false;
        }

        if (qrCode.status === "active") {
          return true;
        }

        return (
          qrCode.status === "retiring" &&
          Boolean(qrCode.validUntil && qrCode.validUntil > now)
        );
      }) ?? null
    );
  }

  public async save(entity: BusinessQrCode): Promise<BusinessQrCode> {
    this.qrCodes.set(entity.id, entity);
    return entity;
  }

  public async retireActiveForBusiness(
    businessId: string,
    validUntil: Date,
  ): Promise<void> {
    [...this.qrCodes.values()].forEach((qrCode) => {
      if (qrCode.businessId === businessId && qrCode.status === "active") {
        this.qrCodes.set(qrCode.id, {
          ...qrCode,
          status: "retiring",
          validUntil,
        });
      }
    });
  }

  public all(): BusinessQrCode[] {
    return [...this.qrCodes.values()];
  }
}

export const buildBusinessEmployee = (
  overrides: Partial<BusinessEmployee> = {},
): BusinessEmployee => ({
  id: "employee-1",
  businessId: "business-1",
  userId: "employee-user-1",
  email: "employee@example.com",
  firstName: "Employee",
  lastName: "User",
  status: "active",
  invitedByUserId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildBusinessEmployeeInvitation = (
  overrides: Partial<BusinessEmployeeInvitation> = {},
): BusinessEmployeeInvitation => ({
  id: "invitation-1",
  businessId: "business-1",
  email: "employee@example.com",
  token: "employee-invitation-token-1234567890",
  status: "pending",
  invitedByUserId: "user-1",
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export class InMemoryBusinessEmployeeRepo implements IBusinessEmployeeRepo {
  private readonly employees = new Map<string, BusinessEmployee>();

  public constructor(initialEmployees: BusinessEmployee[] = []) {
    initialEmployees.forEach((employee) => {
      this.employees.set(employee.id, employee);
    });
  }

  public async findById(id: string): Promise<BusinessEmployee | null> {
    return this.employees.get(id) ?? null;
  }

  public async findActiveByBusinessAndUser(
    businessId: string,
    userId: string,
  ): Promise<BusinessEmployee | null> {
    return (
      [...this.employees.values()].find(
        (employee) =>
          employee.businessId === businessId &&
          employee.userId === userId &&
          employee.status === "active",
      ) ?? null
    );
  }

  public async findByBusinessId(businessId: string): Promise<BusinessEmployee[]> {
    return [...this.employees.values()].filter(
      (employee) => employee.businessId === businessId && employee.status === "active",
    );
  }

  public async save(entity: BusinessEmployee): Promise<BusinessEmployee> {
    const existing = [...this.employees.values()].find(
      (employee) =>
        employee.businessId === entity.businessId && employee.userId === entity.userId,
    );
    const saved = existing ? { ...entity, id: existing.id } : entity;
    this.employees.set(saved.id, saved);
    return saved;
  }

  public async revokeByBusinessAndUser(
    businessId: string,
    userId: string,
    revokedAt: Date,
  ): Promise<BusinessEmployee | null> {
    const employee = [...this.employees.values()].find(
      (item) =>
        item.businessId === businessId &&
        item.userId === userId &&
        item.status === "active",
    );
    if (!employee) {
      return null;
    }

    const revoked = {
      ...employee,
      status: "revoked" as const,
      revokedAt,
    };
    this.employees.set(revoked.id, revoked);
    return revoked;
  }

  public all(): BusinessEmployee[] {
    return [...this.employees.values()];
  }
}

export class InMemoryBusinessEmployeeInvitationRepo
  implements IBusinessEmployeeInvitationRepo
{
  private readonly invitations = new Map<string, BusinessEmployeeInvitation>();

  public constructor(initialInvitations: BusinessEmployeeInvitation[] = []) {
    initialInvitations.forEach((invitation) => {
      this.invitations.set(invitation.id, invitation);
    });
  }

  public async findById(id: string): Promise<BusinessEmployeeInvitation | null> {
    return this.invitations.get(id) ?? null;
  }

  public async findByToken(
    token: string,
  ): Promise<BusinessEmployeeInvitation | null> {
    return (
      [...this.invitations.values()].find(
        (invitation) => invitation.token === token,
      ) ?? null
    );
  }

  public async findPendingByBusinessAndEmail(
    businessId: string,
    email: string,
  ): Promise<BusinessEmployeeInvitation | null> {
    return (
      [...this.invitations.values()].find(
        (invitation) =>
          invitation.businessId === businessId &&
          invitation.email === email &&
          invitation.status === "pending",
      ) ?? null
    );
  }

  public async findPendingByBusinessId(
    businessId: string,
  ): Promise<BusinessEmployeeInvitation[]> {
    return [...this.invitations.values()]
      .filter((invitation) => invitation.businessId === businessId && invitation.status === "pending")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async save(
    entity: BusinessEmployeeInvitation,
  ): Promise<BusinessEmployeeInvitation> {
    this.invitations.set(entity.id, entity);
    return entity;
  }

  public all(): BusinessEmployeeInvitation[] {
    return [...this.invitations.values()];
  }
}
