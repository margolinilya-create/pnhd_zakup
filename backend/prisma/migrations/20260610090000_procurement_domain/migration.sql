-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TECHNOLOGIST', 'PURCHASER', 'OPERATOR', 'ANALYST');

-- CreateEnum
CREATE TYPE "CanonicalUnit" AS ENUM ('kg', 'm');

-- CreateEnum
CREATE TYPE "PriceCurrency" AS ENUM ('RUB', 'USD');

-- CreateEnum
CREATE TYPE "ComponentRole" AS ENUM ('MAIN', 'RIB', 'TRIM', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderMode" AS ENUM ('TEST', 'ORDER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'PURCHASER';

-- CreateTable
CREATE TABLE "fabrics" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "composition" TEXT,
    "canonical_unit" "CanonicalUnit" NOT NULL DEFAULT 'kg',
    "density_gsm" INTEGER NOT NULL,
    "width_cm" INTEGER NOT NULL,
    "is_default_width" BOOLEAN NOT NULL DEFAULT true,
    "pre_shrink" DOUBLE PRECISION NOT NULL,
    "is_default_shrink" BOOLEAN NOT NULL DEFAULT true,
    "roll_size" DOUBLE PRECISION NOT NULL,
    "roll_unit" "CanonicalUnit" NOT NULL DEFAULT 'kg',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "lead_time_days" INTEGER,
    "reliability_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_fabrics" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "supplier_id" UUID NOT NULL,
    "fabric_id" UUID NOT NULL,
    "price_rub" DOUBLE PRECISION,
    "price_usd" DOUBLE PRECISION,
    "price_unit" "CanonicalUnit" NOT NULL DEFAULT 'kg',
    "roll_size" DOUBLE PRECISION,
    "lead_time_days" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_fabrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skus" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_passports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "sku_id" UUID NOT NULL,
    "base_size" TEXT NOT NULL DEFAULT 'M',
    "size_coefficients" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_passports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_components" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "passport_id" UUID NOT NULL,
    "role" "ComponentRole" NOT NULL DEFAULT 'MAIN',
    "norm_base" DOUBLE PRECISION NOT NULL,
    "norm_base_meters" DOUBLE PRECISION,
    "loss_cut" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "loss_sew" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passport_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_allowed_fabrics" (
    "component_id" UUID NOT NULL,
    "fabric_id" UUID NOT NULL,

    CONSTRAINT "component_allowed_fabrics_pkey" PRIMARY KEY ("component_id","fabric_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "mode" "OrderMode" NOT NULL DEFAULT 'TEST',
    "sku_id" UUID NOT NULL,
    "size_breakdown" JSONB NOT NULL,
    "component_fabric_map" JSONB NOT NULL,
    "fx_rate" DOUBLE PRECISION NOT NULL,
    "reserve_pct" DOUBLE PRECISION NOT NULL,
    "price_currency" "PriceCurrency" NOT NULL DEFAULT 'RUB',
    "input_snapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_facts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_id" UUID NOT NULL,
    "fabric_id" UUID NOT NULL,
    "actual_consumed" DOUBLE PRECISION NOT NULL,
    "waste_fabric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waste_sewing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waste_natural" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "produced_qty" INTEGER NOT NULL,
    "entered_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actual_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fabrics_code_key" ON "fabrics"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "supplier_fabrics_fabric_id_idx" ON "supplier_fabrics"("fabric_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_fabrics_supplier_fabric_key" ON "supplier_fabrics"("supplier_id", "fabric_id");

-- CreateIndex
CREATE UNIQUE INDEX "skus_code_key" ON "skus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_passports_sku_id_key" ON "product_passports"("sku_id");

-- CreateIndex
CREATE INDEX "passport_components_passport_id_idx" ON "passport_components"("passport_id");

-- CreateIndex
CREATE INDEX "component_allowed_fabrics_fabric_id_idx" ON "component_allowed_fabrics"("fabric_id");

-- CreateIndex
CREATE INDEX "orders_sku_id_idx" ON "orders"("sku_id");

-- CreateIndex
CREATE INDEX "actual_facts_order_id_idx" ON "actual_facts"("order_id");

-- CreateIndex
CREATE INDEX "actual_facts_fabric_id_idx" ON "actual_facts"("fabric_id");

-- AddForeignKey
ALTER TABLE "supplier_fabrics" ADD CONSTRAINT "supplier_fabrics_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_fabrics" ADD CONSTRAINT "supplier_fabrics_fabric_id_fkey" FOREIGN KEY ("fabric_id") REFERENCES "fabrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_passports" ADD CONSTRAINT "product_passports_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_components" ADD CONSTRAINT "passport_components_passport_id_fkey" FOREIGN KEY ("passport_id") REFERENCES "product_passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_allowed_fabrics" ADD CONSTRAINT "component_allowed_fabrics_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "passport_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_allowed_fabrics" ADD CONSTRAINT "component_allowed_fabrics_fabric_id_fkey" FOREIGN KEY ("fabric_id") REFERENCES "fabrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_facts" ADD CONSTRAINT "actual_facts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_facts" ADD CONSTRAINT "actual_facts_fabric_id_fkey" FOREIGN KEY ("fabric_id") REFERENCES "fabrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

