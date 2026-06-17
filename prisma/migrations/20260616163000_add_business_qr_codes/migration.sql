CREATE TYPE "BusinessQrCodeStatus" AS ENUM ('ACTIVE', 'RETIRING', 'REVOKED');

CREATE TABLE "business_qr_codes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "BusinessQrCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_qr_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_qr_codes_token_key" ON "business_qr_codes"("token");
CREATE INDEX "business_qr_codes_businessId_status_idx" ON "business_qr_codes"("businessId", "status");

ALTER TABLE "business_qr_codes"
ADD CONSTRAINT "business_qr_codes_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
