import { initDohResolver } from "../src/lib/doh-resolver";
initDohResolver();

import { prisma } from "../src/lib/db";
import { executeSignalOrder } from "../src/exchanges/binance/orders";
import { getAccountAndPositions } from "../src/lib/binance";
import { SignalPayload } from "../src/exchanges/types";
import { BinanceExecutionConfig } from "../src/exchanges/binance/types";

async function runDualTestOrder() {
  console.log("==========================================================");
  console.log("⚡ MEMULAI EKSEKUSI SIMULTAN: TESTNET & LIVE (DUAL RUNNER)");
  console.log("==========================================================");

  const binanceConfig = await prisma.binanceConfig.findUnique({
    where: { id: 1 },
  });
  if (!binanceConfig) {
    throw new Error("BinanceConfig tidak ditemukan di database.");
  }

  const testnetKey = binanceConfig.testnetApiKey || binanceConfig.apiKey;
  const testnetSecret =
    binanceConfig.testnetApiSecret || binanceConfig.apiSecret;
  const liveKey = binanceConfig.liveApiKey || binanceConfig.apiKey;
  const liveSecret = binanceConfig.liveApiSecret || binanceConfig.apiSecret;

  if (!liveKey || !liveSecret) {
    throw new Error("Live API Key & Secret belum terisi.");
  }
  if (!testnetKey || !testnetSecret) {
    throw new Error("Testnet API Key & Secret belum terisi.");
  }

  console.log("1. Mengambil harga live SOLUSDT saat ini...");
  const priceRes = await fetch(
    "https://fapi.binance.com/fapi/v1/ticker/price?symbol=SOLUSDT",
  );
  const priceData = (await priceRes.json()) as any;
  const currentPrice = parseFloat(priceData.price);

  if (!currentPrice || isNaN(currentPrice)) {
    throw new Error("Gagal mengambil harga live SOLUSDT.");
  }
  console.log(`   -> Harga Live SOLUSDT: $${currentPrice.toFixed(4)}`);

  const tp1Price = Number((currentPrice * 0.98).toFixed(2)); // -2% (profit SHORT)
  const tp2Price = Number((currentPrice * 0.96).toFixed(2)); // -4%
  const tp3Price = Number((currentPrice * 0.935).toFixed(2)); // -6.5%
  const slPrice = Number((currentPrice * 1.02).toFixed(2)); // +2% (SL SHORT)

  const signalPayload: SignalPayload = {
    symbol: "SOLUSDT",
    side: "SHORT",
    entryPrice: currentPrice,
    tp1: tp1Price,
    tp2: tp2Price,
    tp3: tp3Price,
    sl: slPrice,
    strategy: "DUAL_RUNNER_PARALLEL_TEST",
    score: 95,
    analytics: {
      btcTrendBias: "bearish",
    },
  };

  // --- JALUR A: TESTNET CONFIG ---
  const testnetConfig: BinanceExecutionConfig = {
    autoExecute: true,
    environment: "TESTNET",
    binanceApiKey: testnetKey.trim(),
    binanceApiSecret: testnetSecret.trim(),
    marginType: (binanceConfig.testnetMarginType as any) || "CROSSED",
    leverage: binanceConfig.testnetLeverage || 10,
    riskPerTradePct: 1.0,
    maxOpenPositions: 10,
    coinFilterMode: binanceConfig.testnetCoinFilterMode || "ALL",
    targetCoins: binanceConfig.testnetTargetCoins || "",
    tradeDirection: binanceConfig.testnetTradeDirection || "BOTH",
    minScore: 0,
    blockLongOnBtcBearish: false,
    trailingStopEnabled: true,
    trailingCallbackRate: 2.5,
  };

  // --- JALUR B: LIVE CONFIG ---
  const liveConfig: BinanceExecutionConfig = {
    autoExecute: true,
    environment: "LIVE",
    binanceApiKey: liveKey.trim(),
    binanceApiSecret: liveSecret.trim(),
    marginType: (binanceConfig.liveMarginType as any) || "CROSSED",
    leverage: binanceConfig.liveLeverage || 10,
    riskPerTradePct: 6.2, // ~6.2% dari $10.22 = $0.63 margin * 10x = $6.33 notional
    maxOpenPositions: binanceConfig.liveMaxOpenPositions || 1,
    coinFilterMode: binanceConfig.liveCoinFilterMode || "ALL",
    targetCoins: binanceConfig.liveTargetCoins || "SOLUSDT",
    tradeDirection: binanceConfig.liveTradeDirection || "SHORT_ONLY",
    minScore: 0,
    blockLongOnBtcBearish: false,
    trailingStopEnabled: true,
    trailingCallbackRate: 2.5,
  };

  console.log("\n2. Eksekusi Paralel (Jalur A: Testnet & Jalur B: Live)...");
  const [testnetResult, liveResult] = await Promise.allSettled([
    executeSignalOrder(signalPayload, testnetConfig),
    executeSignalOrder(signalPayload, liveConfig),
  ]);

  if (testnetResult.status === "fulfilled") {
    console.log("   ✅ [JALUR A: TESTNET] Sinyal berhasil diproses.");
  } else {
    console.error("   ❌ [JALUR A: TESTNET] Gagal:", testnetResult.reason);
  }

  if (liveResult.status === "fulfilled") {
    console.log("   ✅ [JALUR B: LIVE] Sinyal berhasil diproses.");
  } else {
    console.error("   ❌ [JALUR B: LIVE] Gagal:", liveResult.reason);
  }

  console.log("\n3. Memverifikasi status akun & posisi kedua lingkungan...");
  await new Promise((r) => setTimeout(r, 2000));

  const [tAcc, lAcc] = await Promise.all([
    getAccountAndPositions(testnetKey.trim(), testnetSecret.trim(), "TESTNET"),
    getAccountAndPositions(liveKey.trim(), liveSecret.trim(), "LIVE"),
  ]);

  console.log("\n--- HASIL VERIFIKASI TESTNET ---");
  console.log(
    `Saldo Dompet : $${tAcc.account.totalWalletBalance.toFixed(2)} USDT`,
  );
  const tPos = tAcc.positions.find((p) => p.symbol === "SOLUSDT");
  if (tPos) {
    console.log(
      `Posisi SOLUSDT: ${tPos.side} ${tPos.positionAmt} SOL @ $${tPos.entryPrice} (Margin: ~$${(tPos.isolatedMargin || 0).toFixed(2)}, Notional: ~$${(tPos.notionalValue || 0).toFixed(2)})`,
    );
  } else {
    console.log("Posisi SOLUSDT tidak ditemukan di Testnet.");
  }

  console.log("\n--- HASIL VERIFIKASI LIVE (REAL FUNDS) ---");
  console.log(
    `Saldo Dompet : $${lAcc.account.totalWalletBalance.toFixed(2)} USDT`,
  );
  console.log(
    `Saldo Bebas  : $${(lAcc.account.availableBalance || 0).toFixed(2)} USDT`,
  );
  const lPos = lAcc.positions.find((p) => p.symbol === "SOLUSDT");
  if (lPos) {
    console.log(
      `Posisi SOLUSDT: ${lPos.side} ${lPos.positionAmt} SOL @ $${lPos.entryPrice}`,
    );
    console.log(`Notional Value: $${(lPos.notionalValue || 0).toFixed(2)} USDT`);
    console.log(`Leverage      : ${lPos.leverage}x`);
    console.log(`Unrealized PnL: $${lPos.unRealizedProfit.toFixed(4)} USDT`);
    console.log(
      `Liq Price     : ${lPos.liquidationPrice > 0 ? lPos.liquidationPrice : "Safe / No Liq"}`,
    );
  } else {
    console.log("Posisi SOLUSDT belum tercatat atau ditolak bursa.");
  }

  console.log("\n==========================================================");
  console.log("🏁 PENGUJIAN DUAL RUNNER SELESAI");
  console.log("==========================================================");
}

runDualTestOrder().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
