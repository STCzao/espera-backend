export interface RefreshSession {
  id: string;
  userId: string;
  tokenHash: string;
  previousTokenHash?: string;
  rotatedAt?: Date;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
