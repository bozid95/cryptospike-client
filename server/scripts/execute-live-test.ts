import { initDohResolver } from "../src/lib/doh-resolver";
initDohResolver();

import { prisma } from "../src/lib/db";
import { executeSignalOrder } from "../src/exchanges/binance/orders";
import { getAccountAndPositions } from "../src/lib/binance";
import { SignalPayload } from "../src/exchanges/types";
import { BinanceExecutionConfig } from "../src/exchanges/binance/types";

async function runLiveTestOrder() {
  console.log("==========================================================");
  console.log("🚀 MEMULAI EKSEKUSI ORDER LIVE REAL FUNDS: SOLUSDT SHORT");
  console.log("==========================================================");

  // 1. Ambil config live dari database lokal
  const binanceConfig = await prisma.binanceConfig.findUnique({
    where: { id: 1 },
  });
  if (!binanceConfig) {
    throw new Error("BinanceConfig tidak ditemukan di database.");
  }

  const apiKey = binanceConfig.liveApiKey || binanceConfig.apiKey;
  const apiSecret = binanceConfig.liveApiSecret || binanceConfig.apiSecret;

  if (!apiKey || !apiSecret) {
    throw new Error("Live API Key & Secret belum terisi di database.");
  }

  console.log("1. Mengambil harga pasar SOLUSDT saat ini di Binance Live...");
  const priceRes = await fetch(
    "https://fapi.binance.com/fapi/v1/ticker/price?symbol=SOLUSDT",
  );
  const priceData = (await priceRes.json()) as any;
  const currentPrice = parseFloat(priceData.price);

  if (!currentPrice || isNaN(currentPrice)) {
    throw new Error("Gagal mengambil harga live SOLUSDT.");
  }
  console.log(`   -> Harga Live SOLUSDT saat ini: $${currentPrice.toFixed(4)}`);

  // Target TP dan SL yang aman
  const tp1Price = Number((currentPrice * 0.98).toFixed(2)); // -2% (profit untuk SHORT)
  const tp2Price = Number((currentPrice * 0.96).toFixed(2)); // -4%
  const tp3Price = Number((currentPrice * 0.935).toFixed(2)); // -6.5%
  const slPrice = Number((currentPrice * 1.02).toFixed(2)); // +2% (stop loss untuk SHORT)

  console.log(`2. Parameter Order yang disiapkan:`);
  console.log(`   - Simbol: SOLUSDT`);
  console.log(`   - Arah: SHORT`);
  console.log(`   - Entry Market: ~$${currentPrice.toFixed(2)}`);
  console.log(`   - TP1 (50%): $${tp1Price}`);
  console.log(`   - TP2 (30%): $${tp2Price}`);
  console.log(`   - TP3 Trailing (20%): Callback 2.5%, Aktivasi $${tp1Price}`);
  console.log(`   - Hard Stop Loss: $${slPrice}`);

  const liveSignalPayload: SignalPayload = {
    symbol: "SOLUSDT",
    side: "SHORT",
    entryPrice: currentPrice,
    tp1: tp1Price,
    tp2: tp2Price,
    tp3: tp3Price,
    sl: slPrice,
    strategy: "LIVE_PRODUCTION_TEST",
    score: 95,
    analytics: {
      btcTrendBias: "bearish",
    },
  };

  const executionConfig: BinanceExecutionConfig = {
    autoExecute: true,
    environment: "LIVE",
    binanceApiKey: apiKey.trim(),
    binanceApiSecret: apiSecret.trim(),
    marginType:
      (binanceConfig.liveMarginType as "ISOLATED" | "CROSSED") || "CROSSED",
    leverage: binanceConfig.liveLeverage || 10,
    riskPerTradePct: 6.2, // ~6.2% dari $10.22 = $0.63 margin * 10x = $6.33 notional (> $5 minNotional Binance)
    maxOpenPositions: binanceConfig.liveMaxOpenPositions || 1,
    coinFilterMode: binanceConfig.liveCoinFilterMode || "ALL",
    targetCoins: binanceConfig.liveTargetCoins || "SOLUSDT",
    tradeDirection: binanceConfig.liveTradeDirection || "SHORT_ONLY",
    minScore: 0,
    blockLongOnBtcBearish: false,
    trailingStopEnabled: true,
    trailingCallbackRate: 2.5,
  };

  console.log(
    "3. Menembakkan eksekusi via executeSignalOrder() ke Binance Live...",
  );
  await executeSignalOrder(liveSignalPayload, executionConfig);

  console.log("\n4. Memverifikasi status posisi di akun Binance Live Anda...");
  // Tunggu 2 detik agar bursa memproses
  await new Promise((r) => setTimeout(r, 2000));

  const check = await getAccountAndPositions(
    apiKey.trim(),
    apiSecret.trim(),
    "LIVE",
  );
  console.log(
    `   -> Total Saldo Dompet: $${check.account.totalWalletBalance.toFixed(2)} USDT`,
  );
  console.log(
    `   -> Saldo Tersedia: $${(check.account.availableBalance || 0).toFixed(2)} USDT`,
  );
  console.log(`   -> Jumlah Posisi Aktif: ${check.positions.length}`);

  if (check.positions.length > 0) {
    for (const pos of check.positions) {
      console.log(`\n🎉 [POSISI AKTIF TERVERIFIKASI DI BINANCE LIVE]`);
      console.log(`   Simbol          : ${pos.symbol}`);
      console.log(`   Arah            : ${pos.side}`);
      console.log(
        `   Kuantitas       : ${pos.positionAmt} SOL (~$${(pos.notionalValue || 0).toFixed(2)} USDT)`,
      );
      console.log(`   Harga Entry     : $${pos.entryPrice}`);
      console.log(`   Harga Mark      : $${pos.markPrice}`);
      console.log(`   Leverage        : ${pos.leverage}x`);
      console.log(
        `   Unrealized PnL  : $${(pos.unRealizedProfit || 0).toFixed(4)} USDT (${(pos.roiPct || 0).toFixed(2)}%)`,
      );
      console.log(
        `   Harga Likuidasi : $${pos.liquidationPrice > 0 ? pos.liquidationPrice : "Safe / No Liq"}`,
      );
    }
  } else {
    console.log("⚠️ Catatan: Posisi tidak terdaftar atau telah tertutup.");
  }

  console.log("\n==========================================================");
  console.log("✅ PENGUJIAN ORDER LIVE SELESAI");
  console.log("==========================================================");
}

runLiveTestOrder().catch((err) => {
  console.error("❌ EKSEKUSI GAGAL:", err);
  process.exit(1);
});
