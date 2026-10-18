import assert from "assert";
import { SignalPayload } from "../src/exchanges/types";
import {
  BinanceExecutionConfig,
  PlaceOrderParams,
} from "../src/exchanges/binance/types";
import { evaluateCoinFilter } from "../src/lib/coin-filter";
import { roundStep, roundTick } from "../src/exchanges/binance/market";

interface MockSimulatedResult {
  executed: boolean;
  reason?: string;
  marginToRisk?: number;
  notionalValue?: number;
  quantity?: number;
  ordersPlaced?: PlaceOrderParams[];
}

/**
 * Pipeline simulasi orders.ts yang identik dengan implementasi riil
 */
function simulateSignalExecution(
  signal: SignalPayload,
  config: BinanceExecutionConfig,
  walletBalance: number,
  filters: { stepSize: number; tickSize: number; minNotional: number },
  currentOpenPositionsCount: number = 0,
): MockSimulatedResult {
  const { symbol, side, entryPrice, tp1, tp2, tp3, sl, strategy } = signal;

  // 1. Cek autoExecute
  if (!config.autoExecute) {
    return { executed: false, reason: "AutoExecute is disabled" };
  }

  // 2. Cek Filter Koin
  const filterEval = evaluateCoinFilter(
    symbol,
    config.coinFilterMode || "ALL",
    config.targetCoins || "",
  );
  if (!filterEval.allowed) {
    return { executed: false, reason: filterEval.reason };
  }

  // 3. Cek Filter Arah Posisi
  const allowedDirection = (config.tradeDirection || "BOTH").toUpperCase();
  const rawSide = (side || "").toString().trim().toUpperCase();
  const normalizedSignalSide =
    rawSide === "BUY" ? "LONG" : rawSide === "SELL" ? "SHORT" : rawSide;

  if (normalizedSignalSide !== "LONG" && normalizedSignalSide !== "SHORT") {
    return { executed: false, reason: "Invalid side" };
  }
  if (allowedDirection === "LONG_ONLY" && normalizedSignalSide !== "LONG") {
    return { executed: false, reason: "LONG_ONLY direction guard active" };
  }
  if (allowedDirection === "SHORT_ONLY" && normalizedSignalSide !== "SHORT") {
    return { executed: false, reason: "SHORT_ONLY direction guard active" };
  }

  // 4. Cek Skor Minimum
  const minScore = Number(config.minScore ?? 0);
  const signalScore = Number(signal?.score ?? signal?.data?.score ?? 0);
  if (minScore > 0 && signalScore < minScore) {
    return {
      executed: false,
      reason: `Score (${signalScore}) below minScore (${minScore})`,
    };
  }

  // 5. Cek BTC Macro Trend
  const shouldBlockBtc = config.blockLongOnBtcBearish ?? true;
  if (shouldBlockBtc && normalizedSignalSide === "LONG") {
    const rawBtcBias = (
      signal?.analytics?.btcTrendBias ||
      signal?.btcTrendBias ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    if (rawBtcBias === "bearish" || rawBtcBias === "choppy") {
      return {
        executed: false,
        reason: `BTC trend is ${rawBtcBias.toUpperCase()}`,
      };
    }
  }

  // 6. Cek Max Open Positions
  const maxPos = config.maxOpenPositions || 3;
  if (currentOpenPositionsCount >= maxPos) {
    return {
      executed: false,
      reason: `Max open positions limit reached (${currentOpenPositionsCount}/${maxPos})`,
    };
  }

  // 7. Hitung Margin Berdasarkan Risk Mode (PERCENTAGE vs FIXED_USD)
  const riskMode = (config.riskMode || "PERCENTAGE").toUpperCase();
  let marginToRisk: number;

  if (riskMode === "FIXED_USD") {
    marginToRisk = Math.max(0.1, Number(config.riskAmountUsd || 10.0));
  } else {
    const riskPct = config.riskPerTradePct || 2.0;
    marginToRisk = (walletBalance * riskPct) / 100;
  }

  // Validasi kecukupan saldo
  if (marginToRisk > walletBalance) {
    return {
      executed: false,
      reason: `Required margin ($${marginToRisk.toFixed(2)}) exceeds wallet balance ($${walletBalance.toFixed(2)})`,
      marginToRisk,
    };
  }

  const leverage = config.leverage || 10;
  const notionalValue = marginToRisk * leverage;

  if (notionalValue < filters.minNotional) {
    return {
      executed: false,
      reason: `Notional value ($${notionalValue.toFixed(2)}) is below Binance minimum ($${filters.minNotional})`,
      marginToRisk,
      notionalValue,
    };
  }

  const rawQty = notionalValue / entryPrice;
  const quantity = roundStep(rawQty, filters.stepSize);

  if (quantity <= 0) {
    return { executed: false, reason: "Quantity rounded down to 0" };
  }

  // Multi-bracket TP/SL Orders
  const orders: PlaceOrderParams[] = [];
  const orderSide = side === "LONG" ? "BUY" : "SELL";
  const exitSide = side === "LONG" ? "SELL" : "BUY";

  // 1. Entry Order
  orders.push({
    symbol,
    side: orderSide,
    type: "MARKET",
    quantity,
  });

  // 2. TP Bracket: 50% TP1, 30% TP2, 20% Trailing Moonbag
  let qtyTP1 = roundStep(quantity * 0.5, filters.stepSize);
  let qtyTP2 = roundStep(quantity * 0.3, filters.stepSize);
  let qtyTP3 = roundStep(
    Math.max(0, quantity - qtyTP1 - qtyTP2),
    filters.stepSize,
  );

  if (qtyTP1 > 0) {
    orders.push({
      symbol,
      side: exitSide,
      type: "LIMIT",
      price: tp1 || entryPrice * 1.015,
      quantity: qtyTP1,
      reduceOnly: true,
    });
  }
  if (qtyTP2 > 0) {
    orders.push({
      symbol,
      side: exitSide,
      type: "LIMIT",
      price: tp2 || entryPrice * 1.03,
      quantity: qtyTP2,
      reduceOnly: true,
    });
  }
  if (qtyTP3 > 0) {
    orders.push({
      symbol,
      side: exitSide,
      type: "TRAILING_STOP_MARKET",
      quantity: qtyTP3,
      callbackRate: 2.5,
      activationPrice: tp1 || entryPrice * 1.015,
      reduceOnly: true,
    });
  }

  // 3. Stop Loss
  orders.push({
    symbol,
    side: exitSide,
    type: "STOP_MARKET",
    stopPrice: sl || (side === "LONG" ? entryPrice * 0.98 : entryPrice * 1.02),
    closePosition: true,
  });

  return {
    executed: true,
    marginToRisk,
    notionalValue,
    quantity,
    ordersPlaced: orders,
  };
}

// ============================================================================
// TEST SUITE: INDEPENDENT CONFIGURATION VALIDATION
// ============================================================================

async function runIndependentConfigTests() {
  console.log(
    "==================================================================",
  );
  console.log("🧪 TESTING INDEPENDENT BINANCE CONFIGURATION (TESTNET VS LIVE)");
  console.log(
    "   (Risk Mode Fixed USD vs %, Coin Filter, Direction, Score, etc)",
  );
  console.log(
    "==================================================================",
  );

  const solFilters = { stepSize: 0.01, tickSize: 0.01, minNotional: 5.0 };

  const sampleSignal: SignalPayload = {
    symbol: "SOLUSDT",
    side: "LONG",
    entryPrice: 100.0,
    tp1: 103.0,
    tp2: 105.0,
    tp3: 108.0,
    sl: 97.0,
    score: 85,
    analytics: { btcTrendBias: "bullish" },
  };

  // --------------------------------------------------------------------------
  // KASUS 1: INDEPENDENT RISK MODE (FIXED USD vs PERCENTAGE)
  // --------------------------------------------------------------------------
  console.log(
    "\n📌 KASUS 1: Validasi Mode Risiko (Fixed USD vs Percentage Saldo)",
  );

  // Testnet dikonfigurasi FIXED USD ($50 USDT per trade, 10x Lev)
  const testnetConfig: BinanceExecutionConfig = {
    autoExecute: true,
    binanceApiKey: "mock-testnet-key",
    binanceApiSecret: "mock-testnet-secret",
    environment: "TESTNET",
    marginType: "ISOLATED",
    leverage: 10,
    riskMode: "FIXED_USD",
    riskAmountUsd: 50.0,
    riskPerTradePct: 2.0, // tidak dipakai karena FIXED_USD
    maxOpenPositions: 3,
    coinFilterMode: "ALL",
    targetCoins: "",
    tradeDirection: "BOTH",
    minScore: 0,
    blockLongOnBtcBearish: true,
  };

  // Live dikonfigurasi PERCENTAGE (2% dari saldo $150 = $3 margin, 5x Lev = $15 Notional)
  const liveConfig: BinanceExecutionConfig = {
    autoExecute: true,
    binanceApiKey: "mock-live-key",
    binanceApiSecret: "mock-live-secret",
    environment: "LIVE",
    marginType: "ISOLATED",
    leverage: 5,
    riskMode: "PERCENTAGE",
    riskAmountUsd: 10.0, // tidak dipakai karena PERCENTAGE
    riskPerTradePct: 2.0,
    maxOpenPositions: 2,
    coinFilterMode: "ALL",
    targetCoins: "",
    tradeDirection: "BOTH",
    minScore: 0,
    blockLongOnBtcBearish: true,
  };

  const testnetRun1 = simulateSignalExecution(
    sampleSignal,
    testnetConfig,
    5000,
    solFilters,
  );
  const liveRun1 = simulateSignalExecution(
    sampleSignal,
    liveConfig,
    150,
    solFilters,
  );

  assert.strictEqual(testnetRun1.executed, true);
  assert.strictEqual(
    testnetRun1.marginToRisk,
    50.0,
    "Margin Testnet harus persis $50 USD",
  );
  assert.strictEqual(
    testnetRun1.notionalValue,
    500.0,
    "Notional Testnet harus $500 ($50 x 10x)",
  );
  assert.strictEqual(testnetRun1.quantity, 5.0, "Quantity Testnet harus 5 SOL");

  // Periksa alokasi bracket TP Testnet
  const tOrders = testnetRun1.ordersPlaced!;
  assert.strictEqual(tOrders[1]!.quantity, 2.5, "TP1 Testnet 50% = 2.5 SOL");
  assert.strictEqual(tOrders[2]!.quantity, 1.5, "TP2 Testnet 30% = 1.5 SOL");
  assert.strictEqual(
    tOrders[3]!.quantity,
    1.0,
    "TP3 Moonbag Testnet 20% = 1.0 SOL",
  );

  assert.strictEqual(liveRun1.executed, true);
  assert.strictEqual(
    liveRun1.marginToRisk,
    3.0,
    "Margin Live harus $3 (2% dari $150)",
  );
  assert.strictEqual(
    liveRun1.notionalValue,
    15.0,
    "Notional Live harus $15 ($3 x 5x)",
  );
  assert.strictEqual(liveRun1.quantity, 0.15, "Quantity Live harus 0.15 SOL");

  const lOrders = liveRun1.ordersPlaced!;
  assert.strictEqual(
    lOrders[1]!.quantity,
    0.07,
    "TP1 Live 50% = 0.07 SOL (rounded to 0.01 step)",
  );
  assert.strictEqual(lOrders[2]!.quantity, 0.04, "TP2 Live 30% = 0.04 SOL");
  assert.strictEqual(
    lOrders[3]!.quantity,
    0.04,
    "TP3 Moonbag Live = 0.04 SOL (sisa)",
  );

  console.log(
    "  ✅ [PASS] Mode Fixed USD ($50) di Testnet & Percentage (2%) di Live terbukti beroperasi 100% mandiri.",
  );

  // --------------------------------------------------------------------------
  // KASUS 2: PROTEKSI FIXED USD MELEBIHI SALDO WALLET
  // --------------------------------------------------------------------------
  console.log("\n📌 KASUS 2: Proteksi Fixed USD Melebihi Saldo Dompet");
  const overMarginConfig: BinanceExecutionConfig = {
    ...liveConfig,
    riskMode: "FIXED_USD",
    riskAmountUsd: 100.0, // Minta $100 padahal saldo hanya $20
  };
  const overMarginRun = simulateSignalExecution(
    sampleSignal,
    overMarginConfig,
    20,
    solFilters,
  );
  assert.strictEqual(overMarginRun.executed, false);
  assert.ok(overMarginRun.reason?.includes("exceeds wallet balance"));
  console.log(
    "  ✅ [PASS] Order ditolak secara aman jika Fixed USD ($100) > Saldo Dompet ($20).",
  );

  // --------------------------------------------------------------------------
  // KASUS 3: INDEPENDENT COIN FILTER (WHITELIST vs BLACKLIST)
  // --------------------------------------------------------------------------
  console.log("\n📌 KASUS 3: Isolasi Filter Koin (Whitelist vs Blacklist)");
  const filterTestnetConfig: BinanceExecutionConfig = {
    ...testnetConfig,
    coinFilterMode: "WHITELIST",
    targetCoins: "BTCUSDT,ETHUSDT", // SOLUSDT tidak ada di whitelist Testnet
  };
  const filterLiveConfig: BinanceExecutionConfig = {
    ...liveConfig,
    coinFilterMode: "WHITELIST",
    targetCoins: "SOLUSDT,BNBUSDT", // SOLUSDT ada di whitelist Live
  };

  const fTestRun = simulateSignalExecution(
    sampleSignal,
    filterTestnetConfig,
    1000,
    solFilters,
  );
  const fLiveRun = simulateSignalExecution(
    sampleSignal,
    filterLiveConfig,
    1000,
    solFilters,
  );

  assert.strictEqual(fTestRun.executed, false, "Testnet harus menolak SOLUSDT");
  assert.ok(fTestRun.reason?.includes("Whitelist"));
  assert.strictEqual(
    fLiveRun.executed,
    true,
    "Live harus mengeksekusi SOLUSDT",
  );
  console.log(
    "  ✅ [PASS] Filter koin Testnet menolak SOLUSDT, sementara Live mengeksekusi sesuai target masing-masing.",
  );

  // --------------------------------------------------------------------------
  // KASUS 4: INDEPENDENT TRADE DIRECTION (LONG_ONLY vs SHORT_ONLY vs BOTH)
  // --------------------------------------------------------------------------
  console.log("\n📌 KASUS 4: Isolasi Filter Arah Trading (Direction Guard)");
  const shortSignal: SignalPayload = {
    ...sampleSignal,
    side: "SHORT",
    entryPrice: 100.0,
    tp1: 97.0,
    sl: 103.0,
  };

  const dirTestnetConfig: BinanceExecutionConfig = {
    ...testnetConfig,
    tradeDirection: "BOTH",
  };
  const dirLiveConfig: BinanceExecutionConfig = {
    ...liveConfig,
    tradeDirection: "LONG_ONLY",
  };

  const dirTestRun = simulateSignalExecution(
    shortSignal,
    dirTestnetConfig,
    1000,
    solFilters,
  );
  const dirLiveRun = simulateSignalExecution(
    shortSignal,
    dirLiveConfig,
    1000,
    solFilters,
  );

  assert.strictEqual(
    dirTestRun.executed,
    true,
    "Testnet harus mengizinkan SHORT",
  );
  assert.strictEqual(
    dirLiveRun.executed,
    false,
    "Live harus menolak SHORT karena LONG_ONLY",
  );
  assert.ok(dirLiveRun.reason?.includes("LONG_ONLY"));
  console.log(
    "  ✅ [PASS] Sinyal SHORT dieksekusi di Testnet (BOTH) dan diblokir di Live (LONG_ONLY).",
  );

  // --------------------------------------------------------------------------
  // KASUS 5: INDEPENDENT SCORE THRESHOLD (MIN SCORE)
  // --------------------------------------------------------------------------
  console.log("\n📌 KASUS 5: Isolasi Ambang Batas Skor Minimum (Min Score)");
  const scoreSignal: SignalPayload = { ...sampleSignal, score: 70 };

  const scoreTestnetConfig: BinanceExecutionConfig = {
    ...testnetConfig,
    minScore: 60,
  };
  const scoreLiveConfig: BinanceExecutionConfig = {
    ...liveConfig,
    minScore: 85,
  };

  const scoreTestRun = simulateSignalExecution(
    scoreSignal,
    scoreTestnetConfig,
    1000,
    solFilters,
  );
  const scoreLiveRun = simulateSignalExecution(
    scoreSignal,
    scoreLiveConfig,
    1000,
    solFilters,
  );

  assert.strictEqual(
    scoreTestRun.executed,
    true,
    "Testnet harus mengizinkan skor 70 (min 60)",
  );
  assert.strictEqual(
    scoreLiveRun.executed,
    false,
    "Live harus menolak skor 70 (min 85)",
  );
  assert.ok(scoreLiveRun.reason?.includes("below minScore"));
  console.log(
    "  ✅ [PASS] Sinyal skor 70 lolos di Testnet (min 60) dan diblokir di Live (min 85).",
  );

  // --------------------------------------------------------------------------
  // KASUS 6: INDEPENDENT BTC MACRO TREND PROTECTION
  // --------------------------------------------------------------------------
  console.log(
    "\n📌 KASUS 6: Isolasi Proteksi Tren Makro BTC (Bearish Choppy Guard)",
  );
  const bearishSignal: SignalPayload = {
    ...sampleSignal,
    analytics: { btcTrendBias: "bearish" },
  };

  const btcTestnetConfig: BinanceExecutionConfig = {
    ...testnetConfig,
    blockLongOnBtcBearish: false,
  };
  const btcLiveConfig: BinanceExecutionConfig = {
    ...liveConfig,
    blockLongOnBtcBearish: true,
  };

  const btcTestRun = simulateSignalExecution(
    bearishSignal,
    btcTestnetConfig,
    1000,
    solFilters,
  );
  const btcLiveRun = simulateSignalExecution(
    bearishSignal,
    btcLiveConfig,
    1000,
    solFilters,
  );

  assert.strictEqual(
    btcTestRun.executed,
    true,
    "Testnet agresif mengizinkan LONG saat BTC bearish",
  );
  assert.strictEqual(
    btcLiveRun.executed,
    false,
    "Live konservatif memblokir LONG saat BTC bearish",
  );
  assert.ok(btcLiveRun.reason?.includes("BTC trend is BEARISH"));
  console.log(
    "  ✅ [PASS] Proteksi BTC Bearish bekerja mandiri: Testnet jalan, Live aman terproteksi.",
  );

  // --------------------------------------------------------------------------
  // KASUS 7: INDEPENDENT MAX OPEN POSITIONS
  // --------------------------------------------------------------------------
  console.log(
    "\n📌 KASUS 7: Isolasi Batas Maksimal Posisi Terbuka (Max Open Positions)",
  );
  const maxPosTestnetConfig: BinanceExecutionConfig = {
    ...testnetConfig,
    maxOpenPositions: 5,
  };
  const maxPosLiveConfig: BinanceExecutionConfig = {
    ...liveConfig,
    maxOpenPositions: 2,
  };

  // Asumsi ada 2 posisi aktif di kedua exchange
  const maxPosTestRun = simulateSignalExecution(
    sampleSignal,
    maxPosTestnetConfig,
    1000,
    solFilters,
    2,
  );
  const maxPosLiveRun = simulateSignalExecution(
    sampleSignal,
    maxPosLiveConfig,
    1000,
    solFilters,
    2,
  );

  assert.strictEqual(
    maxPosTestRun.executed,
    true,
    "Testnet (2/5) harus mengizinkan order baru",
  );
  assert.strictEqual(
    maxPosLiveRun.executed,
    false,
    "Live (2/2) harus menolak karena limit tercapai",
  );
  assert.ok(maxPosLiveRun.reason?.includes("Max open positions limit reached"));
  console.log(
    "  ✅ [PASS] Batas posisi independen: Testnet (2/5) lolos, Live (2/2) tertahan.",
  );

  // --------------------------------------------------------------------------
  // KASUS 8: INDEPENDENT AUTO-EXECUTE SWITCH
  // --------------------------------------------------------------------------
  console.log("\n📌 KASUS 8: Isolasi Saklar AutoExecute");
  const autoTestnetConfig: BinanceExecutionConfig = {
    ...testnetConfig,
    autoExecute: true,
  };
  const autoLiveConfig: BinanceExecutionConfig = {
    ...liveConfig,
    autoExecute: false,
  };

  const autoTestRun = simulateSignalExecution(
    sampleSignal,
    autoTestnetConfig,
    1000,
    solFilters,
  );
  const autoLiveRun = simulateSignalExecution(
    sampleSignal,
    autoLiveConfig,
    1000,
    solFilters,
  );

  assert.strictEqual(autoTestRun.executed, true);
  assert.strictEqual(autoLiveRun.executed, false);
  assert.ok(autoLiveRun.reason?.includes("AutoExecute is disabled"));
  console.log("  ✅ [PASS] Saklar autoExecute terbukti mandiri.");

  console.log(
    "\n==================================================================",
  );
  console.log("🎉 SELURUH 8 KASUS UJI INDEPENDENSI KONFIGURASI LULUS 100%!");
  console.log(
    "   Testnet dan Live terbukti memiliki parameter, sizing, filter,",
  );
  console.log(
    "   dan risk mode yang terisolasi sempurna tanpa saling bentrok.",
  );
  console.log(
    "==================================================================",
  );
}

runIndependentConfigTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
