CREATE TABLE "business_opening_hours" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "opensAt" TEXT NOT NULL,
  "closesAt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "business_opening_hours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_non_working_days" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "business_non_working_days_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_opening_hours_businessId_dayOfWeek_idx"
ON "business_opening_hours"("businessId", "dayOfWeek");

CREATE UNIQUE INDEX "business_non_working_days_businessId_date_key"
ON "business_non_working_days"("businessId", "date");

CREATE INDEX "business_non_working_days_businessId_idx"
ON "business_non_working_days"("businessId");

ALTER TABLE "business_opening_hours"
ADD CONSTRAINT "business_opening_hours_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_non_working_days"
ADD CONSTRAINT "business_non_working_days_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
