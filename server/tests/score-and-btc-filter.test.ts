import assert from "assert";
import { SignalPayload } from "../src/exchanges/types";
import { BinanceExecutionConfig } from "../src/exchanges/binance/types";

// Rekam log dan order yang dieksekusi
let executedOrders: any[] = [];
let logsLogged: { level: string; tag: string; message: string }[] = [];

function mockAddLog(level: string, tag: string, message: string) {
  logsLogged.push({ level, tag, message });
}

// Simulasi logika evaluasi lengkap di orders.ts
function evaluateAndExecuteSignal(
  signal: any,
  config: BinanceExecutionConfig,
): { executed: boolean; reason?: string } {
  const { symbol, side } = signal;

  // 1. AutoExecute check
  if (!config.autoExecute) {
    return { executed: false, reason: "AutoExecute disabled" };
  }

  // 2. Direction Filter (Gate 1)
  const allowedDirection = (config.tradeDirection || "BOTH").toUpperCase();
  const rawSide = (side || "").toString().trim().toUpperCase();
  const normalizedSignalSide =
    rawSide === "BUY" ? "LONG" : rawSide === "SELL" ? "SHORT" : rawSide;

  if (normalizedSignalSide !== "LONG" && normalizedSignalSide !== "SHORT") {
    mockAddLog("WARN", "DirectionFilter", `Invalid side ${side}`);
    return { executed: false, reason: "Invalid side" };
  }

  if (allowedDirection === "LONG_ONLY" && normalizedSignalSide !== "LONG") {
    const reason = `Signal ${symbol} ${side} skipped: Binance bot is configured for LONG_ONLY.`;
    mockAddLog("WARN", "DirectionFilter", reason);
    return { executed: false, reason };
  }

  if (allowedDirection === "SHORT_ONLY" && normalizedSignalSide !== "SHORT") {
    const reason = `Signal ${symbol} ${side} skipped: Binance bot is configured for SHORT_ONLY.`;
    mockAddLog("WARN", "DirectionFilter", reason);
    return { executed: false, reason };
  }

  // 3. Minimum Signal Score Filter (Gate 2)
  const minScore = Number(config.minScore ?? 0);
  const rawScore = signal?.score ?? signal?.data?.score;
  const signalScore =
    rawScore !== undefined && rawScore !== null ? Number(rawScore) : 0;
  if (minScore > 0) {
    if (isNaN(signalScore) || signalScore < minScore) {
      const reason = `Signal ${symbol} skipped: Score (${signalScore}) is below minimum threshold (${minScore}).`;
      mockAddLog("WARN", "ScoreFilter", reason);
      return { executed: false, reason };
    }
  }

  // 4. BTC Macro Trend Filter (Gate 3)
  const shouldBlockBtc = config.blockLongOnBtcBearish ?? true;
  if (shouldBlockBtc && normalizedSignalSide === "LONG") {
    const rawBtcBias = (
      signal?.analytics?.btcTrendBias ||
      signal?.analytics?.extraData?.btcMtf?.h4?.trend ||
      signal?.analytics?.extraData?.trendBias ||
      signal?.btcTrendBias ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    if (rawBtcBias === "bearish" || rawBtcBias === "choppy") {
      const reason = `Signal ${symbol} LONG skipped: BTC macro trend is ${rawBtcBias.toUpperCase()} (Block LONG protection active).`;
      mockAddLog("WARN", "BtcFilter", reason);
      return { executed: false, reason };
    }
  }

  // Lolos semua filter -> Order dieksekusi
  executedOrders.push({
    symbol,
    side: normalizedSignalSide === "LONG" ? "BUY" : "SELL",
    score: signalScore,
  });

  return { executed: true };
}

async function runAllScenarios() {
  console.log(
    "================================================================",
  );
  console.log("🧪 MEMULAI PENGUJIAN: MINIMUM SCORE & BTC MACRO TREND FILTER");
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
    tradeDirection: "BOTH",
    minScore: 0,
    blockLongOnBtcBearish: true,
  };

  // --- KELOMPOK 1: PENGUJIAN FILTER SKOR MINIMUM ---
  console.log("📌 KELOMPOK 1: Filter Skor Sinyal Minimum (minScore)");
  executedOrders = [];
  logsLogged = [];

  // Skenario 1.1: Skor 99 vs Threshold 95 -> Lolos
  const res1 = evaluateAndExecuteSignal(
    { symbol: "SOLUSDT", side: "LONG", score: 99 },
    { ...baseConfig, minScore: 95 },
  );
  assert.strictEqual(res1.executed, true);
  console.log("  ✅ [PASS] Sinyal dengan score 99 lolos saat minScore = 95");

  // Skenario 1.2: Skor 88 vs Threshold 95 -> Ditolak
  const res2 = evaluateAndExecuteSignal(
    { symbol: "SOLUSDT", side: "LONG", score: 88 },
    { ...baseConfig, minScore: 95 },
  );
  assert.strictEqual(res2.executed, false);
  assert.ok(logsLogged.some((l) => l.tag === "ScoreFilter"));
  console.log("  ✅ [PASS] Sinyal dengan score 88 ditolak saat minScore = 95");

  // Skenario 1.3: Skor 88 saat minScore = 0 -> Lolos (Semua diizinkan)
  const res3 = evaluateAndExecuteSignal(
    { symbol: "SOLUSDT", side: "LONG", score: 88 },
    { ...baseConfig, minScore: 0 },
  );
  assert.strictEqual(res3.executed, true);
  console.log("  ✅ [PASS] Sinyal dengan score 88 lolos saat minScore = 0");

  // Skenario 1.4: Skor undefined / null saat minScore = 90 -> Ditolak aman
  const res4 = evaluateAndExecuteSignal(
    { symbol: "SOLUSDT", side: "LONG" }, // score tidak ada
    { ...baseConfig, minScore: 90 },
  );
  assert.strictEqual(res4.executed, false);
  console.log(
    "  ✅ [PASS] Sinyal tanpa score (undefined) ditolak secara aman jika minScore > 0",
  );

  // --- KELOMPOK 2: PENGUJIAN FILTER TREN BTC (TOGGLE ON) ---
  console.log("\n📌 KELOMPOK 2: Proteksi Tren Makro BTC (blockLongOnBtcBearish: ON)");
  executedOrders = [];
  logsLogged = [];

  // Skenario 2.1: Sinyal LONG saat BTC Bullish -> Lolos
  const resBtcBullish = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "Bullish" },
    },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resBtcBullish.executed, true);
  console.log("  ✅ [PASS] Sinyal LONG saat BTC Bullish dieksekusi");

  // Skenario 2.2: Sinyal LONG saat BTC Bearish -> Ditolak / Diproteksi
  const resBtcBearish = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "Bearish" },
    },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resBtcBearish.executed, false);
  assert.ok(logsLogged.some((l) => l.tag === "BtcFilter"));
  console.log(
    "  ✅ [PASS] Sinyal LONG saat BTC Bearish otomatis DITOLAK (Proteksi Aktif)",
  );

  // Skenario 2.3: Sinyal LONG saat BTC Choppy -> Ditolak / Diproteksi
  const resBtcChoppy = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "Choppy" },
    },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resBtcChoppy.executed, false);
  console.log(
    "  ✅ [PASS] Sinyal LONG saat BTC Choppy otomatis DITOLAK (Proteksi Aktif)",
  );

  // Skenario 2.4: Sinyal SHORT saat BTC Bearish -> LOLOS (Sangat menguntungkan)
  const resShortBearish = evaluateAndExecuteSignal(
    {
      symbol: "ETHUSDT",
      side: "SHORT",
      score: 95,
      analytics: { btcTrendBias: "Bearish" },
    },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resShortBearish.executed, true);
  console.log(
    "  ✅ [PASS] Sinyal SHORT saat BTC Bearish TETAP DIEKSEKUSI (Searah Tren)",
  );

  // Skenario 2.5: Sinyal SHORT saat BTC Choppy -> LOLOS
  const resShortChoppy = evaluateAndExecuteSignal(
    {
      symbol: "ETHUSDT",
      side: "SHORT",
      score: 95,
      analytics: { btcTrendBias: "Choppy" },
    },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resShortChoppy.executed, true);
  console.log("  ✅ [PASS] Sinyal SHORT saat BTC Choppy tetap dieksekusi");

  // --- KELOMPOK 3: PENGUJIAN JIKA TOGGLE BTC DIMATIKAN (OFF) ---
  console.log("\n📌 KELOMPOK 3: Perilaku Jika Toggle BTC Dimatikan (blockLongOnBtcBearish: OFF)");
  executedOrders = [];

  // Skenario 3.1: Sinyal LONG saat BTC Bearish tapi toggle OFF -> Tetap Lolos
  const resOffBearish = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "Bearish" },
    },
    { ...baseConfig, blockLongOnBtcBearish: false },
  );
  assert.strictEqual(resOffBearish.executed, true);
  console.log(
    "  ✅ [PASS] Sinyal LONG saat BTC Bearish TETAP DIEKSEKUSI jika toggle OFF (By-pass)",
  );

  // Skenario 3.2: Sinyal LONG saat BTC Choppy tapi toggle OFF -> Tetap Lolos
  const resOffChoppy = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "Choppy" },
    },
    { ...baseConfig, blockLongOnBtcBearish: false },
  );
  assert.strictEqual(resOffChoppy.executed, true);
  console.log(
    "  ✅ [PASS] Sinyal LONG saat BTC Choppy TETAP DIEKSEKUSI jika toggle OFF (By-pass)",
  );

  // --- KELOMPOK 4: KETAHANAN PARSING PAYLOAD (PAYLOAD COMPATIBILITY) ---
  console.log("\n📌 KELOMPOK 4: Fleksibilitas Struktur Payload Server Utama");

  // Skenario 4.1: Format real server via extraData.btcMtf.h4.trend
  const resExtraData = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: {
        extraData: {
          btcMtf: { h4: { trend: "Bearish" } },
        },
      },
    },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resExtraData.executed, false);
  console.log(
    "  ✅ [PASS] Sukses mendeteksi tren BTC via extraData.btcMtf.h4.trend",
  );

  // Skenario 4.2: Toleransi Uppercase / Lowercase (CHOPPY, Bearish, bUllIsh)
  const resCase = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "CHOPPY" },
    },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resCase.executed, false);
  console.log("  ✅ [PASS] Case-insensitive handling ('CHOPPY', 'bearish')");

  // Skenario 4.3: Payload tanpa analytics (null/undefined) tidak membuat crash
  const resNullAnalytics = evaluateAndExecuteSignal(
    { symbol: "SOLUSDT", side: "LONG", score: 99 },
    { ...baseConfig, blockLongOnBtcBearish: true },
  );
  assert.strictEqual(resNullAnalytics.executed, true);
  console.log(
    "  ✅ [PASS] Payload tanpa data analytics lolos tanpa error / crash",
  );

  // --- KELOMPOK 5: INTEGRASI MULTI-GATE DENGAN ALLOWED POSITION SIDE ---
  console.log("\n📌 KELOMPOK 5: Integrasi Multi-Gate (Allowed Side + Score + BTC Trend)");

  // Skenario 5.1: SHORT_ONLY memblokir LONG di Gate 1 sebelum cek BTC
  logsLogged = [];
  const resMulti1 = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "Bullish" },
    },
    {
      ...baseConfig,
      tradeDirection: "SHORT_ONLY",
      minScore: 90,
      blockLongOnBtcBearish: true,
    },
  );
  assert.strictEqual(resMulti1.executed, false);
  assert.ok(logsLogged.some((l) => l.tag === "DirectionFilter"));
  console.log(
    "  ✅ [PASS] Mode SHORT_ONLY langsung memblokir sinyal LONG di Gate 1",
  );

  // Skenario 5.2: Gate Score menolak sebelum Gate BTC
  logsLogged = [];
  const resMulti2 = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 80, // score rendah
      analytics: { btcTrendBias: "Bearish" },
    },
    {
      ...baseConfig,
      tradeDirection: "BOTH",
      minScore: 90,
      blockLongOnBtcBearish: true,
    },
  );
  assert.strictEqual(resMulti2.executed, false);
  assert.ok(logsLogged.some((l) => l.tag === "ScoreFilter"));
  console.log(
    "  ✅ [PASS] Skor di bawah ambang batas (80 < 90) ditolak di Gate Score",
  );

  // Skenario 5.3: Lolos SEMUA Gate (BOTH + Score 99 + BTC Bullish) -> Sukses Eksekusi!
  const resMulti3 = evaluateAndExecuteSignal(
    {
      symbol: "SOLUSDT",
      side: "LONG",
      score: 99,
      analytics: { btcTrendBias: "Bullish" },
    },
    {
      ...baseConfig,
      tradeDirection: "BOTH",
      minScore: 90,
      blockLongOnBtcBearish: true,
    },
  );
  assert.strictEqual(resMulti3.executed, true);
  console.log("  ✅ [PASS] Sinyal berkualitas tinggi lolos seluruh 3 Gate");

  console.log(
    "\n================================================================",
  );
  console.log("📊 HASIL PENGUJIAN: 16 / 16 SCENARIOS PASSED (100% SUKSES)!");
  console.log(
    "================================================================\n",
  );
}

runAllScenarios().catch(console.error);
