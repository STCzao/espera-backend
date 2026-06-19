import { describe, expect, it, vi } from "vitest";

import { RegisterBusinessWithGoogleUseCase } from "../../../src/modules/auth/application/RegisterBusinessWithGoogleUseCase";
import {
  buildUser,
  InMemoryBusinessRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const validInput = {
  code: "google-code",
  state: "oauth-state",
  businessName: "Cafe Espera Google",
  businessSlug: "cafe-espera-google",
  categoryId: "11111111-1111-4111-8111-111111111111",
};

const buildGoogleOAuthService = (overrides = {}) => ({
  getAuthorizationUrl: vi.fn((state: string) => `https://google.test?state=${state}`),
  exchangeCodeForProfile: vi.fn().mockResolvedValue({
    googleId: "google-1",
    email: "owner.google@example.com",
    firstName: "Google",
    lastName: "Owner",
    emailVerified: true,
    ...overrides,
  }),
});

describe("RegisterBusinessWithGoogleUseCase", () => {
  it("creates a verified pending business admin and business", async () => {
    const userRepo = new InMemoryUserRepo();
    const businessRepo = new InMemoryBusinessRepo();
    const googleOAuthService = buildGoogleOAuthService();
    const useCase = new RegisterBusinessWithGoogleUseCase(
      userRepo,
      businessRepo,
      googleOAuthService,
    );

    const result = await useCase.execute(validInput);
    const createdUser = userRepo.all()[0];
    const createdBusiness = businessRepo.all()[0];

    expect(result).toMatchObject({
      status: "pending_approval",
      email: "owner.google@example.com",
      userId: createdUser.id,
      businessId: createdBusiness.id,
    });
    expect(createdUser).toMatchObject({
      role: "business_admin",
      authProvider: "google",
      googleId: "google-1",
      isEmailVerified: true,
    });
    expect(createdBusiness).toMatchObject({
      name: "Cafe Espera Google",
      slug: "cafe-espera-google",
      approvalStatus: "pending",
      listingStatus: "draft",
      ownerUserId: createdUser.id,
    });
  });

  it("returns existing_account when the Google email already exists", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        email: "owner.google@example.com",
        authProvider: "google",
        googleId: "google-1",
      }),
    ]);
    const businessRepo = new InMemoryBusinessRepo();
    const useCase = new RegisterBusinessWithGoogleUseCase(
      userRepo,
      businessRepo,
      buildGoogleOAuthService(),
    );

    const result = await useCase.execute(validInput);

    expect(result).toEqual({
      status: "existing_account",
      email: "owner.google@example.com",
    });
    expect(businessRepo.all()).toHaveLength(0);
  });

  it("rejects Google profiles without verified email", async () => {
    const useCase = new RegisterBusinessWithGoogleUseCase(
      new InMemoryUserRepo(),
      new InMemoryBusinessRepo(),
      buildGoogleOAuthService({ emailVerified: false }),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "GOOGLE_EMAIL_NOT_VERIFIED",
    });
  });
});
