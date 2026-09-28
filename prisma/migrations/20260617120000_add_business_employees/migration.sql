CREATE TYPE "BusinessEmployeeStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "BusinessEmployeeInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "business_employees" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BusinessEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_employee_invitations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "BusinessEmployeeInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_employee_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_employees_businessId_userId_key" ON "business_employees"("businessId", "userId");
CREATE INDEX "business_employees_businessId_status_idx" ON "business_employees"("businessId", "status");
CREATE INDEX "business_employees_userId_idx" ON "business_employees"("userId");
CREATE UNIQUE INDEX "business_employee_invitations_token_key" ON "business_employee_invitations"("token");
CREATE INDEX "business_employee_invitations_businessId_email_status_idx" ON "business_employee_invitations"("businessId", "email", "status");

ALTER TABLE "business_employees"
ADD CONSTRAINT "business_employees_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_employees"
ADD CONSTRAINT "business_employees_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_employee_invitations"
ADD CONSTRAINT "business_employee_invitations_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
