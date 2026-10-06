-- CreateTable
CREATE TABLE "AppConfig" (
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
