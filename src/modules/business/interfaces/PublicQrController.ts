import type { Request, Response } from "express";

import { ResolveBusinessQrCodeUseCase } from "../application/ResolveBusinessQrCodeUseCase";

export class PublicQrController {
  public constructor(
    private readonly resolveBusinessQrCodeUseCase = new ResolveBusinessQrCodeUseCase(),
  ) {}

  public resolve = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.resolveBusinessQrCodeUseCase.execute({
      token: String(request.params.token),
    });
    response.status(200).json(result);
  };
}
