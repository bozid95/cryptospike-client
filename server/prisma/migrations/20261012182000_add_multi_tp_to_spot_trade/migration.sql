-- AlterTable
ALTER TABLE "SpotTrade" ADD COLUMN "remainingQty" REAL;
ALTER TABLE "SpotTrade" ADD COLUMN "tp1Price" REAL;
ALTER TABLE "SpotTrade" ADD COLUMN "tp2Price" REAL;
ALTER TABLE "SpotTrade" ADD COLUMN "tp3Price" REAL;
ALTER TABLE "SpotTrade" ADD COLUMN "tp1Qty" REAL;
ALTER TABLE "SpotTrade" ADD COLUMN "tp2Qty" REAL;
ALTER TABLE "SpotTrade" ADD COLUMN "tp3Qty" REAL;
ALTER TABLE "SpotTrade" ADD COLUMN "tpStage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SpotTrade" ADD COLUMN "realizedPnl" REAL NOT NULL DEFAULT 0;

-- Backfill remainingQty for existing open trades
UPDATE "SpotTrade" SET "remainingQty" = "quantity" WHERE "remainingQty" IS NULL;

