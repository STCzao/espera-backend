import type { IMembershipRepo } from "../../src/modules/organization/domain/IMembershipRepo";
import type { IOrganizationRepo } from "../../src/modules/organization/domain/IOrganizationRepo";
import type { ISubscriptionRepo } from "../../src/modules/organization/domain/ISubscriptionRepo";
import type { Membership } from "../../src/modules/organization/domain/Membership";
import type { Organization } from "../../src/modules/organization/domain/Organization";
import type { Subscription } from "../../src/modules/organization/domain/Subscription";

export const buildOrganization = (
  overrides: Partial<Organization> = {},
): Organization => ({
  id: "organization-1",
  name: "Cafe Espera",
  status: "pending",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildMembership = (
  overrides: Partial<Membership> = {},
): Membership => ({
  id: "membership-1",
  userId: "user-1",
  organizationId: "organization-1",
  role: "admin",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildSubscription = (
  overrides: Partial<Subscription> = {},
): Subscription => ({
  id: "subscription-1",
  organizationId: "organization-1",
  plan: "basic",
  status: "pending",
  trialEndsAt: null,
  cancellationReason: null,
  cancelledAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export class InMemoryOrganizationRepo implements IOrganizationRepo {
  private readonly organizations = new Map<string, Organization>();

  public constructor(initialOrganizations: Organization[] = []) {
    initialOrganizations.forEach((organization) => {
      this.organizations.set(organization.id, organization);
    });
  }

  public async findById(id: string): Promise<Organization | null> {
    return this.organizations.get(id) ?? null;
  }

  public async findPending(): Promise<Organization[]> {
    return [...this.organizations.values()].filter((o) => o.status === "pending");
  }

  public async save(entity: Organization): Promise<Organization> {
    this.organizations.set(entity.id, entity);
    return entity;
  }

  public all(): Organization[] {
    return [...this.organizations.values()];
  }
}

export class InMemoryMembershipRepo implements IMembershipRepo {
  private readonly memberships = new Map<string, Membership>();

  public constructor(initialMemberships: Membership[] = []) {
    initialMemberships.forEach((membership) => {
      this.memberships.set(membership.id, membership);
    });
  }

  public async findById(id: string): Promise<Membership | null> {
    return this.memberships.get(id) ?? null;
  }

  public async findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    return (
      [...this.memberships.values()].find(
        (membership) =>
          membership.userId === userId && membership.organizationId === organizationId,
      ) ?? null
    );
  }

  public async findByUser(userId: string): Promise<Membership[]> {
    return [...this.memberships.values()].filter(
      (membership) => membership.userId === userId,
    );
  }

  public async findAdminByOrganization(organizationId: string): Promise<Membership | null> {
    return (
      [...this.memberships.values()].find(
        (membership) => membership.organizationId === organizationId && membership.role === "admin",
      ) ?? null
    );
  }

  public async save(entity: Membership): Promise<Membership> {
    const existing = await this.findByUserAndOrganization(
      entity.userId,
      entity.organizationId,
    );
    const saved = existing ? { ...entity, id: existing.id } : entity;
    this.memberships.set(saved.id, saved);
    return saved;
  }

  public all(): Membership[] {
    return [...this.memberships.values()];
  }
}

export class InMemorySubscriptionRepo implements ISubscriptionRepo {
  private readonly subscriptions = new Map<string, Subscription>();

  public constructor(initialSubscriptions: Subscription[] = []) {
    initialSubscriptions.forEach((subscription) => {
      this.subscriptions.set(subscription.id, subscription);
    });
  }

  public async findById(id: string): Promise<Subscription | null> {
    return this.subscriptions.get(id) ?? null;
  }

  public async findByOrganizationId(organizationId: string): Promise<Subscription | null> {
    return (
      [...this.subscriptions.values()].find(
        (subscription) => subscription.organizationId === organizationId,
      ) ?? null
    );
  }

  public async save(entity: Subscription): Promise<Subscription> {
    const existing = await this.findByOrganizationId(entity.organizationId);
    const saved = existing ? { ...entity, id: existing.id } : entity;
    this.subscriptions.set(saved.id, saved);
    return saved;
  }

  public all(): Subscription[] {
    return [...this.subscriptions.values()];
  }
}
