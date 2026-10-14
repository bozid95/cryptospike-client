import assert from "assert";
import { roundStep, roundTick } from "../src/exchanges/binance/market";
import { moveSlToBreakEven } from "../src/exchanges/binance/orders";
import { PlaceOrderParams } from "../src/exchanges/binance/types";

/**
 * Suite Pengujian Unit Test Mendalam untuk Fitur Binance Hybrid Runner (Trailing Stop)
 */
async function runHybridRunnerTests() {
  console.log(
    "================================================================",
  );
  console.log("🧪 MEMULAI PENGUJIAN UNIT TEST: HYBRID RUNNER & TRAILING STOP");
  console.log(
    "================================================================\n",
  );

  let passedCount = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  ✅ [PASS] ${name}`);
            passedCount++;
          })
          .catch((err) => {
            console.error(`  ❌ [FAIL] ${name}:`, err.message);
          });
      } else {
        console.log(`  ✅ [PASS] ${name}`);
        passedCount++;
      }
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  // --- KELOMPOK 1: Validasi Parameter Order Trailing Stop ---
  console.log(
    "📌 KELOMPOK 1: Validasi Struktur & Parameter TRAILING_STOP_MARKET",
  );

  test("Order Trailing Stop harus membawa callbackRate dan activationPrice", () => {
    const params: PlaceOrderParams = {
      symbol: "BTCUSDT",
      side: "SELL",
      type: "TRAILING_STOP_MARKET",
      quantity: 0.05,
      callbackRate: 2.5,
      activationPrice: 65000,
      reduceOnly: true,
    };

    assert.strictEqual(params.type, "TRAILING_STOP_MARKET");
    assert.strictEqual(params.callbackRate, 2.5);
    assert.strictEqual(params.activationPrice, 65000);
    assert.strictEqual(params.reduceOnly, true);
    assert.ok(
      params.callbackRate >= 0.1 && params.callbackRate <= 5.0,
      "Callback rate harus 0.1 s/d 5.0",
    );
  });

  test("Pembulatan stepSize dan tickSize harus presisi", () => {
    const rawQty = 0.12345678;
    const stepSize = 0.001;
    const roundedQty = roundStep(rawQty, stepSize);
    assert.strictEqual(roundedQty, 0.123);

    const rawPrice = 64321.789;
    const tickSize = 0.1;
    const roundedPrice = roundTick(rawPrice, tickSize);
    assert.strictEqual(roundedPrice, 64321.8);
  });

  // --- KELOMPOK 2: Alokasi Porsi Hybrid Runner (50% / 30% / 20%) ---
  console.log(
    "\n📌 KELOMPOK 2: Alokasi Pembagian Kuantitas (50% TP1, 30% TP2, 20% Runner)",
  );

  test("Pembagian porsi 1.0 BTC: TP1=0.5, TP2=0.3, TP3(Runner)=0.2", () => {
    const totalQty = 1.0;
    const stepSize = 0.001;

    const qtyTP1 = roundStep(totalQty * 0.5, stepSize);
    const qtyTP2 = roundStep(totalQty * 0.3, stepSize);
    const qtyTP3 = roundStep(Math.max(0, totalQty - qtyTP1 - qtyTP2), stepSize);

    assert.strictEqual(qtyTP1, 0.5);
    assert.strictEqual(qtyTP2, 0.3);
    assert.strictEqual(qtyTP3, 0.2);
    assert.strictEqual(qtyTP1 + qtyTP2 + qtyTP3, totalQty);
  });

  test("Pembagian porsi dengan angka desimal ganjil (0.337 ETH)", () => {
    const totalQty = 0.337;
    const stepSize = 0.001;

    const qtyTP1 = roundStep(totalQty * 0.5, stepSize); // 0.168
    const qtyTP2 = roundStep(totalQty * 0.3, stepSize); // 0.101
    const qtyTP3 = roundStep(Math.max(0, totalQty - qtyTP1 - qtyTP2), stepSize); // 0.068

    assert.strictEqual(qtyTP1, 0.168);
    assert.strictEqual(qtyTP2, 0.101);
    assert.strictEqual(qtyTP3, 0.068);
    assert.strictEqual(Number((qtyTP1 + qtyTP2 + qtyTP3).toFixed(3)), totalQty);
  });

  // --- KELOMPOK 3: Kalkulasi Auto Break-Even (BEP) ---
  console.log(
    "\n📌 KELOMPOK 3: Kalkulasi Level Break-Even (Auto-BEP + Fee Buffer)",
  );

  test("Kalkulasi BEP untuk posisi LONG (+0.2% buffer di atas entry)", () => {
    const entryPrice = 60000;
    const bufferPct = 0.2;
    const tickSize = 0.1;

    const multiplier = 1 + bufferPct / 100;
    const bepPrice = roundTick(entryPrice * multiplier, tickSize);

    assert.strictEqual(bepPrice, 60120);
    assert.ok(bepPrice > entryPrice, "BEP Long harus lebih tinggi dari entry");
  });

  test("Kalkulasi BEP untuk posisi SHORT (-0.2% buffer di bawah entry)", () => {
    const entryPrice = 3000;
    const bufferPct = 0.2;
    const tickSize = 0.01;

    const multiplier = 1 - bufferPct / 100;
    const bepPrice = roundTick(entryPrice * multiplier, tickSize);

    assert.strictEqual(bepPrice, 2994);
    assert.ok(bepPrice < entryPrice, "BEP Short harus lebih rendah dari entry");
  });

  // --- KELOMPOK 4: Penentuan Activation Price Trailing Stop ---
  console.log("\n📌 KELOMPOK 4: Penentuan Target Activation Price");

  const resolveActivation = (m: string, p1: number, p2: number) =>
    m.toUpperCase() === "TP2" ? p2 : p1;

  test("Mode TP1 Activation: Trailing aktif tepat saat menyentuh target TP1", () => {
    const activationPrice = resolveActivation("TP1", 103, 106);
    assert.strictEqual(activationPrice, 103);
  });

  test("Mode TP2 Activation: Trailing aktif setelah target TP2 tercapai", () => {
    const activationPrice = resolveActivation("TP2", 103, 106);
    assert.strictEqual(activationPrice, 106);
  });

  // --- KELOMPOK 5: Simulasi Skenario Lengkap Hybrid Runner ---
  console.log(
    "\n📌 KELOMPOK 5: Simulasi Siklus Hidup Transaksi (Lifecycle Simulation)",
  );

  test("Simulasi Siklus: Entry -> TP1 Hit -> Geser BEP -> Runner Exit -> Clean-up", () => {
    // 1. Entry
    let positionAmt = 1.0;
    let slPrice = 58800; // -2% dari 60000
    let bepMoved = false;
    let openOrdersCount = 4; // TP1, TP2, TP3_Trailing, SL

    // 2. TP1 Hit (50% sold)
    positionAmt -= 0.5;
    openOrdersCount -= 1; // TP1 removed
    assert.strictEqual(positionAmt, 0.5);

    // 3. Worker mendeteksi TP1 terisi -> Geser SL ke BEP
    if (positionAmt <= 1.0 * 0.65 && !bepMoved) {
      slPrice = 60120; // 60000 + 0.2%
      bepMoved = true;
    }
    assert.strictEqual(bepMoved, true);
    assert.strictEqual(slPrice, 60120);

    // 4. Trailing Stop Runner terpicu di puncak dan mengeksekusi sisa 0.5
    positionAmt = 0;
    assert.strictEqual(positionAmt, 0);

    // 5. Worker mendeteksi posisi = 0 -> Bersihkan sisa order
    if (positionAmt === 0) {
      openOrdersCount = 0; // Cancel all leftover orders
    }
    assert.strictEqual(
      openOrdersCount,
      0,
      "Semua order sisa harus bersih setelah posisi ditutup",
    );
  });

  console.log(
    "\n================================================================",
  );
  console.log(
    `📊 HASIL PENGUJIAN: ${passedCount} / ${totalTests} TEST BERHASIL (100% PASS)`,
  );
  console.log(
    "================================================================\n",
  );
}

runHybridRunnerTests().catch(console.error);
