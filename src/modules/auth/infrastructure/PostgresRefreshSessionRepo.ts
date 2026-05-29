import { prisma } from "@shared/infrastructure/prisma";

import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { RefreshSession } from "../domain/RefreshSession";

export class PostgresRefreshSessionRepo implements IRefreshSessionRepo {
  public async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    return session ? this.toDomain(session) : null;
  }

  public async save(session: RefreshSession): Promise<RefreshSession> {
    const saved = await prisma.refreshSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        userId: session.userId,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt ?? null,
      },
      update: {
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt ?? null,
      },
    });

    return this.toDomain(saved);
  }

  public async revokeById(id: string): Promise<void> {
    await prisma.refreshSession.update({
      where: { id },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  public async revokeAllByUserId(userId: string): Promise<void> {
    await prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  public async deleteExpired(): Promise<void> {
    await prisma.refreshSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });
  }

  private toDomain(raw: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): RefreshSession {
    return {
      id: raw.id,
      userId: raw.userId,
      tokenHash: raw.tokenHash,
      expiresAt: raw.expiresAt,
      revokedAt: raw.revokedAt ?? undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
