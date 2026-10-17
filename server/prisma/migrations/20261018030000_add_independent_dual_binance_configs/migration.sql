-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BinanceConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "testnetApiKey" TEXT,
    "testnetApiSecret" TEXT,
    "testnetAutoExecute" BOOLEAN NOT NULL DEFAULT false,
    "testnetTradeDirection" TEXT NOT NULL DEFAULT 'BOTH',
    "testnetMinScore" INTEGER NOT NULL DEFAULT 0,
    "testnetBlockLongOnBtcBearish" BOOLEAN NOT NULL DEFAULT true,
    "testnetLeverage" INTEGER NOT NULL DEFAULT 10,
    "testnetMarginType" TEXT NOT NULL DEFAULT 'ISOLATED',
    "testnetRiskPerTradePct" REAL NOT NULL DEFAULT 2.0,
    "testnetMaxOpenPositions" INTEGER NOT NULL DEFAULT 3,
    "testnetCoinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "testnetTargetCoins" TEXT DEFAULT '',
    "liveApiKey" TEXT,
    "liveApiSecret" TEXT,
    "liveAutoExecute" BOOLEAN NOT NULL DEFAULT false,
    "liveTradeDirection" TEXT NOT NULL DEFAULT 'BOTH',
    "liveMinScore" INTEGER NOT NULL DEFAULT 0,
    "liveBlockLongOnBtcBearish" BOOLEAN NOT NULL DEFAULT true,
    "liveLeverage" INTEGER NOT NULL DEFAULT 10,
    "liveMarginType" TEXT NOT NULL DEFAULT 'ISOLATED',
    "liveRiskPerTradePct" REAL NOT NULL DEFAULT 2.0,
    "liveMaxOpenPositions" INTEGER NOT NULL DEFAULT 3,
    "liveCoinFilterMode" TEXT NOT NULL DEFAULT 'ALL',
    "liveTargetCoins" TEXT DEFAULT '',
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
INSERT INTO "new_BinanceConfig" (
    "id",
    "testnetApiKey", "testnetApiSecret", "testnetAutoExecute", "testnetTradeDirection", "testnetMinScore", "testnetBlockLongOnBtcBearish", "testnetLeverage", "testnetMarginType", "testnetRiskPerTradePct", "testnetMaxOpenPositions", "testnetCoinFilterMode", "testnetTargetCoins",
    "liveApiKey", "liveApiSecret", "liveAutoExecute", "liveTradeDirection", "liveMinScore", "liveBlockLongOnBtcBearish", "liveLeverage", "liveMarginType", "liveRiskPerTradePct", "liveMaxOpenPositions", "liveCoinFilterMode", "liveTargetCoins",
    "apiKey", "apiSecret", "environment", "autoExecute", "tradeDirection", "minScore", "blockLongOnBtcBearish", "leverage", "marginType", "riskPerTradePct", "maxOpenPositions", "coinFilterMode", "targetCoins", "updatedAt"
) SELECT 
    "id",
    CASE WHEN "environment" = 'TESTNET' THEN "apiKey" ELSE NULL END,
    CASE WHEN "environment" = 'TESTNET' THEN "apiSecret" ELSE NULL END,
    CASE WHEN "environment" = 'TESTNET' THEN "autoExecute" ELSE 0 END,
    "tradeDirection", "minScore", "blockLongOnBtcBearish", "leverage", "marginType", "riskPerTradePct", "maxOpenPositions", "coinFilterMode", "targetCoins",
    CASE WHEN "environment" = 'LIVE' THEN "apiKey" ELSE NULL END,
    CASE WHEN "environment" = 'LIVE' THEN "apiSecret" ELSE NULL END,
    CASE WHEN "environment" = 'LIVE' THEN "autoExecute" ELSE 0 END,
    "tradeDirection", "minScore", "blockLongOnBtcBearish", "leverage", "marginType", "riskPerTradePct", "maxOpenPositions", "coinFilterMode", "targetCoins",
    "apiKey", "apiSecret", "environment", "autoExecute", "tradeDirection", "minScore", "blockLongOnBtcBearish", "leverage", "marginType", "riskPerTradePct", "maxOpenPositions", "coinFilterMode", "targetCoins", "updatedAt"
FROM "BinanceConfig";
DROP TABLE "BinanceConfig";
ALTER TABLE "new_BinanceConfig" RENAME TO "BinanceConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

