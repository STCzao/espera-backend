import {
  ApprovalStatus,
  AuthProvider,
  Role,
  type User as PrismaUser,
} from "@prisma/client";

import { prisma } from "@shared/infrastructure/prisma";
import type { IUserRepo } from "../domain/IUserRepo";
import type { User } from "../domain/User";

const toRoleEnum = (role: User["role"]): Role =>
  role.toUpperCase() as Role;

const toApprovalStatusEnum = (
  approvalStatus: User["approvalStatus"],
): ApprovalStatus => approvalStatus.toUpperCase() as ApprovalStatus;

const toAuthProviderEnum = (authProvider: User["authProvider"]): AuthProvider =>
  authProvider.toUpperCase() as AuthProvider;

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
      where: { emailVerificationToken: token },
    });
    return user ? this.toDomain(user) : null;
  }

  /**
   * Finds a user by password reset token.
   */
  public async findByPasswordResetToken(token: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { passwordResetToken: token },
    });
    return user ? this.toDomain(user) : null;
  }

  /**
   * Creates or updates a user record and returns the normalized domain entity.
   */
  public async save(user: User): Promise<User> {
    // This repository persists full user snapshots, so callers should load and merge
    // existing state before updating individual fields.
    const saved = await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? null,
        locality: user.locality ?? null,
        passwordHash: user.passwordHash ?? null,
        role: toRoleEnum(user.role),
        approvalStatus: toApprovalStatusEnum(user.approvalStatus),
        authProvider: toAuthProviderEnum(user.authProvider),
        googleId: user.googleId ?? null,
        isEmailVerified: user.isEmailVerified,
        emailVerificationToken: user.emailVerificationToken ?? null,
        emailVerificationExpiry: user.emailVerificationExpiry ?? null,
        lastVerificationSentAt: user.lastVerificationSentAt ?? null,
        passwordResetToken: user.passwordResetToken ?? null,
        passwordResetExpiry: user.passwordResetExpiry ?? null,
        passwordResetUsedAt: user.passwordResetUsedAt ?? null,
        isBlocked: user.isBlocked,
        blockedByUserId: user.blockedByUserId ?? null,
        blockedAt: user.blockedAt ?? null,
        blockReason: user.blockReason ?? null,
      },
      update: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? null,
        locality: user.locality ?? null,
        passwordHash: user.passwordHash ?? null,
        role: toRoleEnum(user.role),
        approvalStatus: toApprovalStatusEnum(user.approvalStatus),
        authProvider: toAuthProviderEnum(user.authProvider),
        googleId: user.googleId ?? null,
        isEmailVerified: user.isEmailVerified,
        emailVerificationToken: user.emailVerificationToken ?? null,
        emailVerificationExpiry: user.emailVerificationExpiry ?? null,
        lastVerificationSentAt: user.lastVerificationSentAt ?? null,
        passwordResetToken: user.passwordResetToken ?? null,
        passwordResetExpiry: user.passwordResetExpiry ?? null,
        passwordResetUsedAt: user.passwordResetUsedAt ?? null,
        isBlocked: user.isBlocked,
        blockedByUserId: user.blockedByUserId ?? null,
        blockedAt: user.blockedAt ?? null,
        blockReason: user.blockReason ?? null,
      },
    });

    return this.toDomain(saved);
  }

  /**
   * Deletes a user permanently by id.
   */
  public async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }

  public async count(): Promise<number> {
    return prisma.user.count();
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
      role: raw.role.toLowerCase() as User["role"],
      approvalStatus:
        raw.approvalStatus.toLowerCase() as User["approvalStatus"],
      authProvider: raw.authProvider.toLowerCase() as User["authProvider"],
      googleId: raw.googleId ?? undefined,
      isEmailVerified: raw.isEmailVerified,
      emailVerificationToken: raw.emailVerificationToken ?? undefined,
      emailVerificationExpiry: raw.emailVerificationExpiry ?? undefined,
      lastVerificationSentAt: raw.lastVerificationSentAt ?? undefined,
      passwordResetToken: raw.passwordResetToken ?? undefined,
      passwordResetExpiry: raw.passwordResetExpiry ?? undefined,
      passwordResetUsedAt: raw.passwordResetUsedAt ?? undefined,
      isBlocked: raw.isBlocked,
      blockedByUserId: raw.blockedByUserId ?? undefined,
      blockedAt: raw.blockedAt ?? undefined,
      blockReason: raw.blockReason ?? undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
