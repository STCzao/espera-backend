import type { TransactionHandle } from "../../../shared/kernel/Repository";
import type { RefreshSession } from "./RefreshSession";

export interface IRefreshSessionRepo {
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  findByPreviousTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  save(session: RefreshSession): Promise<RefreshSession>;
  /**
   * Compare-and-swap rotation: replaces the session's token hash only if it
   * still equals `expectedTokenHash` and the session isn't revoked. Returns
   * false when someone else rotated (or revoked) it first, so two concurrent
   * refreshes with the same token can't both win.
   */
  rotate(input: {
    sessionId: string;
    expectedTokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    rotatedAt: Date;
  }): Promise<boolean>;
  revokeById(id: string): Promise<void>;
  revokeAllByUserId(userId: string, tx?: TransactionHandle): Promise<void>;
  deleteExpired(): Promise<void>;
}
