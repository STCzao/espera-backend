import { prisma } from "@shared/infrastructure/prisma";
import type { IOrganizationRepo } from "../domain/IOrganizationRepo";
import type { Organization } from "../domain/Organization";

export class PostgresOrganizationRepo implements IOrganizationRepo {
  public async findById(id: string): Promise<Organization | null> {
    const organization = await prisma.organization.findUnique({ where: { id } });
    return organization ?? null;
  }

  public async save(entity: Organization): Promise<Organization> {
    return await prisma.organization.upsert({
      where: { id: entity.id },
      create: {
        id: entity.id,
        name: entity.name,
      },
      update: {
        name: entity.name,
      },
    });
  }
}
