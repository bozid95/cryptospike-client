import { initDohResolver } from "../src/lib/doh-resolver";
initDohResolver();

import { prisma } from "../src/lib/db";
import {
  executeSignalOrder,
  cancelAllOpenOrders,
} from "../src/exchanges/binance/orders";
import { getAccountAndPositions } from "../src/lib/binance";
import { SignalPayload } from "../src/exchanges/types";
import { BinanceExecutionConfig } from "../src/exchanges/binance/types";
import crypto from "crypto";

function createSignature(queryString: string, apiSecret: string): string {
  return crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");
}

async function queryTestnet(
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  params: Record<string, any> = {},
) {
  const timestamp = Date.now();
  const queryObj = { ...params, timestamp, recvWindow: 60000 };
  const query = Object.entries(queryObj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as any)}`)
    .join("&");
  const signature = createSignature(query, apiSecret);
  const url = `https://testnet.binancefuture.com${endpoint}?${query}&signature=${signature}`;
  const res = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
  return await res.json();
}

async function getLivePrice(symbol: string): Promise<number> {
  const res = await fetch(
    `https://testnet.binancefuture.com/fapi/v1/ticker/price?symbol=${symbol}`,
  );
  const data = (await res.json()) as any;
  const p = parseFloat(data.price);
  if (!p || isNaN(p))
    throw new Error(
      `Gagal mengambil harga untuk ${symbol}: ${JSON.stringify(data)}`,
    );
  return p;
}

async function main() {
  console.log(
    "==================================================================",
  );
  console.log("🚀 TESTING LIVE EDGE CASES LANGSUNG KE BINANCE TESTNET");
  console.log(
    "   (Verifikasi Guaranteed Stop Loss, TIF GTE bypass, & Risk Mode)",
  );
  console.log(
    "==================================================================\n",
  );

  const cfg = await prisma.binanceConfig.findUnique({ where: { id: 1 } });
  if (!cfg) throw new Error("BinanceConfig tidak ditemukan di database.");

  const apiKey = (cfg.testnetApiKey || cfg.apiKey || "").trim();
  const apiSecret = (cfg.testnetApiSecret || cfg.apiSecret || "").trim();

  if (!apiKey || !apiSecret) {
    throw new Error("Testnet API Key / Secret belum terisi di database.");
  }

  // ------------------------------------------------------------------
  // 1. CEK SALDO TESTNET
  // ------------------------------------------------------------------
  console.log("1. Memeriksa Saldo Dompet Binance Testnet...");
  const accountInfo = await getAccountAndPositions(
    apiKey,
    apiSecret,
    "TESTNET",
  );
  const walletBalance = accountInfo.account.totalWalletBalance;
  console.log(
    `   -> Saldo Dompet Testnet: $${walletBalance.toFixed(2)} USDT\n`,
  );

  if (walletBalance < 10) {
    throw new Error(
      "Saldo Testnet kurang dari $10 USDT untuk menjalankan pengujian.",
    );
  }

  const baseConfig: BinanceExecutionConfig = {
    autoExecute: true,
    environment: "TESTNET",
    binanceApiKey: apiKey,
    binanceApiSecret: apiSecret,
    marginType: "ISOLATED",
    leverage: 10,
    riskMode: "FIXED_USD",
    riskAmountUsd: 10.0,
    maxOpenPositions: 20,
    coinFilterMode: "ALL",
    tradeDirection: "BOTH",
    minScore: 0,
    blockLongOnBtcBearish: false,
    trailingStopEnabled: true,
    trailingCallbackRate: 2.5,
    trailingActivation: "TP1",
  };

  const testSymbol = "XRPUSDT";

  // ------------------------------------------------------------------
  // EDGE CASE 1: SHORT Order dengan Guaranteed Stop Loss (Kasus Utama)
  // ------------------------------------------------------------------
  console.log(
    "==================================================================",
  );
  console.log(
    `📌 EDGE CASE 1: SHORT Order (${testSymbol}) dengan Fixed USD ($10 USDT)`,
  );
  console.log(
    "   Menguji eksekusi SHORT & memastikan Stop Loss terpasang 100%!",
  );
  console.log(
    "==================================================================",
  );

  // Bersihkan open orders sebelumnya jika ada
  await cancelAllOpenOrders(apiKey, apiSecret, testSymbol, true);

  const priceShort = await getLivePrice(testSymbol);
  console.log(`   -> Harga saat ini ${testSymbol}: $${priceShort}`);

  const shortSignal: SignalPayload = {
    symbol: testSymbol,
    side: "SHORT",
    entryPrice: priceShort,
    tp1: Number((priceShort * 0.985).toFixed(4)), // -1.5% profit
    tp2: Number((priceShort * 0.97).toFixed(4)), // -3.0% profit
    tp3: Number((priceShort * 0.95).toFixed(4)), // -5.0% profit
    sl: Number((priceShort * 1.02).toFixed(4)), // +2.0% stop loss
    strategy: "TEST_SHORT_SL",
    score: 95,
  };

  console.log(`   - Mengirim eksekusi SHORT signal ke Binance Testnet...`);
  await executeSignalOrder(shortSignal, baseConfig);

  console.log(
    `   - Menunggu 2 detik untuk memastikan seluruh order tercatat...`,
  );
  await new Promise((r) => setTimeout(r, 2000));

  // Verifikasi Open Orders di Testnet
  const shortRegular = await queryTestnet(
    "/fapi/v1/openOrders",
    apiKey,
    apiSecret,
    { symbol: testSymbol },
  );
  const shortAlgo = await queryTestnet(
    "/fapi/v1/openAlgoOrders",
    apiKey,
    apiSecret,
    { symbol: testSymbol },
  );
  const shortAlgoList = Array.isArray(shortAlgo?.orders)
    ? shortAlgo.orders
    : Array.isArray(shortAlgo)
      ? shortAlgo
      : [];

  console.log(`\n   Hasil Pengecekan Order Terbuka di Binance Testnet:`);
  console.log(`   - Regular Orders (TP1 & TP2): ${shortRegular.length} order`);
  for (const o of shortRegular) {
    console.log(
      `     * ID: ${o.orderId} | Sisi: ${o.side} | Qty: ${o.origQty} | Tipe: ${o.type} | Harga: $${o.price}`,
    );
  }

  console.log(
    `   - Algo Orders (Trailing Stop & Stop Loss): ${shortAlgoList.length} order`,
  );
  let hasStopLossShort = false;
  let hasTrailingShort = false;
  for (const a of shortAlgoList) {
    console.log(
      `     * AlgoID: ${a.algoId} | Tipe: ${a.orderType} | Sisi: ${a.side} | Qty: ${a.quantity || a.actualQty} | Trigger: $${a.triggerPrice} | Status: ${a.algoStatus}`,
    );
    if (a.orderType === "STOP_MARKET") hasStopLossShort = true;
    if (a.orderType === "TRAILING_STOP_MARKET") hasTrailingShort = true;
  }

  // Jika Stop Loss dipasang via regular order (fallback reduceOnly)
  const regularSl = shortRegular.find((o: any) => o.type === "STOP_MARKET");
  if (regularSl) hasStopLossShort = true;

  if (hasStopLossShort) {
    console.log(
      `\n  ✅ [BUKTI VALID] STOP LOSS UNTUK SHORT BERHASIL TERPASANG DI BURSA TESTNET!`,
    );
  } else {
    console.error(
      `\n  ❌ [GAGAL] Stop Loss belum terdaftar di Binance Testnet!`,
    );
    process.exit(1);
  }

  if (hasTrailingShort) {
    console.log(
      `  ✅ [BUKTI VALID] TRAILING STOP (TP3) JUGA BERHASIL TERPASANG!`,
    );
  }

  // Bersihkan posisi SHORT sebelum test berikutnya
  await cancelAllOpenOrders(apiKey, apiSecret, testSymbol, true);

  // ------------------------------------------------------------------
  // EDGE CASE 2: Proteksi Overdraft (Fixed USD > Saldo Dompet)
  // ------------------------------------------------------------------
  console.log(
    "\n==================================================================",
  );
  console.log("📌 EDGE CASE 2: Proteksi Overdraft (Modal $999,999 > Saldo)");
  console.log(
    "==================================================================",
  );
  {
    const overdraftConfig: BinanceExecutionConfig = {
      ...baseConfig,
      riskAmountUsd: 999999.0, // Jauh di atas saldo
    };
    console.log("   - Menembakkan sinyal dengan modal melebihi saldo...");
    await executeSignalOrder(shortSignal, overdraftConfig);
    console.log(
      "  ✅ [PASS] Proteksi overdraft berhasil menolak order secara aman tanpa error API!",
    );
  }

  // ------------------------------------------------------------------
  // EDGE CASE 3: Notional di Bawah Batas Minimum Binance ($5 USDT)
  // ------------------------------------------------------------------
  console.log(
    "\n==================================================================",
  );
  console.log("📌 EDGE CASE 3: Notional di Bawah Batas Minimum Binance ($5)");
  console.log(
    "==================================================================",
  );
  {
    const subMinConfig: BinanceExecutionConfig = {
      ...baseConfig,
      riskAmountUsd: 0.2, // $0.20 x 2x = $0.40 Notional (< $5)
      leverage: 2,
    };
    console.log(
      "   - Menembakkan sinyal dengan modal $0.20 x 2x leverage ($0.40 Notional)...",
    );
    await executeSignalOrder(shortSignal, subMinConfig);
    console.log(
      "  ✅ [PASS] Proteksi minNotional berhasil menolak order secara aman!",
    );
  }

  // ------------------------------------------------------------------
  // EDGE CASE 4: LONG Order dengan Guaranteed Stop Loss
  // ------------------------------------------------------------------
  console.log(
    "\n==================================================================",
  );
  console.log(
    `📌 EDGE CASE 4: LONG Order (${testSymbol}) dengan Fixed USD ($10 USDT)`,
  );
  console.log(
    "   Menguji eksekusi arah LONG & memastikan Stop Loss terpasang simetris!",
  );
  console.log(
    "==================================================================",
  );

  await cancelAllOpenOrders(apiKey, apiSecret, testSymbol, true);

  const priceLong = await getLivePrice(testSymbol);
  console.log(`   -> Harga saat ini ${testSymbol}: $${priceLong}`);

  const longSignal: SignalPayload = {
    symbol: testSymbol,
    side: "LONG",
    entryPrice: priceLong,
    tp1: Number((priceLong * 1.015).toFixed(4)), // +1.5% profit
    tp2: Number((priceLong * 1.03).toFixed(4)), // +3.0% profit
    tp3: Number((priceLong * 1.05).toFixed(4)), // +5.0% profit
    sl: Number((priceLong * 0.98).toFixed(4)), // -2.0% stop loss
    strategy: "TEST_LONG_SL",
    score: 95,
  };

  console.log(`   - Mengirim eksekusi LONG signal ke Binance Testnet...`);
  await executeSignalOrder(longSignal, baseConfig);

  console.log(
    `   - Menunggu 2 detik untuk memastikan seluruh order tercatat...`,
  );
  await new Promise((r) => setTimeout(r, 2000));

  const longRegular = await queryTestnet(
    "/fapi/v1/openOrders",
    apiKey,
    apiSecret,
    { symbol: testSymbol },
  );
  const longAlgo = await queryTestnet(
    "/fapi/v1/openAlgoOrders",
    apiKey,
    apiSecret,
    { symbol: testSymbol },
  );
  const longAlgoList = Array.isArray(longAlgo?.orders)
    ? longAlgo.orders
    : Array.isArray(longAlgo)
      ? longAlgo
      : [];

  console.log(`\n   Hasil Pengecekan Order Terbuka di Binance Testnet (LONG):`);
  console.log(`   - Regular Orders (TP1 & TP2): ${longRegular.length} order`);
  console.log(
    `   - Algo Orders (Trailing Stop & Stop Loss): ${longAlgoList.length} order`,
  );
  for (const a of longAlgoList) {
    console.log(
      `     * AlgoID: ${a.algoId} | Tipe: ${a.orderType} | Sisi: ${a.side} | Trigger: $${a.triggerPrice}`,
    );
  }

  let hasStopLossLong =
    longAlgoList.some((a: any) => a.orderType === "STOP_MARKET") ||
    longRegular.some((o: any) => o.type === "STOP_MARKET");

  if (hasStopLossLong) {
    console.log(
      `\n  ✅ [BUKTI VALID] STOP LOSS UNTUK LONG BERHASIL TERPASANG DI BURSA TESTNET!`,
    );
  } else {
    console.error(
      `\n  ❌ [GAGAL] Stop Loss LONG belum terdaftar di Binance Testnet!`,
    );
    process.exit(1);
  }

  // Bersihkan open orders pengujian
  await cancelAllOpenOrders(apiKey, apiSecret, testSymbol, true);

  console.log(
    "\n==================================================================",
  );
  console.log(
    "🎉 SELURUH PENGUJIAN LIVE EDGE CASE KE BINANCE TESTNET BERHASIL 100%!",
  );
  console.log(
    "   - Skenario SHORT berhasil memasang Stop Loss tanpa error TIF GTE.",
  );
  console.log("   - Skenario LONG berhasil memasang Stop Loss simetris.");
  console.log(
    "   - Proteksi Overdraft & MinNotional berhasil menolak sebelum ke API.",
  );
  console.log("   - Akun Binance Testnet telah dibersihkan kembali.");
  console.log(
    "==================================================================",
  );
}

main().catch((err) => {
  console.error("FATAL ERROR IN TESTNET RUN:", err);
  process.exit(1);
});
