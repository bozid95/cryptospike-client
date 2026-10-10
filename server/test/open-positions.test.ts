import test, { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { handleIncomingSignal } from "../src/services/socket.service";
import { executeTokocryptoSignalOrder } from "../src/lib/tokocrypto";
import { calculateSpotOrderQuantity, validateTokocryptoSignal, normalizeTokocryptoSymbol } from "../src/lib/tokocrypto";
import { evaluateCoinFilter } from "../src/lib/coin-filter";

describe("Comprehensive Open Position Test Suite (All Scenarios & Edge Cases)", () => {
  beforeEach(async () => {
    // Reset database state sebelum setiap pengujian
    await prisma.spotTrade.deleteMany({});
  });

  describe("1. Target Exchange Routing Mode (BINANCE, TOKOCRYPTO, BOTH)", () => {
    it("Mode TOKOCRYPTO Only: harus membuka posisi di Tokocrypto dan mengabaikan Binance", async () => {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: { targetExchange: "TOKOCRYPTO" },
        create: { id: 1, targetExchange: "TOKOCRYPTO" },
      });
      await prisma.tokocryptoConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: true, dryRun: true, quoteAsset: "USDT", maxOpenPositions: 5, coinFilterMode: "ALL" },
        create: { id: 1, autoExecute: true, dryRun: true, quoteAsset: "USDT", maxOpenPositions: 5, coinFilterMode: "ALL" },
      });
      await prisma.binanceConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: true, maxOpenPositions: 3, coinFilterMode: "ALL" },
        create: { id: 1, autoExecute: true, maxOpenPositions: 3, coinFilterMode: "ALL" },
      });

      await handleIncomingSignal({
        symbol: "BTCUSDT",
        side: "LONG",
        entryPrice: 65000,
        source: "TEST_ROUTING_TOKO",
      });

      const trades = await prisma.spotTrade.findMany({ where: { status: "OPEN" } });
      assert.equal(trades.length, 1);
      assert.equal(trades[0].symbol, "BTC_USDT");
      assert.equal(trades[0].entryPrice, 65000);
      assert.equal(trades[0].status, "OPEN");
    });

    it("Mode BINANCE Only: tidak boleh membuat record di SpotTrade (Tokocrypto dilewati)", async () => {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: { targetExchange: "BINANCE" },
        create: { id: 1, targetExchange: "BINANCE" },
      });
      await prisma.tokocryptoConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: true, dryRun: true },
        create: { id: 1, autoExecute: true, dryRun: true },
      });

      await handleIncomingSignal({
        symbol: "ETHUSDT",
        side: "LONG",
        entryPrice: 3500,
        source: "TEST_ROUTING_BINANCE",
      });

      const trades = await prisma.spotTrade.findMany({ where: { status: "OPEN" } });
      assert.equal(trades.length, 0); // Tokocrypto tidak membuka posisi
    });

    it("Mode BOTH (Dual Mode): harus mengeksekusi order Spot Tokocrypto secara simultan", async () => {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: { targetExchange: "BOTH" },
        create: { id: 1, targetExchange: "BOTH" },
      });
      await prisma.tokocryptoConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: true, dryRun: true, quoteAsset: "USDT", maxOpenPositions: 5, coinFilterMode: "ALL" },
        create: { id: 1, autoExecute: true, dryRun: true, quoteAsset: "USDT", maxOpenPositions: 5, coinFilterMode: "ALL" },
      });

      await handleIncomingSignal({
        symbol: "SOLUSDT",
        side: "LONG",
        entryPrice: 150,
        source: "TEST_ROUTING_BOTH",
      });

      const trades = await prisma.spotTrade.findMany({ where: { status: "OPEN" } });
      assert.equal(trades.length, 1);
      assert.equal(trades[0].symbol, "SOL_USDT");
      assert.equal(trades[0].tpPrice, 150 * 1.05); // +5%
      assert.equal(trades[0].slPrice, 150 * 0.975); // -2.5%
    });
  });

  describe("2. Sinyal Side Validation (LONG/BUY vs SHORT/SELL)", () => {
    it("Tokocrypto Spot harus otomatis menolak sinyal SHORT tanpa membuka posisi", async () => {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: { targetExchange: "TOKOCRYPTO" },
        create: { id: 1, targetExchange: "TOKOCRYPTO" },
      });
      await prisma.tokocryptoConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: true, dryRun: true },
        create: { id: 1, autoExecute: true, dryRun: true },
      });

      await handleIncomingSignal({
        symbol: "BTCUSDT",
        side: "SHORT",
        entryPrice: 65000,
      });

      const trades = await prisma.spotTrade.findMany({ where: { status: "OPEN" } });
      assert.equal(trades.length, 0); // SHORT ditolak, 0 posisi
    });

    it("Tokocrypto Spot harus mengizinkan sinyal BUY / LONG", () => {
      const longRes = validateTokocryptoSignal({ symbol: "BTCUSDT", side: "LONG", entryPrice: 65000 });
      assert.equal(longRes.allowed, true);

      const buyRes = validateTokocryptoSignal({ symbol: "ETHUSDT", side: "BUY", entryPrice: 3500 });
      assert.equal(buyRes.allowed, true);

      const sellRes = validateTokocryptoSignal({ symbol: "ETHUSDT", side: "SELL", entryPrice: 3500 });
      assert.equal(sellRes.allowed, false);
    });
  });

  describe("3. Status Auto-Trade Switch (Independen per Exchange)", () => {
    it("Jika tokocryptoConfig.autoExecute = false, sinyal Tokocrypto harus dilewati", async () => {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: { targetExchange: "TOKOCRYPTO" },
        create: { id: 1, targetExchange: "TOKOCRYPTO" },
      });
      await prisma.tokocryptoConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: false, dryRun: true },
        create: { id: 1, autoExecute: false, dryRun: true },
      });

      await handleIncomingSignal({
        symbol: "BTCUSDT",
        side: "LONG",
        entryPrice: 65000,
      });

      const trades = await prisma.spotTrade.findMany({ where: { status: "OPEN" } });
      assert.equal(trades.length, 0);
    });

    it("Dalam Dual Mode (BOTH), jika Toko ON dan Binance OFF, Toko tetap sukses open posisi", async () => {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: { targetExchange: "BOTH" },
        create: { id: 1, targetExchange: "BOTH" },
      });
      await prisma.binanceConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: false },
        create: { id: 1, autoExecute: false },
      });
      await prisma.tokocryptoConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: true, dryRun: true, maxOpenPositions: 5, coinFilterMode: "ALL" },
        create: { id: 1, autoExecute: true, dryRun: true, maxOpenPositions: 5, coinFilterMode: "ALL" },
      });

      await handleIncomingSignal({
        symbol: "AVAXUSDT",
        side: "LONG",
        entryPrice: 30,
      });

      const trades = await prisma.spotTrade.findMany({ where: { status: "OPEN" } });
      assert.equal(trades.length, 1);
      assert.equal(trades[0].symbol, "AVAX_USDT");
    });
  });

  describe("4. Coin Filter Execution (WHITELIST, BLACKLIST, ALL)", () => {
    it("Whitelist: Koin yang TIDAK ADA di whitelist harus ditolak", async () => {
      const evaluation = evaluateCoinFilter("DOGEUSDT", "WHITELIST", "BTCUSDT,ETHUSDT");
      assert.equal(evaluation.allowed, false);
      assert.match(evaluation.reason, /WHITELIST BLOCKED/);

      const res = await executeTokocryptoSignalOrder(
        { symbol: "DOGEUSDT", side: "LONG", entryPrice: 0.15 },
        { autoExecute: true, dryRun: true, coinFilterMode: "WHITELIST", targetCoins: "BTCUSDT,ETHUSDT" }
      );
      assert.equal(res.success, false);
      assert.match(res.message, /tidak ada di whitelist/i);
    });

    it("Whitelist: Koin yang ADA di whitelist harus diizinkan", async () => {
      const evaluation = evaluateCoinFilter("BTCUSDT", "WHITELIST", "BTCUSDT,ETHUSDT");
      assert.equal(evaluation.allowed, true);

      const res = await executeTokocryptoSignalOrder(
        { symbol: "BTCUSDT", side: "LONG", entryPrice: 65000 },
        { autoExecute: true, dryRun: true, coinFilterMode: "WHITELIST", targetCoins: "BTCUSDT,ETHUSDT" }
      );
      assert.equal(res.success, true);
    });

    it("Blacklist: Koin yang ADA di blacklist harus ditolak", async () => {
      const evaluation = evaluateCoinFilter("LUNAUSDT", "BLACKLIST", "LUNAUSDT,USTCUSDT");
      assert.equal(evaluation.allowed, false);
      assert.match(evaluation.reason, /BLACKLIST BLOCKED/);

      const res = await executeTokocryptoSignalOrder(
        { symbol: "LUNAUSDT", side: "LONG", entryPrice: 0.5 },
        { autoExecute: true, dryRun: true, coinFilterMode: "BLACKLIST", targetCoins: "LUNAUSDT,USTCUSDT" }
      );
      assert.equal(res.success, false);
      assert.match(res.message, /blacklist/i);
    });

    it("Blacklist: Koin yang TIDAK ADA di blacklist harus diizinkan", async () => {
      const evaluation = evaluateCoinFilter("SOLUSDT", "BLACKLIST", "LUNAUSDT,USTCUSDT");
      assert.equal(evaluation.allowed, true);
    });

    it("ALL: Semua koin harus diizinkan tanpa filter", () => {
      const eval1 = evaluateCoinFilter("PEPEUSDT", "ALL", "");
      assert.equal(eval1.allowed, true);
      const eval2 = evaluateCoinFilter("SHIBUSDT", "ALL", "BTCUSDT");
      assert.equal(eval2.allowed, true);
    });
  });

  describe("5. Max Open Positions Protection", () => {
    it("Jika batas maksimal posisi Tokocrypto tercapai, sinyal baru harus dilewati", async () => {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: { targetExchange: "TOKOCRYPTO" },
        create: { id: 1, targetExchange: "TOKOCRYPTO" },
      });
      await prisma.tokocryptoConfig.upsert({
        where: { id: 1 },
        update: { autoExecute: true, dryRun: true, maxOpenPositions: 2, coinFilterMode: "ALL" },
        create: { id: 1, autoExecute: true, dryRun: true, maxOpenPositions: 2, coinFilterMode: "ALL" },
      });

      // Buka posisi ke-1
      await handleIncomingSignal({ symbol: "BTCUSDT", side: "LONG", entryPrice: 60000 });
      // Buka posisi ke-2
      await handleIncomingSignal({ symbol: "ETHUSDT", side: "LONG", entryPrice: 3000 });
      // Coba buka posisi ke-3 (melebihi limit 2)
      await handleIncomingSignal({ symbol: "SOLUSDT", side: "LONG", entryPrice: 150 });

      const trades = await prisma.spotTrade.findMany({ where: { status: "OPEN" } });
      assert.equal(trades.length, 2); // Tetap 2 posisi, posisi ke-3 ditolak!
      const symbols = trades.map((t) => t.symbol);
      assert.ok(symbols.includes("BTC_USDT"));
      assert.ok(symbols.includes("ETH_USDT"));
      assert.ok(!symbols.includes("SOL_USDT"));
    });
  });

  describe("6. Lot Size & Capital Allocation Calculations", () => {
    it("Perhitungan quantity harus presisi dan dibulatkan sesuai stepSize", () => {
      // Saldo $1,000, alokasi 10% ($100), harga $65,000, stepSize 0.00001
      const calc = calculateSpotOrderQuantity({
        balance: 1000,
        riskPct: 10,
        currentPrice: 65000,
        stepSize: 0.00001,
        minNotional: 5,
      });

      assert.equal(calc.isValid, true);
      assert.ok(calc.notional >= 5);
      assert.ok(calc.quantity > 0);
      const decimals = calc.quantity.toString().split(".")[1]?.length || 0;
      assert.equal(decimals <= 5, true);
    });

    it("Order harus ditolak jika nilai alokasi di bawah minNotional dan saldo tidak cukup", () => {
      const calc = calculateSpotOrderQuantity({
        balance: 2,
        riskPct: 50,
        currentPrice: 100,
        stepSize: 0.01,
        minNotional: 5,
      });
      assert.equal(calc.isValid, false);
      assert.match(calc.reason || "", /batas minimum transaksi|alokasi modal/i);
    });

    it("Order harus ditolak jika saldo atau harga bernilai 0", () => {
      const zeroBal = calculateSpotOrderQuantity({
        balance: 0,
        riskPct: 10,
        currentPrice: 100,
        stepSize: 0.01,
        minNotional: 5,
      });
      assert.equal(zeroBal.isValid, false);

      const zeroPrice = calculateSpotOrderQuantity({
        balance: 1000,
        riskPct: 10,
        currentPrice: 0,
        stepSize: 0.01,
        minNotional: 5,
      });
      assert.equal(zeroPrice.isValid, false);
    });
  });

  describe("7. Symbol Normalization & Multiplier Handling", () => {
    it("1000PEPEUSDT harus dinormalisasi menjadi PEPE_USDT untuk Tokocrypto", () => {
      assert.equal(normalizeTokocryptoSymbol("1000PEPEUSDT"), "PEPE_USDT");
      assert.equal(normalizeTokocryptoSymbol("1000SHIBUSDT"), "SHIB_USDT");
      assert.equal(normalizeTokocryptoSymbol("1000FLOKIUSDT"), "FLOKI_USDT");
    });

    it("Simbol dengan separator slash dan dash harus dinormalisasi menjadi underscore", () => {
      assert.equal(normalizeTokocryptoSymbol("NEAR/USDT"), "NEAR_USDT");
      assert.equal(normalizeTokocryptoSymbol("DOT-USDT"), "DOT_USDT");
    });
  });
});
