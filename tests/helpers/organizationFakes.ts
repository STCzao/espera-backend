import type { IMembershipInvitationRepo } from "../../src/modules/organization/domain/IMembershipInvitationRepo";
import type { IMembershipRepo } from "../../src/modules/organization/domain/IMembershipRepo";
import type { IOrganizationRepo } from "../../src/modules/organization/domain/IOrganizationRepo";
import type { ISubscriptionRepo } from "../../src/modules/organization/domain/ISubscriptionRepo";
import type { Membership } from "../../src/modules/organization/domain/Membership";
import type { MembershipInvitation } from "../../src/modules/organization/domain/MembershipInvitation";
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
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildMembershipInvitation = (
  overrides: Partial<MembershipInvitation> = {},
): MembershipInvitation => ({
  id: "membership-invitation-1",
  organizationId: "organization-1",
  email: "invitee@example.com",
  role: "employee",
  token: "membership-invitation-token-1234567890",
  status: "pending",
  invitedByUserId: "user-1",
  expiresAt: new Date(Date.now() + 60_000),
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
  activatedByUserId: null,
  activatedAt: null,
  cancelledByUserId: null,
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
          membership.userId === userId &&
          membership.organizationId === organizationId &&
          membership.status === "active",
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
        (membership) =>
          membership.organizationId === organizationId &&
          membership.role === "admin" &&
          membership.status === "active",
      ) ?? null
    );
  }

  public async findByOrganizationId(organizationId: string): Promise<Membership[]> {
    return [...this.memberships.values()].filter(
      (membership) => membership.organizationId === organizationId && membership.status === "active",
    );
  }

  public async revokeByOrganizationAndUser(
    organizationId: string,
    userId: string,
    revokedAt: Date,
  ): Promise<Membership | null> {
    const existing = [...this.memberships.values()].find(
      (membership) =>
        membership.organizationId === organizationId &&
        membership.userId === userId &&
        membership.status === "active",
    );
    if (!existing) return null;

    const revoked: Membership = { ...existing, status: "revoked", revokedAt };
    this.memberships.set(revoked.id, revoked);
    return revoked;
  }

  public async save(entity: Membership): Promise<Membership> {
    const existing = [...this.memberships.values()].find(
      (membership) =>
        membership.userId === entity.userId && membership.organizationId === entity.organizationId,
    );
    const saved = existing ? { ...entity, id: existing.id } : entity;
    this.memberships.set(saved.id, saved);
    return saved;
  }

  public all(): Membership[] {
    return [...this.memberships.values()];
  }
}

export class InMemoryMembershipInvitationRepo implements IMembershipInvitationRepo {
  private readonly invitations = new Map<string, MembershipInvitation>();

  public constructor(initialInvitations: MembershipInvitation[] = []) {
    initialInvitations.forEach((invitation) => {
      this.invitations.set(invitation.id, invitation);
    });
  }

  public async findById(id: string): Promise<MembershipInvitation | null> {
    return this.invitations.get(id) ?? null;
  }

  public async findByToken(token: string): Promise<MembershipInvitation | null> {
    return (
      [...this.invitations.values()].find((invitation) => invitation.token === token) ?? null
    );
  }

  public async findPendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
  ): Promise<MembershipInvitation | null> {
    return (
      [...this.invitations.values()].find(
        (invitation) =>
          invitation.organizationId === organizationId &&
          invitation.email === email &&
          invitation.status === "pending",
      ) ?? null
    );
  }

  public async save(entity: MembershipInvitation): Promise<MembershipInvitation> {
    this.invitations.set(entity.id, entity);
    return entity;
  }

  public all(): MembershipInvitation[] {
    return [...this.invitations.values()];
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
