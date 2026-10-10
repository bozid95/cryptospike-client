-- CreateTable
CREATE TABLE "SpotTrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchange" TEXT NOT NULL DEFAULT 'TOKOCRYPTO',
    "symbol" TEXT NOT NULL,
    "buyOrderId" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "quantity" REAL NOT NULL,
    "tpPrice" REAL NOT NULL,
    "slPrice" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "exitPrice" REAL,
    "exitOrderId" TEXT,
    "pnlUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "targetExchange" TEXT NOT NULL DEFAULT 'BINANCE',
    "clientToken" TEXT,
    "binanceApiKey" TEXT,
    "binanceApiSecret" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'TESTNET',
    "binanceAutoExecute" BOOLEAN NOT NULL DEFAULT false,
    "leverage" INTEGER NOT NULL DEFAULT 10,
    "marginType" TEXT NOT NULL DEFAULT 'ISOLATED',
    "binanceRiskPerTradePct" REAL NOT NULL DEFAULT 2.0,
    "binanceMaxOpenPositions" INTEGER NOT NULL DEFAULT 3,
    "binanceCoinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "binanceTargetCoins" TEXT DEFAULT '',
    "tokocryptoApiKey" TEXT,
    "tokocryptoApiSecret" TEXT,
    "tokocryptoQuoteAsset" TEXT NOT NULL DEFAULT 'USDT',
    "tokocryptoAutoExecute" BOOLEAN NOT NULL DEFAULT false,
    "tokocryptoDryRun" BOOLEAN NOT NULL DEFAULT false,
    "tokocryptoRiskPerTradePct" REAL NOT NULL DEFAULT 10.0,
    "tokocryptoMaxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "tokocryptoCoinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "tokocryptoTargetCoins" TEXT DEFAULT '',
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "riskPerTradePct" REAL NOT NULL DEFAULT 2.0,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 3,
    "coinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "targetCoins" TEXT DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("autoExecute", "binanceApiKey", "binanceApiSecret", "clientToken", "coinFilterMode", "environment", "id", "leverage", "marginType", "maxOpenPositions", "riskPerTradePct", "targetCoins", "updatedAt") SELECT "autoExecute", "binanceApiKey", "binanceApiSecret", "clientToken", "coinFilterMode", "environment", "id", "leverage", "marginType", "maxOpenPositions", "riskPerTradePct", "targetCoins", "updatedAt" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

