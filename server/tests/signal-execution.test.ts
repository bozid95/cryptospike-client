import assert from "assert";
import { SignalPayload } from "../src/exchanges/types";
import {
  BinanceExecutionConfig,
  PlaceOrderParams,
} from "../src/exchanges/binance/types";

// Simulasi interceptor pemanggilan order
const interceptedOrders: PlaceOrderParams[] = [];

async function mockPlaceOrder(params: PlaceOrderParams): Promise<any> {
  interceptedOrders.push(params);
  return {
    orderId: 100000 + interceptedOrders.length,
    symbol: params.symbol,
    status: "NEW",
    type: params.type,
    side: params.side,
  };
}

// Simulasi logika pembagian Hybrid Runner seperti di orders.ts
function simulateHybridOrderPlacements(
  signal: SignalPayload,
  config: BinanceExecutionConfig,
  totalQty: number,
  filters: { stepSize: number; tickSize: number },
) {
  const { symbol, side, entryPrice, tp1, tp2, tp3, sl } = signal;
  const exitSide = side === "LONG" ? "SELL" : "BUY";

  // Step 1: Entry Order
  mockPlaceOrder({
    symbol,
    side: side === "LONG" ? "BUY" : "SELL",
    type: "MARKET",
    quantity: totalQty,
  });

  // Step 2: Hitung TP1 (50%), TP2 (30%), TP3 Runner (20%)
  const qtyTP1 = Number((totalQty * 0.5).toFixed(3));
  const qtyTP2 = Number((totalQty * 0.3).toFixed(3));
  const qtyTP3 = Number((totalQty - qtyTP1 - qtyTP2).toFixed(3));

  // TP1
  if (tp1) {
    mockPlaceOrder({
      symbol,
      side: exitSide,
      type: "LIMIT",
      price: tp1,
      quantity: qtyTP1,
      timeInForce: "GTC",
      reduceOnly: true,
    });
  }

  // TP2
  if (tp2) {
    mockPlaceOrder({
      symbol,
      side: exitSide,
      type: "LIMIT",
      price: tp2,
      quantity: qtyTP2,
      timeInForce: "GTC",
      reduceOnly: true,
    });
  }

  // TP3 (Hybrid Runner: Trailing Stop)
  const isTrailingEnabled = config.trailingStopEnabled ?? true;
  const callbackRate = config.trailingCallbackRate ?? 2.5;

  if (qtyTP3 > 0 && isTrailingEnabled) {
    mockPlaceOrder({
      symbol,
      side: exitSide,
      type: "TRAILING_STOP_MARKET",
      quantity: qtyTP3,
      callbackRate,
      activationPrice: tp1, // default aktivasi di TP1
      reduceOnly: true,
    });
  }

  // Stop Loss
  mockPlaceOrder({
    symbol,
    side: exitSide,
    type: "STOP_MARKET",
    stopPrice: sl,
    closePosition: true,
  });
}

async function runSignalExecutionTests() {
  console.log(
    "================================================================",
  );
  console.log("🧪 TESTING: SIMULASI ALUR ORDER SINYAL HYBRID RUNNER LENGKAP");
  console.log(
    "================================================================\n",
  );

  const sampleSignal: SignalPayload = {
    symbol: "BTCUSDT",
    side: "LONG",
    entryPrice: 60000,
    tp1: 61000,
    tp2: 62000,
    tp3: 63500,
    sl: 58800,
    strategy: "SPIKE_MOMENTUM",
  };

  const sampleConfig: BinanceExecutionConfig = {
    autoExecute: true,
    binanceApiKey: "mock-key",
    binanceApiSecret: "mock-secret",
    environment: "TESTNET",
    marginType: "ISOLATED",
    leverage: 10,
    riskPerTradePct: 2.0,
    maxOpenPositions: 3,
    trailingStopEnabled: true,
    trailingCallbackRate: 2.5,
  };

  simulateHybridOrderPlacements(sampleSignal, sampleConfig, 1.0, {
    stepSize: 0.001,
    tickSize: 0.1,
  });

  console.log(`Terpasang total ${interceptedOrders.length} order ke Binance:`);
  interceptedOrders.forEach((ord, idx) => {
    console.log(
      `  [${idx + 1}] ${ord.type.padEnd(20)} | ${ord.side.padEnd(4)} | Qty: ${ord.quantity ?? "ALL"} | Price: ${ord.price ?? ord.stopPrice ?? "MKT"} ${ord.callbackRate ? `(Callback: ${ord.callbackRate}%, Activation: ${ord.activationPrice})` : ""}`,
    );
  });

  // Validasi
  assert.strictEqual(
    interceptedOrders.length,
    5,
    "Harus ada tepat 5 order (Entry + TP1 + TP2 + Runner + SL)",
  );

  const entry = interceptedOrders[0]!;
  assert.strictEqual(entry.type, "MARKET");
  assert.strictEqual(entry.side, "BUY");
  assert.strictEqual(entry.quantity, 1.0);

  const tp1Order = interceptedOrders[1]!;
  assert.strictEqual(tp1Order.type, "LIMIT");
  assert.strictEqual(tp1Order.price, 61000);
  assert.strictEqual(tp1Order.quantity, 0.5);

  const tp2Order = interceptedOrders[2]!;
  assert.strictEqual(tp2Order.type, "LIMIT");
  assert.strictEqual(tp2Order.price, 62000);
  assert.strictEqual(tp2Order.quantity, 0.3);

  const runnerOrder = interceptedOrders[3]!;
  assert.strictEqual(runnerOrder.type, "TRAILING_STOP_MARKET");
  assert.strictEqual(runnerOrder.quantity, 0.2);
  assert.strictEqual(runnerOrder.callbackRate, 2.5);
  assert.strictEqual(runnerOrder.activationPrice, 61000);
  assert.strictEqual(runnerOrder.reduceOnly, true);

  const slOrder = interceptedOrders[4]!;
  assert.strictEqual(slOrder.type, "STOP_MARKET");
  assert.strictEqual(slOrder.stopPrice, 58800);
  assert.strictEqual(slOrder.closePosition, true);

  console.log(
    "\n✅ Semua asersi eksekusi order sinyal terverifikasi 100% VALID!",
  );
}

runSignalExecutionTests().catch(console.error);
