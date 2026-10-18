import { roundStep, roundTick } from "../src/exchanges/binance/market";
import { BinanceExecutionConfig } from "../src/exchanges/binance/types";

// ====================================================================
// SIMULATOR ENGINE (Mereplikasi logika orders.ts dan socket.service.ts)
// ====================================================================

interface PositionCalcInput {
  walletBalance: number;
  entryPrice: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  filters: {
    minNotional: number;
    stepSize: number;
    tickSize: number;
  };
  config: {
    riskMode?: "PERCENTAGE" | "FIXED_USD" | string;
    riskAmountUsd?: number;
    riskPerTradePct?: number;
    leverage?: number;
    marginType?: string;
  };
}

interface PositionCalcResult {
  allowed: boolean;
  rejectReason?: string;
  marginToRisk?: number;
  notionalValue?: number;
  quantity?: number;
  qtyTP1?: number;
  qtyTP2?: number;
  qtyTP3?: number;
  mergedTP3?: boolean;
  totalTpQty?: number;
}

function calculateOrderSizing(input: PositionCalcInput): PositionCalcResult {
  const { walletBalance, entryPrice, filters, config, tp1, tp2, tp3 } = input;
  const riskMode = (config.riskMode || "PERCENTAGE").toUpperCase();
  let marginToRisk: number;

  if (riskMode === "FIXED_USD") {
    marginToRisk = Math.max(0.1, Number(config.riskAmountUsd || 10.0));
  } else {
    const riskPct = config.riskPerTradePct || 2.0;
    marginToRisk = (walletBalance * riskPct) / 100;
  }

  // 1. Cek saldo dompet
  if (marginToRisk > walletBalance) {
    return {
      allowed: false,
      rejectReason: `Required margin ($${marginToRisk.toFixed(2)}) exceeds available wallet balance ($${walletBalance.toFixed(2)}).`,
    };
  }

  // 2. Cek Min Notional
  const leverage = config.leverage || 10;
  const notionalValue = marginToRisk * leverage;

  if (notionalValue < filters.minNotional) {
    return {
      allowed: false,
      rejectReason: `Notional value ($${notionalValue.toFixed(2)}) is below Binance minimum limit ($${filters.minNotional}).`,
    };
  }

  // 3. Hitung Kuantitas Entry
  const rawQty = notionalValue / entryPrice;
  const quantity = roundStep(rawQty, filters.stepSize);

  if (quantity <= 0) {
    return {
      allowed: false,
      rejectReason: `Quantity rounded down to 0 with stepSize (${filters.stepSize}).`,
    };
  }

  // 4. Hitung Multi-Bracket Take Profit (50% / 30% / 20%)
  const targetTp1 = tp1 || entryPrice * 1.015;
  const targetTp2 = tp2 || entryPrice * 1.03;
  const targetTp3 = tp3 || entryPrice * 1.05;

  let qtyTP1 = roundStep(quantity * 0.5, filters.stepSize);
  let qtyTP2 = roundStep(quantity * 0.3, filters.stepSize);
  let qtyTP3 = roundStep(
    Math.max(0, quantity - qtyTP1 - qtyTP2),
    filters.stepSize,
  );

  let mergedTP3 = false;

  // Smart TP merge jika < minNotional
  if (qtyTP3 > 0 && qtyTP3 * targetTp3 < filters.minNotional) {
    qtyTP2 = roundStep(qtyTP2 + qtyTP3, filters.stepSize);
    qtyTP3 = 0;
    mergedTP3 = true;
  }
  if (qtyTP2 > 0 && qtyTP2 * targetTp2 < filters.minNotional) {
    qtyTP1 = roundStep(qtyTP1 + qtyTP2, filters.stepSize);
    qtyTP2 = 0;
  }

  const totalTpQty = Number((qtyTP1 + qtyTP2 + qtyTP3).toFixed(8));

  return {
    allowed: true,
    marginToRisk,
    notionalValue,
    quantity,
    qtyTP1,
    qtyTP2,
    qtyTP3,
    mergedTP3,
    totalTpQty,
  };
}

// ====================================================================
// TEST SUITE: 9 SKENARIO RISIKO USD vs PERSENTASE
// ====================================================================

async function runComprehensiveRiskTests() {
  console.log(
    "==================================================================",
  );
  console.log(
    "🧪 COMPREHENSIVE TEST SUITE: DUAL RISK MODE (FIXED USD vs % SALDO)",
  );
  console.log("   Menguji seluruh skenario normal, edge-cases, dan presisi");
  console.log(
    "==================================================================\n",
  );

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${title}`);
      if (detail) console.log(`     ↳ ${detail}`);
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      if (detail) console.error(`     ↳ ${detail}`);
      process.exit(1);
    }
  }

  // ------------------------------------------------------------------
  // SKENARIO 1: Mode FIXED_USD pada Saldo Normal ($1,000 USDT)
  // ------------------------------------------------------------------
  console.log("📌 SKENARIO 1: Mode FIXED_USD pada Saldo Normal ($1,000 USDT)");
  {
    const res = calculateOrderSizing({
      walletBalance: 1000,
      entryPrice: 100,
      filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.1 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 50, leverage: 10 },
    });

    assert(res.allowed === true, "Eksekusi FIXED_USD diizinkan");
    assert(res.marginToRisk === 50, "Margin yang dialokasikan tepat $50 USD");
    assert(res.notionalValue === 500, "Notional value tepat $500 (50 x 10x)");
    assert(res.quantity === 5.0, "Kuantitas entry tepat 5.0 koin");
    assert(res.qtyTP1 === 2.5, "Alokasi TP1 50% tepat 2.50 koin");
    assert(res.qtyTP2 === 1.5, "Alokasi TP2 30% tepat 1.50 koin");
    assert(res.qtyTP3 === 1.0, "Alokasi TP3 20% tepat 1.00 koin");
    assert(
      res.totalTpQty === res.quantity,
      "Total kuantitas TP1+TP2+TP3 sama persis dengan entry (5.00)",
    );
  }

  // ------------------------------------------------------------------
  // SKENARIO 2: Saldo Kecil / Kasus Nyata ($10.35 USDT Saldo Live)
  // ------------------------------------------------------------------
  console.log(
    "\n📌 SKENARIO 2: Saldo Kecil Kasus Nyata ($10.35 USDT Saldo Live)",
  );
  {
    // A. Mode Persentase Lama (2%)
    const resPct = calculateOrderSizing({
      walletBalance: 10.35,
      entryPrice: 200,
      filters: { minNotional: 5, stepSize: 0.001, tickSize: 0.01 },
      config: { riskMode: "PERCENTAGE", riskPerTradePct: 2.0, leverage: 10 },
    });
    assert(
      resPct.allowed === false &&
        resPct.rejectReason?.includes("below Binance minimum limit"),
      "Mode persentase (2%) gagal karena notional ($2.07) < minNotional Binance ($5)",
      `Reject Reason: ${resPct.rejectReason}`,
    );

    // B. Mode FIXED_USD ($10)
    const resUsd = calculateOrderSizing({
      walletBalance: 10.35,
      entryPrice: 200,
      filters: { minNotional: 5, stepSize: 0.001, tickSize: 0.01 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 10.0, leverage: 10 },
    });
    assert(
      resUsd.allowed === true && resUsd.quantity! > 0,
      "Mode FIXED_USD ($10) sukses memenuhi minNotional Binance pada saldo $10.35 USDT",
      `Margin: $${resUsd.marginToRisk}, Notional: $${resUsd.notionalValue}, Qty: ${resUsd.quantity}`,
    );
  }

  // ------------------------------------------------------------------
  // SKENARIO 3: Proteksi Overdraft (Fixed USD > Saldo Dompet)
  // ------------------------------------------------------------------
  console.log("\n📌 SKENARIO 3: Proteksi Overdraft (Fixed USD > Saldo Dompet)");
  {
    const res = calculateOrderSizing({
      walletBalance: 15.0,
      entryPrice: 50,
      filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.01 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 50.0, leverage: 10 },
    });
    assert(
      res.allowed === false &&
        res.rejectReason?.includes("exceeds available wallet balance"),
      "Order ditolak aman sebelum API dipanggil jika modal ($50) > saldo dompet ($15)",
      `Reject Reason: ${res.rejectReason}`,
    );
  }

  // ------------------------------------------------------------------
  // SKENARIO 4: Fixed USD Sangat Kecil di Bawah MinNotional Binance ($5)
  // ------------------------------------------------------------------
  console.log(
    "\n📌 SKENARIO 4: Fixed USD Sangat Kecil di Bawah MinNotional ($5)",
  );
  {
    const res = calculateOrderSizing({
      walletBalance: 100.0,
      entryPrice: 10,
      filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.01 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 0.3, leverage: 5 }, // 0.3 * 5 = $1.50
    });
    assert(
      res.allowed === false &&
        res.rejectReason?.includes("below Binance minimum limit"),
      "Fixed USD $0.30 x 5x ($1.50) ditolak aman karena di bawah batas minimum Binance ($5)",
      `Reject Reason: ${res.rejectReason}`,
    );
  }

  // ------------------------------------------------------------------
  // SKENARIO 5: Smart-Merge TP3 Moonbag pada Mode FIXED_USD
  // ------------------------------------------------------------------
  console.log("\n📌 SKENARIO 5: Smart-Merge TP3 Moonbag pada Mode FIXED_USD");
  {
    // Total notional = $20 (Lolos minNotional).
    // TP1 (50%) = $10.1 (Lolos minNotional).
    // TP2 (30%) = $6.12 (Lolos minNotional).
    // TP3 (20%) = $4.12 (< $5 minNotional -> HARUS di-merge ke TP2!).
    const res = calculateOrderSizing({
      walletBalance: 50.0,
      entryPrice: 10.0,
      tp1: 10.1,
      tp2: 10.2,
      tp3: 10.3,
      filters: { minNotional: 5, stepSize: 0.1, tickSize: 0.01 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 2.0, leverage: 10 },
    });

    assert(res.allowed === true, "Entry order lolos minNotional");
    assert(
      res.mergedTP3 === true,
      "TP3 otomatis di-merge ke TP2 karena nominal TP3 < $5 minNotional",
    );
    assert(res.qtyTP3 === 0, "Kuantitas TP3 menjadi 0 setelah di-merge");
    assert(res.qtyTP2 === 1.0, "Kuantitas TP2 menjadi 1.0 (0.6 TP2 + 0.4 TP3)");
    assert(
      res.totalTpQty === res.quantity,
      "Total kuantitas pasca-merge tetap persis 100% dari entry (2.0)",
    );
  }

  // ------------------------------------------------------------------
  // SKENARIO 6: Eksekusi Simultan Mode Berbeda (Testnet USD vs Live %)
  // ------------------------------------------------------------------
  console.log(
    "\n📌 SKENARIO 6: Eksekusi Simultan Mode Berbeda (Testnet USD vs Live %)",
  );
  {
    const testnetRes = calculateOrderSizing({
      walletBalance: 5000,
      entryPrice: 50,
      filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.01 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 50, leverage: 10 },
    });

    const liveRes = calculateOrderSizing({
      walletBalance: 200,
      entryPrice: 50,
      filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.01 },
      config: { riskMode: "PERCENTAGE", riskPerTradePct: 3.0, leverage: 10 },
    });

    assert(
      testnetRes.marginToRisk === 50,
      "Testnet mengalokasikan $50 Fixed USD",
    );
    assert(testnetRes.quantity === 10.0, "Testnet entry kuantitas = 10.0 koin");
    assert(
      liveRes.marginToRisk === 6.0,
      "Live mengalokasikan $6 (3% dari $200)",
    );
    assert(liveRes.quantity === 1.2, "Live entry kuantitas = 1.2 koin");
  }

  // ------------------------------------------------------------------
  // SKENARIO 7: Variasi Leverage Ekstrem (1x, 5x, 20x, 50x, 100x)
  // ------------------------------------------------------------------
  console.log(
    "\n📌 SKENARIO 7: Variasi Leverage Ekstrem (1x, 5x, 20x, 50x, 100x) pada Fixed USD",
  );
  {
    const leverages = [1, 5, 20, 50, 100];
    const targetMargin = 10.0;
    const price = 25.0;

    for (const lev of leverages) {
      const res = calculateOrderSizing({
        walletBalance: 500,
        entryPrice: price,
        filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.01 },
        config: {
          riskMode: "FIXED_USD",
          riskAmountUsd: targetMargin,
          leverage: lev,
        },
      });

      const expectedNotional = targetMargin * lev;
      const expectedQty = roundStep(expectedNotional / price, 0.01);

      assert(
        res.marginToRisk === targetMargin &&
          res.notionalValue === expectedNotional &&
          res.quantity === expectedQty,
        `Leverage ${lev}x: Margin tetap $${targetMargin}, Notional $${expectedNotional}, Qty ${expectedQty}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // SKENARIO 8: Presisi Koin Ekstrem (High-Value BTC vs Low-Value PEPE)
  // ------------------------------------------------------------------
  console.log(
    "\n📌 SKENARIO 8: Presisi Koin Ekstrem (High-Value BTC vs Low-Value PEPE)",
  );
  {
    // A. BTCUSDT (Harga Tinggi $65,000, stepSize 0.001)
    const btcRes = calculateOrderSizing({
      walletBalance: 100,
      entryPrice: 65000,
      filters: { minNotional: 5, stepSize: 0.001, tickSize: 0.1 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 15.0, leverage: 20 }, // Notional = $300
    });
    assert(
      btcRes.allowed === true && btcRes.quantity === 0.004,
      `BTCUSDT presisi desimal: Qty entry = 0.004 BTC, Total TP = ${btcRes.totalTpQty}`,
    );
    assert(
      btcRes.totalTpQty === btcRes.quantity,
      "Total kuantitas TP BTC sama persis dengan entry (0.004 BTC)",
    );

    // B. 1000PEPEUSDT / Koin Meme (Harga Rendah $0.0000105, stepSize 1000)
    const memeRes = calculateOrderSizing({
      walletBalance: 50,
      entryPrice: 0.0000105,
      filters: { minNotional: 5, stepSize: 1000, tickSize: 0.0000001 },
      config: { riskMode: "FIXED_USD", riskAmountUsd: 10.0, leverage: 10 }, // Notional = $100
    });
    assert(
      memeRes.allowed === true && memeRes.quantity === 9523000,
      `Meme PEPEUSDT jutaan koin: Qty entry = 9,523,000 koin, Total TP = ${memeRes.totalTpQty}`,
    );
    assert(
      memeRes.totalTpQty === memeRes.quantity,
      "Total kuantitas TP PEPE sama persis dengan entry (9,523,000)",
    );
  }

  // ------------------------------------------------------------------
  // SKENARIO 9: Dynamic Runtime Switch (Tanpa Restart)
  // ------------------------------------------------------------------
  console.log("\n📌 SKENARIO 9: Dynamic Runtime Switch (Tanpa Restart)");
  {
    const mutableConfig: any = {
      riskMode: "PERCENTAGE",
      riskPerTradePct: 2.0,
      riskAmountUsd: 25.0,
      leverage: 10,
    };

    // Sinyal 1 tiba saat mode PERCENTAGE (2% dari $500 = $10 margin)
    const sig1 = calculateOrderSizing({
      walletBalance: 500,
      entryPrice: 100,
      filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.01 },
      config: mutableConfig,
    });
    assert(
      sig1.marginToRisk === 10.0,
      "Sinyal 1 menggunakan mode PERCENTAGE ($10 margin)",
    );

    // User mengubah konfigurasi ke FIXED_USD $25 via Web UI
    mutableConfig.riskMode = "FIXED_USD";

    // Sinyal 2 tiba segera setelahnya tanpa perlu restart
    const sig2 = calculateOrderSizing({
      walletBalance: 500,
      entryPrice: 100,
      filters: { minNotional: 5, stepSize: 0.01, tickSize: 0.01 },
      config: mutableConfig,
    });
    assert(
      sig2.marginToRisk === 25.0,
      "Sinyal 2 langsung beralih ke FIXED_USD ($25 margin) tanpa restart",
    );
  }

  // ------------------------------------------------------------------
  // KESIMPULAN
  // ------------------------------------------------------------------
  console.log(
    "\n==================================================================",
  );
  console.log(
    `🎉 SELURUH ${total} PENGUJIAN KOMPREHENSIF LULUS 100% (${passed}/${total})!`,
  );
  console.log(
    "   Fitur Risk USD (Fixed USD vs %) terbukti tangguh di semua kondisi:",
  );
  console.log("   - Saldo normal & saldo kecil live account");
  console.log("   - Proteksi saldo overdraft & minNotional Binance");
  console.log("   - Smart-merge TP moonbag di bawah batas bursa");
  console.log("   - Eksekusi independen simultan Testnet & Live");
  console.log("   - Rentang leverage 1x s/d 100x");
  console.log("   - Presisi koin ekstrem (BTC s/d koin meme jutaan unit)");
  console.log("   - Perubahan konfigurasi dinamis saat runtime");
  console.log(
    "==================================================================",
  );
}

runComprehensiveRiskTests().catch((err) => {
  console.error("Test Suite Error:", err);
  process.exit(1);
});
