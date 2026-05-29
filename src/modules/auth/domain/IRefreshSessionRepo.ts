import type { RefreshSession } from "./RefreshSession";

export interface IRefreshSessionRepo {
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  save(session: RefreshSession): Promise<RefreshSession>;
  revokeById(id: string): Promise<void>;
  revokeAllByUserId(userId: string): Promise<void>;
  deleteExpired(): Promise<void>;
}
