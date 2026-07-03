import { describe, expect, it, vi } from "vitest";

import { RegisterBusinessUseCase } from "../../../src/modules/business/application/RegisterBusinessUseCase";
import { CreateOrganizationForOwnerUseCase } from "../../../src/modules/organization/application/CreateOrganizationForOwnerUseCase";
import { EnsureBusinessCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureBusinessCreationAllowedUseCase";
import {
  InMemoryBusinessCategoryRepo,
  InMemoryBusinessRepo,
  InMemoryUserRepo,
  buildBusiness,
  buildUser,
} from "../../helpers/authFakes";
import {
  InMemoryMembershipRepo,
  InMemoryOrganizationRepo,
  InMemorySubscriptionRepo,
  buildMembership,
  buildSubscription,
} from "../../helpers/organizationFakes";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";

const validInput = {
  name: "Cafe Espera",
  categoryId: CATEGORY_ID,
  address: "Av. Corrientes 1234, CABA",
  ownerUserId: OWNER_ID,
};

const geocodingService = {
  geocode: vi.fn().mockResolvedValue({ latitude: -34.6037, longitude: -58.3816 }),
};

const buildUseCases = (options: {
  membershipRepo?: InMemoryMembershipRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
} = {}) => {
  const organizationRepo = new InMemoryOrganizationRepo();
  const membershipRepo = options.membershipRepo ?? new InMemoryMembershipRepo();
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo();
  return {
    membershipRepo,
    subscriptionRepo,
    createOrganizationForOwnerUseCase: new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      membershipRepo,
      subscriptionRepo,
    ),
    ensureBusinessCreationAllowedUseCase: new EnsureBusinessCreationAllowedUseCase(
      subscriptionRepo,
    ),
  };
};

const buildUseCase = (options: {
  userRepo?: InMemoryUserRepo;
  businessRepo?: InMemoryBusinessRepo;
  membershipRepo?: InMemoryMembershipRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
} = {}) => {
  const { createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase, ...rest } =
    buildUseCases(options);
  return {
    ...rest,
    useCase: new RegisterBusinessUseCase(
      options.businessRepo ?? new InMemoryBusinessRepo(),
      options.userRepo ?? new InMemoryUserRepo([buildUser({ id: OWNER_ID, role: "business_admin" })]),
      geocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
      new InMemoryBusinessCategoryRepo(),
    ),
    businessRepo: options.businessRepo ?? new InMemoryBusinessRepo(),
  };
};

describe("RegisterBusinessUseCase", () => {
  it("rejects users that are not business_admin", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: OWNER_ID, role: "user" }),
    ]);
    const { useCase } = buildUseCase({ userRepo });

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "NOT_BUSINESS_ADMIN",
    });
  });

  it("registers a business and creates Organization transparently", async () => {
    const businessRepo = new InMemoryBusinessRepo();
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: OWNER_ID, role: "business_admin" }),
    ]);
    const { useCase, membershipRepo, subscriptionRepo } = buildUseCase({ businessRepo, userRepo });

    const result = await useCase.execute(validInput);
    const created = businessRepo.all()[0];

    expect(result).toEqual({ businessId: created.id });
    expect(created).toMatchObject({
      name: "Cafe Espera",
      categoryId: CATEGORY_ID,
      address: validInput.address,
      status: "pending",
      listingStatus: "draft",
      ownerUserId: OWNER_ID,
      organizationId: expect.any(String),
    });
    expect(subscriptionRepo.all()).toMatchObject([
      { organizationId: created.organizationId, plan: "basic" },
    ]);
    expect(membershipRepo.all()).toMatchObject([
      { userId: OWNER_ID, organizationId: created.organizationId, role: "admin" },
    ]);
  });

  it("persists coordinates when geocoding succeeds", async () => {
    const businessRepo = new InMemoryBusinessRepo();
    const { useCase } = buildUseCase({ businessRepo });

    await useCase.execute(validInput);

    expect(businessRepo.all()[0]).toMatchObject({
      latitude: -34.6037,
      longitude: -58.3816,
    });
  });

  it("saves business without coordinates when geocoding returns null", async () => {
    const noGeocodingService = { geocode: vi.fn().mockResolvedValue(null) };
    const businessRepo = new InMemoryBusinessRepo();
    const { createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase } =
      buildUseCases();
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      new InMemoryUserRepo([buildUser({ id: OWNER_ID, role: "business_admin" })]),
      noGeocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
      new InMemoryBusinessCategoryRepo(),
    );

    await useCase.execute(validInput);

    expect(businessRepo.all()[0]).toMatchObject({ latitude: undefined, longitude: undefined });
  });

  it("auto-generates a unique slug when base slug is already taken", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ slug: "cafe-espera" }),
    ]);
    const { useCase } = buildUseCase({ businessRepo });

    await useCase.execute(validInput);

    const slugs = businessRepo.all().map((b) => b.slug);
    expect(slugs).toContain("cafe-espera-2");
  });

  it("rejects a second business when the plan only allows one", async () => {
    const organizationId = "organization-1";
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ userId: OWNER_ID, organizationId, role: "admin" }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId, plan: "basic" }),
    ]);
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "existing", slug: "existing-slug", organizationId, ownerUserId: OWNER_ID }),
    ]);
    const { useCase } = buildUseCase({ businessRepo, membershipRepo, subscriptionRepo });

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_BUSINESS_LIMIT_REACHED",
    });
    expect(businessRepo.all()).toHaveLength(1);
  });

  it("rejects an invalid category id", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ ...validInput, categoryId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_CATEGORY" });
  });

  it("rejects missing address", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ ...validInput, address: "" }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Business address is required." });
  });
});
