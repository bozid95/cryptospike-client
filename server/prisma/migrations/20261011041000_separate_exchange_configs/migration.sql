-- CreateTable BinanceConfig
CREATE TABLE "BinanceConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'TESTNET',
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "leverage" INTEGER NOT NULL DEFAULT 10,
    "marginType" TEXT NOT NULL DEFAULT 'ISOLATED',
    "riskPerTradePct" REAL NOT NULL DEFAULT 2.0,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 3,
    "coinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "targetCoins" TEXT DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable TokocryptoConfig
CREATE TABLE "TokocryptoConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "quoteAsset" TEXT NOT NULL DEFAULT 'USDT',
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "riskPerTradePct" REAL NOT NULL DEFAULT 10.0,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "coinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "targetCoins" TEXT DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- Copy existing data to BinanceConfig
INSERT INTO "BinanceConfig" ("id", "apiKey", "apiSecret", "environment", "autoExecute", "leverage", "marginType", "riskPerTradePct", "maxOpenPositions", "coinFilterMode", "targetCoins", "updatedAt")
SELECT 1, "binanceApiKey", "binanceApiSecret", "environment", "binanceAutoExecute", "leverage", "marginType", "binanceRiskPerTradePct", "binanceMaxOpenPositions", "binanceCoinFilterMode", "binanceTargetCoins", "updatedAt" FROM "AppConfig";

-- Copy existing data to TokocryptoConfig
INSERT INTO "TokocryptoConfig" ("id", "apiKey", "apiSecret", "quoteAsset", "autoExecute", "dryRun", "riskPerTradePct", "maxOpenPositions", "coinFilterMode", "targetCoins", "updatedAt")
SELECT 1, "tokocryptoApiKey", "tokocryptoApiSecret", "tokocryptoQuoteAsset", "tokocryptoAutoExecute", "tokocryptoDryRun", "tokocryptoRiskPerTradePct", "tokocryptoMaxOpenPositions", "tokocryptoCoinFilterMode", "tokocryptoTargetCoins", "updatedAt" FROM "AppConfig";

-- RedefineTables AppConfig
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "targetExchange" TEXT NOT NULL DEFAULT 'BINANCE',
    "clientToken" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("id", "targetExchange", "clientToken", "updatedAt")
SELECT "id", "targetExchange", "clientToken", "updatedAt" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

