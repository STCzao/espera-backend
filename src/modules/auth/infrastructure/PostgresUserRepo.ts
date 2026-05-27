import { Role, type User as PrismaUser } from "@prisma/client";

import { prisma } from "@shared/infrastructure/prisma";
import type { IUserRepo } from "../domain/IUserRepo";
import type { User } from "../domain/User";

const toRoleEnum = (role: User["role"]): Role =>
  role.toUpperCase().replace(" ", "_") as Role;

export class PostgresUserRepo implements IUserRepo {
  /**
   * Finds a user by its persistent identifier.
   */
  public async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? this.toDomain(user) : null;
  }

  /**
   * Finds a user by email address.
   */
  public async findByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? this.toDomain(user) : null;
  }

  /**
   * Finds a user by email verification token.
   */
  public async findByVerificationToken(token: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { emailVerificationToken: token }
    });
    return user ? this.toDomain(user) : null;
  }

  /**
   * Finds a user by the stored refresh token hash.
   */
  public async findByRefreshTokenHash(hash: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { refreshTokenHash: hash }
    });
    return user ? this.toDomain(user) : null;
  }

  /**
   * Creates or updates a user record and returns the normalized domain entity.
   */
  public async save(user: User): Promise<User> {
    const saved = await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        locality: user.locality,
        passwordHash: user.passwordHash,
        refreshTokenHash: user.refreshTokenHash,
        role: toRoleEnum(user.role),
        isEmailVerified: user.isEmailVerified,
        emailVerificationToken: user.emailVerificationToken,
        emailVerificationExpiry: user.emailVerificationExpiry,
        lastVerificationSentAt: user.lastVerificationSentAt
      },
      update: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        // Prisma expects explicit nulls on update to clear nullable columns.
        phone: user.phone ?? null,
        locality: user.locality ?? null,
        passwordHash: user.passwordHash ?? null,
        refreshTokenHash: user.refreshTokenHash ?? null,
        role: toRoleEnum(user.role),
        isEmailVerified: user.isEmailVerified,
        emailVerificationToken: user.emailVerificationToken ?? null,
        emailVerificationExpiry: user.emailVerificationExpiry ?? null,
        lastVerificationSentAt: user.lastVerificationSentAt ?? null
      }
    });

    return this.toDomain(saved);
  }

  /**
   * Deletes a user permanently by id.
   */
  public async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }

  /**
   * Maps a Prisma model into the auth domain entity.
   */
  private toDomain(raw: PrismaUser): User {
    return {
      id: raw.id,
      email: raw.email,
      firstName: raw.firstName,
      lastName: raw.lastName,
      phone: raw.phone ?? undefined,
      locality: raw.locality ?? undefined,
      passwordHash: raw.passwordHash ?? undefined,
      refreshTokenHash: raw.refreshTokenHash ?? undefined,
      role: raw.role.toLowerCase() as User["role"],
      isEmailVerified: raw.isEmailVerified,
      emailVerificationToken: raw.emailVerificationToken ?? undefined,
      emailVerificationExpiry: raw.emailVerificationExpiry ?? undefined,
      lastVerificationSentAt: raw.lastVerificationSentAt ?? undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
  }
}
