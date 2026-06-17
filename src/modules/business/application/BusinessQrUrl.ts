import { env } from "@shared/infrastructure/env";

export const buildBusinessQrUrl = (token: string): string => {
  const appUrl = env.APP_URL ?? "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/q/${encodeURIComponent(token)}`;
};

export const buildBusinessQrDownloadUrl = (businessId: string): string =>
  `${env.API_PREFIX}/business/${encodeURIComponent(businessId)}/qr.png`;
