import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessQrCodeRepo } from "../domain/IBusinessQrCodeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessQrCodeRepo } from "../infrastructure/PostgresBusinessQrCodeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";
import { buildBusinessQrDownloadUrl, buildBusinessQrUrl } from "./BusinessQrUrl";

const QR_RETIREMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const regenerateBusinessQrCodeSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type RegenerateBusinessQrCodeInput = z.infer<
  typeof regenerateBusinessQrCodeSchema
>;

export interface RegenerateBusinessQrCodeOutput {
  businessId: string;
  token: string;
  qrUrl: string;
  downloadUrl: string;
  status: "active";
  previousQrValidUntil: string;
}

const generateQrToken = (): string => randomBytes(24).toString("base64url");

/**
 * Issues a new printable QR token without breaking scans immediately.
 *
 * The previous token remains resolvable for a 24-hour retirement window so a
 * business can replace printed material without a hard cutover.
 */
export class RegenerateBusinessQrCodeUseCase
  implements
    UseCase<RegenerateBusinessQrCodeInput, RegenerateBusinessQrCodeOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly businessQrCodeRepo: IBusinessQrCodeRepo = new PostgresBusinessQrCodeRepo(),
  ) {}

  public async execute(
    input: RegenerateBusinessQrCodeInput,
  ): Promise<RegenerateBusinessQrCodeOutput> {
    const parsed = regenerateBusinessQrCodeSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to edit this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const previousQrValidUntil = new Date(
      Date.now() + QR_RETIREMENT_WINDOW_MS,
    );
    // Only one QR should be active for the panel, but retiring QR codes can
    // still resolve during the transition window.
    await this.businessQrCodeRepo.retireActiveForBusiness(
      business.id,
      previousQrValidUntil,
    );

    const qrCode = await this.businessQrCodeRepo.save({
      id: randomUUID(),
      businessId: business.id,
      token: generateQrToken(),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      businessId: business.id,
      token: qrCode.token,
      qrUrl: buildBusinessQrUrl(qrCode.token),
      downloadUrl: buildBusinessQrDownloadUrl(business.id),
      status: "active",
      previousQrValidUntil: previousQrValidUntil.toISOString(),
    };
  }
}
