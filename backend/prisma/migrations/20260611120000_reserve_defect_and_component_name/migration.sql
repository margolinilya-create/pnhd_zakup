-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "defect_pct" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "passport_components" ADD COLUMN     "name" TEXT;
