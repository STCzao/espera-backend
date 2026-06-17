import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessQrCodeRepo } from "../domain/IBusinessQrCodeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessQrCodeRepo } from "../infrastructure/PostgresBusinessQrCodeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";
import { buildBusinessQrDownloadUrl, buildBusinessQrUrl } from "./BusinessQrUrl";

const getBusinessQrCodeSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type GetBusinessQrCodeInput = z.infer<typeof getBusinessQrCodeSchema>;

export interface GetBusinessQrCodeOutput {
  businessId: string;
  token: string;
  qrUrl: string;
  downloadUrl: string;
  status: "active";
}

const generateQrToken = (): string => randomBytes(24).toString("base64url");

export class GetBusinessQrCodeUseCase
  implements UseCase<GetBusinessQrCodeInput, GetBusinessQrCodeOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly businessQrCodeRepo: IBusinessQrCodeRepo = new PostgresBusinessQrCodeRepo(),
  ) {}

  public async execute(
    input: GetBusinessQrCodeInput,
  ): Promise<GetBusinessQrCodeOutput> {
    const parsed = getBusinessQrCodeSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to view this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const existingQrCode = await this.businessQrCodeRepo.findActiveByBusinessId(
      business.id,
    );
    const qrCode =
      existingQrCode ??
      (await this.businessQrCodeRepo.save({
        id: randomUUID(),
        businessId: business.id,
        token: generateQrToken(),
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    return {
      businessId: business.id,
      token: qrCode.token,
      qrUrl: buildBusinessQrUrl(qrCode.token),
      downloadUrl: buildBusinessQrDownloadUrl(business.id),
      status: "active",
    };
  }
}
