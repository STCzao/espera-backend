import type { UseCase } from "../../../shared/kernel/UseCase";

export interface ConfigureQueueInput {
  businessId: string;
  queueName: string;
  prefix: string;
}

export interface ConfigureQueueOutput {
  configured: true;
  businessId: string;
}

export class ConfigureQueueUseCase
  implements UseCase<ConfigureQueueInput, ConfigureQueueOutput>
{
  public async execute(input: ConfigureQueueInput): Promise<ConfigureQueueOutput> {
    return {
      configured: true,
      businessId: input.businessId
    };
  }
}
