import { prisma } from "@shared/infrastructure/prisma";
import type { BusinessCategory } from "../domain/BusinessCategory";
import type { IBusinessCategoryRepo } from "../domain/IBusinessCategoryRepo";

export class PostgresBusinessCategoryRepo implements IBusinessCategoryRepo {
  public async findAll(): Promise<BusinessCategory[]> {
    const rows = await prisma.businessCategory.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
  }

  public async findById(id: string): Promise<BusinessCategory | null> {
    const row = await prisma.businessCategory.findUnique({ where: { id } });
    return row ? { id: row.id, name: row.name, slug: row.slug } : null;
  }
}
