import type { UseCase } from "../../../shared/kernel/UseCase";

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenOutput {
  accessToken: string;
}

export class RefreshTokenUseCase
  implements UseCase<RefreshTokenInput, RefreshTokenOutput>
{
  public async execute(_input: RefreshTokenInput): Promise<RefreshTokenOutput> {
    return {
      accessToken: "new-access-token-placeholder"
    };
  }
}
