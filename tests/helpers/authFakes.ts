import type { IUserRepo } from "../../src/modules/auth/domain/IUserRepo";
import type { IRefreshSessionRepo } from "../../src/modules/auth/domain/IRefreshSessionRepo";
import type { RefreshSession } from "../../src/modules/auth/domain/RefreshSession";
import type { User } from "../../src/modules/auth/domain/User";
import type { IBusinessRepo } from "../../src/modules/business/domain/IBusinessRepo";
import type { Business } from "../../src/modules/business/domain/Business";
import type { BusinessHoursConfig } from "../../src/modules/business/domain/BusinessHours";
import type { IBusinessHoursRepo } from "../../src/modules/business/domain/IBusinessHoursRepo";

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
  address: "Av. Siempre Viva 123",
  latitude: -34.6037,
  longitude: -58.3816,
  listingStatus: "draft",
  activeServiceWindows: 1,
  ownerUserId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

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
