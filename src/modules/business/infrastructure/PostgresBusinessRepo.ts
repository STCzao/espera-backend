import { prisma } from "@shared/infrastructure/prisma";
import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";

export class PostgresBusinessRepo implements IBusinessRepo {
  public async findById(id: string): Promise<Business | null> {
    const business = await prisma.business.findUnique({ where: { id } });
    return business
      ? {
          id: business.id,
          name: business.name,
          slug: business.slug,
          categoryId: business.categoryId,
          ownerUserId: business.ownerUserId,
          createdAt: business.createdAt,
          updatedAt: business.updatedAt
        }
      : null;
  }

  public async findBySlug(slug: string): Promise<Business | null> {
    const business = await prisma.business.findUnique({ where: { slug } });
    return business
      ? {
          id: business.id,
          name: business.name,
          slug: business.slug,
          categoryId: business.categoryId,
          ownerUserId: business.ownerUserId,
          createdAt: business.createdAt,
          updatedAt: business.updatedAt
        }
      : null;
  }

  public async save(entity: Business): Promise<Business> {
    const business = await prisma.business.upsert({
      where: { id: entity.id },
      create: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        categoryId: entity.categoryId,
        ownerUserId: entity.ownerUserId
      },
      update: {
        name: entity.name,
        slug: entity.slug,
        categoryId: entity.categoryId,
        ownerUserId: entity.ownerUserId
      }
    });

    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      categoryId: business.categoryId,
      ownerUserId: business.ownerUserId,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt
    };
  }

  public async delete(id: string): Promise<void> {
    await prisma.business.delete({ where: { id } });
  }
}
