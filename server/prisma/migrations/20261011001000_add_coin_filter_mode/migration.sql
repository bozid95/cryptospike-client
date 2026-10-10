-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "clientToken" TEXT,
    "binanceApiKey" TEXT,
    "binanceApiSecret" TEXT,
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
INSERT INTO "new_AppConfig" ("autoExecute", "binanceApiKey", "binanceApiSecret", "clientToken", "environment", "id", "leverage", "marginType", "maxOpenPositions", "riskPerTradePct", "updatedAt") SELECT "autoExecute", "binanceApiKey", "binanceApiSecret", "clientToken", "environment", "id", "leverage", "marginType", "maxOpenPositions", "riskPerTradePct", "updatedAt" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
