import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IOrganizationRepo } from "../domain/IOrganizationRepo";
import type { Organization } from "../domain/Organization";
import { PostgresOrganizationRepo } from "../infrastructure/PostgresOrganizationRepo";

export type ListPendingOrganizationsInput = void;

export interface ListPendingOrganizationsOutput {
  organizations: Organization[];
}

/**
 * Lists Organizations pending initial approval (HU-8.2, first of the two
 * separate lists — the other being pending Business under already-approved
 * Organizations, see ListPendingBusinessesUseCase).
 */
export class ListPendingOrganizationsUseCase
  implements UseCase<ListPendingOrganizationsInput, ListPendingOrganizationsOutput>
{
  public constructor(
    private readonly organizationRepo: IOrganizationRepo = new PostgresOrganizationRepo(),
  ) {}

  public async execute(): Promise<ListPendingOrganizationsOutput> {
    const organizations = await this.organizationRepo.findPending();
    return { organizations };
  }
}
