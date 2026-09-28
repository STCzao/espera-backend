import jwt, { type JwtPayload } from "jsonwebtoken";

import { getAccessTokenSecret } from "@shared/infrastructure/env";
import { ACCESS_TOKEN_ALGORITHM } from "@modules/auth/public-api";
import { loadAuthenticatedUser } from "./loadAuthenticatedUser";
import type { AuthenticatedUserSnapshot } from "./loadAuthenticatedUser";

type AccessTokenPayload = JwtPayload & { sub: string };

/**
 * Resolves the access token a Socket.IO client sends in its handshake
 * (`socket.handshake.auth.token`) into the same authenticated principal the
 * HTTP `authenticate` middleware produces: the token proves identity, and
 * role/approval/blocked are re-read from the database, so a socket opened by
 * a user who was blocked a minute ago is not treated as staff.
 *
 * Returns null instead of throwing for *every* rejection, including a
 * missing, malformed, expired or wrongly-signed token. A socket connection
 * is shared by two very different callers: the staff panel, which does send
 * a token, and the anonymous web-ligera visitor (HU-4.2), which never will.
 * Refusing the connection on a bad token would take the guest's realtime
 * updates down over something that only ever affects staff permissions —
 * so the caller downgrades to anonymous instead, and `authorizeQueueJoin`
 * decides what an anonymous socket may do.
 */
export const authenticateSocket = async (
  token: unknown,
): Promise<AuthenticatedUserSnapshot | null> => {
  if (typeof token !== "string" || token.trim() === "") return null;

  let decoded: AccessTokenPayload;
  try {
    decoded = jwt.verify(token, getAccessTokenSecret(), {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
    }) as AccessTokenPayload;
  } catch {
    return null;
  }

  const user = await loadAuthenticatedUser(decoded.sub);
  if (!user || user.isBlocked) return null;

  return user;
};
