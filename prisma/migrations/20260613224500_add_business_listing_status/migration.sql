-- CreateEnum
CREATE TYPE "BusinessListingStatus" AS ENUM ('DRAFT', 'HIDDEN', 'PUBLISHED');

-- AlterTable
ALTER TABLE "businesses"
ADD COLUMN "listingStatus" "BusinessListingStatus" NOT NULL DEFAULT 'DRAFT';
