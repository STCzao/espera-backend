import { describe, expect, it, vi } from "vitest";

import { RegisterBusinessUseCase } from "../../../src/modules/business/application/RegisterBusinessUseCase";
import {
  buildBusiness,
  buildUser,
  InMemoryBusinessRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

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

describe("RegisterBusinessUseCase", () => {
  it("registers a pending business and promotes its owner", async () => {
    const noGeocodingService = {
      geocode: vi.fn().mockResolvedValue(null),
    };
    const userRepo = new InMemoryUserRepo([
      buildUser({
        id: validInput.ownerUserId,
        role: "user",
      }),
    ]);
    const businessRepo = new InMemoryBusinessRepo();
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      noGeocodingService,
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
      approvalStatus: "pending",
      listingStatus: "draft",
      ownerUserId: validInput.ownerUserId,
    });
    expect(owner).toMatchObject({
      role: "business_admin",
    });
    expect(noGeocodingService.geocode).toHaveBeenCalledWith(validInput.address);
  });

  it("persists coordinates when optional geocoding succeeds", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        id: validInput.ownerUserId,
        role: "business_admin",
      }),
    ]);
    const businessRepo = new InMemoryBusinessRepo();
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      geocodingService,
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
    const useCase = new RegisterBusinessUseCase(
      businessRepo,
      userRepo,
      geocodingService,
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BUSINESS_SLUG_IN_USE",
    });
  });

  it("validates required address", async () => {
    const useCase = new RegisterBusinessUseCase(
      new InMemoryBusinessRepo(),
      new InMemoryUserRepo(),
      geocodingService,
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
