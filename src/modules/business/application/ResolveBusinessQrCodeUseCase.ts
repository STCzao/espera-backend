import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessQrCodeRepo } from "../domain/IBusinessQrCodeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessQrCodeRepo } from "../infrastructure/PostgresBusinessQrCodeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";
import { buildBusinessQrUrl } from "./BusinessQrUrl";

const resolveBusinessQrCodeSchema = z.object({
  token: z.string().trim().min(16, "Invalid QR token."),
});

export type ResolveBusinessQrCodeInput = z.infer<
  typeof resolveBusinessQrCodeSchema
>;

export interface ResolveBusinessQrCodeOutput {
  token: string;
  qrUrl: string;
  qrStatus: "active" | "retiring";
  action: "OPEN_BUSINESS_TURN_FLOW";
  appPath: string;
  business: {
    id: string;
    name: string;
    slug: string;
    categoryId: string;
    address?: string;
    listingStatus: "draft" | "hidden" | "published";
    activeServiceWindows: number;
  };
}

export class ResolveBusinessQrCodeUseCase
  implements UseCase<ResolveBusinessQrCodeInput, ResolveBusinessQrCodeOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly businessQrCodeRepo: IBusinessQrCodeRepo = new PostgresBusinessQrCodeRepo(),
  ) {}

  public async execute(
    input: ResolveBusinessQrCodeInput,
  ): Promise<ResolveBusinessQrCodeOutput> {
    const parsed = resolveBusinessQrCodeSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const qrCode = await this.businessQrCodeRepo.findResolvableByToken(
      parsed.data.token,
      new Date(),
    );
    if (!qrCode) {
      throw AppError.notFound("QR code not found or expired.", "QR_CODE_NOT_FOUND");
    }

    const business = await this.businessRepo.findById(qrCode.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    return {
      token: qrCode.token,
      qrUrl: buildBusinessQrUrl(qrCode.token),
      qrStatus: qrCode.status === "retiring" ? "retiring" : "active",
      action: "OPEN_BUSINESS_TURN_FLOW",
      appPath: `/business/${business.id}/turns/new`,
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        categoryId: business.categoryId,
        address: business.address,
        listingStatus: business.listingStatus,
        activeServiceWindows: business.activeServiceWindows,
      },
    };
  }
}
