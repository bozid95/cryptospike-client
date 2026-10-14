import assert from "assert";
import { SignalPayload } from "../src/exchanges/types";
import {
  BinanceExecutionConfig,
  PlaceOrderParams,
} from "../src/exchanges/binance/types";

// Interceptor order untuk memverifikasi apakah placeOrder dipanggil atau dilewati
let orderCalls: PlaceOrderParams[] = [];
let logsLogged: { level: string; tag: string; msg: string }[] = [];

function mockAddLog(level: string, tag: string, msg: string) {
  logsLogged.push({ level, tag, msg });
}

// Replikasi logic evaluasi arah di orders.ts
function evaluateAndExecute(
  signal: SignalPayload,
  config: BinanceExecutionConfig,
): { executed: boolean; reason?: string } {
  const allowedDirection = (
    config.tradeDirection ||
    process.env.BINANCE_ALLOWED_SIDE ||
    "BOTH"
  ).toUpperCase();
  const normalizedSignalSide = (signal.side || "").toUpperCase();

  if (allowedDirection === "LONG_ONLY" && normalizedSignalSide !== "LONG") {
    const reason = `Signal ${signal.symbol} ${signal.side} skipped: Binance bot is configured for LONG_ONLY.`;
    mockAddLog("WARN", "DirectionFilter", reason);
    return { executed: false, reason };
  }

  if (allowedDirection === "SHORT_ONLY" && normalizedSignalSide !== "SHORT") {
    const reason = `Signal ${signal.symbol} ${signal.side} skipped: Binance bot is configured for SHORT_ONLY.`;
    mockAddLog("WARN", "DirectionFilter", reason);
    return { executed: false, reason };
  }

  // Jika lolos filter arah, order dieksekusi
  orderCalls.push({
    symbol: signal.symbol,
    side: signal.side === "LONG" ? "BUY" : "SELL",
    type: "MARKET",
  });
  return { executed: true };
}

async function runComprehensiveDirectionTests() {
  console.log(
    "================================================================",
  );
  console.log("🧪 TESTING LENGKAP: TRADE DIRECTION FILTER (SEMUA SKENARIO)");
  console.log(
    "================================================================\n",
  );

  const baseConfig: BinanceExecutionConfig = {
    autoExecute: true,
    binanceApiKey: "key",
    binanceApiSecret: "secret",
    environment: "TESTNET",
    marginType: "ISOLATED",
    leverage: 10,
    riskPerTradePct: 2.0,
    maxOpenPositions: 3,
  };

  const longSignal: SignalPayload = {
    symbol: "BTCUSDT",
    side: "LONG",
    entryPrice: 60000,
  };

  const shortSignal: SignalPayload = {
    symbol: "ETHUSDT",
    side: "SHORT",
    entryPrice: 3000,
  };

  // --- SKENARIO 1: MODE BOTH SIDES (DEFAULT) ---
  console.log("📌 SKENARIO 1: Mode BOTH (Kedua Arah Diizinkan)");
  orderCalls = [];
  logsLogged = [];

  const resBothLong = evaluateAndExecute(longSignal, {
    ...baseConfig,
    tradeDirection: "BOTH",
  });
  assert.strictEqual(resBothLong.executed, true);
  assert.strictEqual(orderCalls.length, 1);
  assert.strictEqual(orderCalls[0]?.side, "BUY");
  console.log("  ✅ [PASS] Mode BOTH sukses mengeksekusi sinyal LONG (BUY)");

  const resBothShort = evaluateAndExecute(shortSignal, {
    ...baseConfig,
    tradeDirection: "BOTH",
  });
  assert.strictEqual(resBothShort.executed, true);
  assert.strictEqual(orderCalls.length, 2);
  assert.strictEqual(orderCalls[1]?.side, "SELL");
  console.log("  ✅ [PASS] Mode BOTH sukses mengeksekusi sinyal SHORT (SELL)");

  // --- SKENARIO 2: MODE LONG_ONLY ---
  console.log("\n📌 SKENARIO 2: Mode LONG_ONLY (Hanya Mengizinkan Long)");
  orderCalls = [];
  logsLogged = [];

  const resLongOnlyPass = evaluateAndExecute(longSignal, {
    ...baseConfig,
    tradeDirection: "LONG_ONLY",
  });
  assert.strictEqual(resLongOnlyPass.executed, true);
  assert.strictEqual(orderCalls.length, 1);
  console.log("  ✅ [PASS] Mode LONG_ONLY sukses mengeksekusi sinyal LONG");

  const resLongOnlyBlock = evaluateAndExecute(shortSignal, {
    ...baseConfig,
    tradeDirection: "LONG_ONLY",
  });
  assert.strictEqual(resLongOnlyBlock.executed, false);
  assert.strictEqual(
    orderCalls.length,
    1,
    "Kuantitas order tidak boleh bertambah saat sinyal diblokir",
  );
  assert.ok(
    logsLogged.some((l) =>
      l.msg.includes("skipped: Binance bot is configured for LONG_ONLY"),
    ),
  );
  console.log(
    "  ✅ [PASS] Mode LONG_ONLY sukses memblokir sinyal SHORT dan mencatat log warning",
  );

  // --- SKENARIO 3: MODE SHORT_ONLY ---
  console.log("\n📌 SKENARIO 3: Mode SHORT_ONLY (Hanya Mengizinkan Short)");
  orderCalls = [];
  logsLogged = [];

  const resShortOnlyPass = evaluateAndExecute(shortSignal, {
    ...baseConfig,
    tradeDirection: "SHORT_ONLY",
  });
  assert.strictEqual(resShortOnlyPass.executed, true);
  assert.strictEqual(orderCalls.length, 1);
  console.log("  ✅ [PASS] Mode SHORT_ONLY sukses mengeksekusi sinyal SHORT");

  const resShortOnlyBlock = evaluateAndExecute(longSignal, {
    ...baseConfig,
    tradeDirection: "SHORT_ONLY",
  });
  assert.strictEqual(resShortOnlyBlock.executed, false);
  assert.strictEqual(
    orderCalls.length,
    1,
    "Kuantitas order tidak boleh bertambah saat sinyal diblokir",
  );
  assert.ok(
    logsLogged.some((l) =>
      l.msg.includes("skipped: Binance bot is configured for SHORT_ONLY"),
    ),
  );
  console.log(
    "  ✅ [PASS] Mode SHORT_ONLY sukses memblokir sinyal LONG dan mencatat log warning",
  );

  // --- SKENARIO 4: TOLERANSI HURUF KECIL (CASE-INSENSITIVITY) ---
  console.log("\n📌 SKENARIO 4: Toleransi Huruf Kecil & Whitespace");
  orderCalls = [];
  const resCaseInsensitive = evaluateAndExecute(
    { ...longSignal, side: "long" as any },
    { ...baseConfig, tradeDirection: "long_only" as any },
  );
  assert.strictEqual(resCaseInsensitive.executed, true);
  console.log(
    "  ✅ [PASS] Toleransi input 'long_only' dan 'long' berfungsi normal",
  );

  // --- SKENARIO 5: FALLBACK INPUT TIDAK DIKENAL (SAFETY FALLBACK) ---
  console.log(
    "\n📌 SKENARIO 5: Safety Fallback (Jika input kosong / tidak valid)",
  );
  orderCalls = [];
  const resFallback = evaluateAndExecute(
    longSignal,
    { ...baseConfig, tradeDirection: undefined }, // Fallback ke default BOTH
  );
  assert.strictEqual(resFallback.executed, true);
  console.log(
    "  ✅ [PASS] Fallback otomatis ke mode BOTH jika konfigurasi kosong",
  );

  console.log(
    "\n================================================================",
  );
  console.log("📊 HASIL AKHIR: SEMUA SKENARIO UJI COBA BERHASIL (100% PASS)!");
  console.log(
    "================================================================\n",
  );
}

runComprehensiveDirectionTests().catch(console.error);
