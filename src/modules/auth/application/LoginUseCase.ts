import type { UseCase } from "../../../shared/kernel/UseCase";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
}

export class LoginUseCase implements UseCase<LoginInput, LoginOutput> {
  public async execute(_input: LoginInput): Promise<LoginOutput> {
    return {
      accessToken: "access-token-placeholder",
      refreshToken: "refresh-token-placeholder"
    };
  }
}
