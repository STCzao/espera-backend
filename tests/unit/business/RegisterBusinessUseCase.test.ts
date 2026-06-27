import { describe, expect, it, vi } from "vitest";

import { RegisterBusinessUseCase } from "../../../src/modules/business/application/RegisterBusinessUseCase";
import { CreateOrganizationForOwnerUseCase } from "../../../src/modules/organization/application/CreateOrganizationForOwnerUseCase";
import { EnsureBusinessCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureBusinessCreationAllowedUseCase";
import {
  buildBusiness,
  buildUser,
  InMemoryBusinessRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";
import {
  InMemoryMembershipRepo,
  InMemoryOrganizationRepo,
  InMemorySubscriptionRepo,
  buildMembership,
  buildSubscription,
} from "../../helpers/organizationFakes";

const validInput = {
  name: "Cafe Espera",
  slug: "cafe-espera",
  categoryId: "11111111-1111-4111-8111-111111111111",
  address: "Av. Corrientes 1234, CABA",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
};

const geocodingService = {
  geocode: vi.fn().mockResolvedValue({
    latitude: -34.6037,
    longitude: -58.3816,
  }),
};

const buildOrganizationUseCases = (options: {
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

describe("RegisterBusinessUseCase", () => {
  it("registers a business with address and pending owner approval", async () => {
    const noGeocodingService = {
      geocode: vi.fn().mockResolvedValue(null),
    };
    const userRepo = new InMemoryUserRepo([
      buildUser({
        id: validInput.ownerUserId,
        role: "user",
        approvalStatus: "approved",
      }),
    ]);
    const businessRepo = new InMemoryBusinessRepo();
    const { createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase } =
      buildOrganizationUseCases();
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      noGeocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
    );

    const result = await useCase.execute(validInput);
    const createdBusiness = businessRepo.all()[0];
    const owner = await userRepo.findById(validInput.ownerUserId);

    expect(result).toEqual({ businessId: createdBusiness.id });
    expect(createdBusiness).toMatchObject({
      name: "Cafe Espera",
      slug: "cafe-espera",
      categoryId: validInput.categoryId,
      address: validInput.address,
      latitude: undefined,
      longitude: undefined,
      listingStatus: "draft",
      ownerUserId: validInput.ownerUserId,
      organizationId: expect.any(String),
    });
    expect(owner).toMatchObject({
      role: "business_admin",
      approvalStatus: "pending",
    });
    expect(noGeocodingService.geocode).toHaveBeenCalledWith(validInput.address);
  });

  it("creates an Organization with a BASIC Subscription and an ADMIN Membership transparently", async () => {
    const userRepo = new InMemoryUserRepo([buildUser({ id: validInput.ownerUserId })]);
    const businessRepo = new InMemoryBusinessRepo();
    const { membershipRepo, subscriptionRepo, createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase } =
      buildOrganizationUseCases();
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      geocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
    );

    const { businessId } = await useCase.execute(validInput);
    const createdBusiness = await businessRepo.findById(businessId);

    expect(subscriptionRepo.all()).toMatchObject([
      { organizationId: createdBusiness?.organizationId, plan: "basic" },
    ]);
    expect(membershipRepo.all()).toMatchObject([
      {
        userId: validInput.ownerUserId,
        organizationId: createdBusiness?.organizationId,
        role: "admin",
      },
    ]);
  });

  it("rejects a second business when the account's plan only allows one", async () => {
    const organizationId = "organization-1";
    const userRepo = new InMemoryUserRepo([buildUser({ id: validInput.ownerUserId })]);
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "existing-business", slug: "existing-business-slug", organizationId }),
    ]);
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ userId: validInput.ownerUserId, organizationId, role: "admin" }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId, plan: "basic" }),
    ]);
    const { createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase } =
      buildOrganizationUseCases({ membershipRepo, subscriptionRepo });
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      geocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_BUSINESS_LIMIT_REACHED",
    });
    expect(businessRepo.all()).toHaveLength(1);
  });

  it("persists coordinates when optional geocoding succeeds", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        id: validInput.ownerUserId,
        role: "business_admin",
        approvalStatus: "approved",
      }),
    ]);
    const businessRepo = new InMemoryBusinessRepo();
    const { createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase } =
      buildOrganizationUseCases();
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      geocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
    );

    await useCase.execute(validInput);

    expect(businessRepo.all()[0]).toMatchObject({
      address: validInput.address,
      latitude: -34.6037,
      longitude: -58.3816,
    });
  });

  it("rejects duplicated business slugs", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: validInput.ownerUserId }),
    ]);
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ slug: validInput.slug }),
    ]);
    const { createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase } =
      buildOrganizationUseCases();
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      geocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BUSINESS_SLUG_IN_USE",
    });
  });

  it("validates required address", async () => {
    const { createOrganizationForOwnerUseCase, ensureBusinessCreationAllowedUseCase } =
      buildOrganizationUseCases();
    const useCase = new RegisterBusinessUseCase(
      new InMemoryBusinessRepo(),
      new InMemoryUserRepo(),
      geocodingService,
      createOrganizationForOwnerUseCase,
      ensureBusinessCreationAllowedUseCase,
    );

    await expect(
      useCase.execute({
        ...validInput,
        address: "",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Business address is required.",
    });
  });
});
