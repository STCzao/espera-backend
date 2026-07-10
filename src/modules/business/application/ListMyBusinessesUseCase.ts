import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const listMyBusinessesSchema = z.object({
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type ListMyBusinessesInput = z.infer<typeof listMyBusinessesSchema>;

export interface ListMyBusinessesOutput {
  businesses: Array<{
    id: string;
    name: string;
    slug: string;
    categoryId: string;
    status: string;
    phone?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    activeServiceWindows: number;
    listingStatus: string;
    operationalStatus: string;
  }>;
}

export class ListMyBusinessesUseCase
  implements UseCase<ListMyBusinessesInput, ListMyBusinessesOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: ListMyBusinessesInput): Promise<ListMyBusinessesOutput> {
    const parsed = listMyBusinessesSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const businesses = await this.businessRepo.findByOwnerUserId(parsed.data.ownerUserId);

    return {
      businesses: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        slug: business.slug,
        categoryId: business.categoryId,
        status: business.status,
        phone: business.phone,
        address: business.address,
        latitude: business.latitude,
        longitude: business.longitude,
        activeServiceWindows: business.activeServiceWindows,
        listingStatus: business.listingStatus,
        operationalStatus: business.operationalStatus,
      })),
    };
  }
}
