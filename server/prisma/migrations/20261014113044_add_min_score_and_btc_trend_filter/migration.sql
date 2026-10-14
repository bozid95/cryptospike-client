-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BinanceConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'TESTNET',
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "tradeDirection" TEXT NOT NULL DEFAULT 'BOTH',
    "minScore" INTEGER NOT NULL DEFAULT 0,
    "blockLongOnBtcBearish" BOOLEAN NOT NULL DEFAULT true,
    "leverage" INTEGER NOT NULL DEFAULT 10,
    "marginType" TEXT NOT NULL DEFAULT 'ISOLATED',
    "riskPerTradePct" REAL NOT NULL DEFAULT 2.0,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 3,
    "coinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "targetCoins" TEXT DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BinanceConfig" ("apiKey", "apiSecret", "autoExecute", "coinFilterMode", "environment", "id", "leverage", "marginType", "maxOpenPositions", "riskPerTradePct", "targetCoins", "tradeDirection", "updatedAt") SELECT "apiKey", "apiSecret", "autoExecute", "coinFilterMode", "environment", "id", "leverage", "marginType", "maxOpenPositions", "riskPerTradePct", "targetCoins", "tradeDirection", "updatedAt" FROM "BinanceConfig";
DROP TABLE "BinanceConfig";
ALTER TABLE "new_BinanceConfig" RENAME TO "BinanceConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
