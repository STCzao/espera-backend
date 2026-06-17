import { describe, expect, it, vi } from "vitest";

import { UpdateBusinessProfileUseCase } from "../../../src/modules/business/application/UpdateBusinessProfileUseCase";
import { buildBusiness, InMemoryBusinessRepo } from "../../helpers/authFakes";

const geocodingService = {
  geocode: vi.fn().mockResolvedValue({
    latitude: -34.6037,
    longitude: -58.3816,
  }),
};

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Cafe Espera Updated",
  categoryId: "33333333-3333-4333-8333-333333333333",
  address: "Av. Santa Fe 1234, CABA",
};

describe("UpdateBusinessProfileUseCase", () => {
  it("updates profile fields without requiring geocoding", async () => {
    const noGeocodingService = {
      geocode: vi.fn().mockResolvedValue(null),
    };
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
        latitude: undefined,
        longitude: undefined,
      }),
    ]);
    const useCase = new UpdateBusinessProfileUseCase(
      businessRepo,
      noGeocodingService,
    );

    const result = await useCase.execute(validInput);
    const updatedBusiness = await businessRepo.findById(validInput.businessId);

    expect(result).toEqual({
      businessId: validInput.businessId,
      name: validInput.name,
      categoryId: validInput.categoryId,
      address: validInput.address,
      listingStatus: "draft",
      categoryConfig: {
        categoryId: validInput.categoryId,
        attributes: [
          {
            key: "averageServiceMinutes",
            label: "Tiempo promedio por tramite",
            type: "number",
            required: true,
          },
          {
            key: "requiresDocumentation",
            label: "Requiere documentacion",
            type: "boolean",
            required: false,
          },
          {
            key: "serviceArea",
            label: "Area de atencion",
            type: "text",
            required: false,
          },
        ],
      },
    });
    expect(updatedBusiness).toMatchObject({
      name: validInput.name,
      categoryId: validInput.categoryId,
      address: validInput.address,
      latitude: undefined,
      longitude: undefined,
    });
    expect(noGeocodingService.geocode).toHaveBeenCalledWith(validInput.address);
  });

  it("persists coordinates when optional geocoding succeeds", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
      }),
    ]);
    const useCase = new UpdateBusinessProfileUseCase(
      businessRepo,
      geocodingService,
    );

    const result = await useCase.execute(validInput);
    const updatedBusiness = await businessRepo.findById(validInput.businessId);

    expect(result).toMatchObject({
      businessId: validInput.businessId,
      name: validInput.name,
      categoryId: validInput.categoryId,
      address: validInput.address,
      latitude: -34.6037,
      longitude: -58.3816,
    });
    expect(updatedBusiness).toMatchObject({
      latitude: -34.6037,
      longitude: -58.3816,
    });
    expect(geocodingService.geocode).toHaveBeenCalledWith(validInput.address);
  });

  it("rejects updates from users that do not own the business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: "different-owner",
      }),
    ]);
    const useCase = new UpdateBusinessProfileUseCase(
      businessRepo,
      geocodingService,
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });

  it("validates required address", async () => {
    const useCase = new UpdateBusinessProfileUseCase(
      new InMemoryBusinessRepo(),
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
