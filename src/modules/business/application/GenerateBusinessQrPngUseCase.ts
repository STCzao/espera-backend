import QRCode from "qrcode";

import type { UseCase } from "@shared/kernel/UseCase";
import { GetBusinessQrCodeUseCase } from "./GetBusinessQrCodeUseCase";

export interface GenerateBusinessQrPngInput {
  businessId: string;
  ownerUserId: string;
}

export interface GenerateBusinessQrPngOutput {
  fileName: string;
  contentType: "image/png";
  buffer: Buffer;
}

export class GenerateBusinessQrPngUseCase
  implements UseCase<GenerateBusinessQrPngInput, GenerateBusinessQrPngOutput>
{
  public constructor(
    private readonly getBusinessQrCodeUseCase = new GetBusinessQrCodeUseCase(),
  ) {}

  public async execute(
    input: GenerateBusinessQrPngInput,
  ): Promise<GenerateBusinessQrPngOutput> {
    const qrCode = await this.getBusinessQrCodeUseCase.execute(input);
    const buffer = await QRCode.toBuffer(qrCode.qrUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      type: "png",
      width: 1024,
    });

    return {
      fileName: `espera-business-${qrCode.businessId}-qr.png`,
      contentType: "image/png",
      buffer,
    };
  }
}
