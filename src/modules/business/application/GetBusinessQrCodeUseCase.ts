import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { BusinessQrCode } from "../domain/BusinessQrCode";
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

    if (business.status !== "approved") {
      throw AppError.conflict(
        "This business is not currently operating.",
        "BUSINESS_NOT_OPERATING",
      );
    }

    const existingQrCode = await this.businessQrCodeRepo.findActiveByBusinessId(
      business.id,
    );
    const qrCode = existingQrCode ?? (await this.createQrCode(business.id));

    return {
      businessId: business.id,
      token: qrCode.token,
      qrUrl: buildBusinessQrUrl(qrCode.token),
      downloadUrl: buildBusinessQrDownloadUrl(business.id),
      status: "active",
    };
  }

  /**
   * The occupancy check above (findActiveByBusinessId, then a separate
   * save) has a read-then-write race: two concurrent first-time requests
   * can both read "no active QR" before either writes. The DB's partial
   * unique index (one ACTIVE QR per businessId — see migration
   * 20260918000000_unique_active_qr_per_business) rejects the second
   * insert with P2002; since this is a "get or create" operation, the
   * right response to losing that race isn't an error — it's returning the
   * QR the other request just created.
   */
  private async createQrCode(businessId: string): Promise<BusinessQrCode> {
    try {
      return await this.businessQrCodeRepo.save({
        id: randomUUID(),
        businessId,
        token: generateQrToken(),
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.businessQrCodeRepo.findActiveByBusinessId(businessId);
        if (winner) return winner;
      }
      throw error;
    }
  }
}
