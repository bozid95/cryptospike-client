import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEntryGuard,
  computeRiskAtSlSizing,
  ensureStopLossOrExit,
  maxEntryDeviationR,
  resolveStopLossPrice,
  riskAtSlLimits,
} from "../src/exchanges/binance/execution-guards";

/**
 * Pengaman eksekusi: harga basi sebelum entry & SL wajib (atau posisi ditutup).
 * Jalankan: npx tsx --test tests/binance-execution-guards.test.ts
 */

describe("resolveStopLossPrice", () => {
  test("SIGNAL_SL uses the signal stop loss", () => {
    assert.deepEqual(resolveStopLossPrice({}, "SHORT", 100, 103, 10), {
      price: 103,
      mode: "SIGNAL_SL",
      fallback: false,
    });
  });

  test("SIGNAL_SL without a signal SL falls back to 2%", () => {
    const r = resolveStopLossPrice({}, "LONG", 100, undefined, 10);
    assert.equal(r.fallback, true);
    assert.ok(Math.abs(r.price - 98) < 1e-9);
  });

  test("FIXED_PCT and MAX_LOSS_ROI follow the Client SL mode", () => {
    const fixed = resolveStopLossPrice({ slMode: "FIXED_PCT", customSlValue: 2 }, "SHORT", 100, 103, 10);
    assert.ok(Math.abs(fixed.price - 102) < 1e-9);
    const roi = resolveStopLossPrice({ slMode: "MAX_LOSS_ROI", customSlValue: 20 }, "LONG", 100, 97, 10);
    assert.ok(Math.abs(roi.price - 98) < 1e-9); // 20% ROI / 10x = 2%
  });
});

describe("evaluateEntryGuard", () => {
  const base = { signalEntry: 100, maxDeviationR: 0.5 };

  test("accepts a mark price close to the signal entry", () => {
    assert.equal(evaluateEntryGuard({ ...base, side: "SHORT", markPrice: 100.4, sl: 103, tp1: 96 }), null);
    assert.equal(evaluateEntryGuard({ ...base, side: "LONG", markPrice: 99.6, sl: 97, tp1: 104 }), null);
  });

  test("rejects when price already crossed the SL", () => {
    assert.match(evaluateEntryGuard({ ...base, side: "SHORT", markPrice: 103.2, sl: 103, tp1: 96 })!, /beyond SL/);
    assert.match(evaluateEntryGuard({ ...base, side: "LONG", markPrice: 96.9, sl: 97, tp1: 104 })!, /beyond SL/);
  });

  test("rejects when price already reached TP1", () => {
    assert.match(evaluateEntryGuard({ ...base, side: "SHORT", markPrice: 95.9, sl: 103, tp1: 96 })!, /beyond TP1/);
    assert.match(evaluateEntryGuard({ ...base, side: "LONG", markPrice: 104.1, sl: 97, tp1: 104 })!, /beyond TP1/);
  });

  test("rejects a stale price beyond the deviation limit (either direction)", () => {
    // jarak SL 3 → batas 0.5R = 1.5
    assert.match(evaluateEntryGuard({ ...base, side: "SHORT", markPrice: 101.6, sl: 103, tp1: 96 })!, /deviates/);
    assert.match(evaluateEntryGuard({ ...base, side: "SHORT", markPrice: 98.4, sl: 103, tp1: 96 })!, /deviates/);
  });

  test("skips the check when inputs are missing", () => {
    assert.equal(evaluateEntryGuard({ ...base, side: "SHORT", markPrice: 0, sl: 103 }), null);
  });

  test("deviation limit comes from env with a safe default", () => {
    const prev = process.env.BINANCE_MAX_ENTRY_DEVIATION_R;
    delete process.env.BINANCE_MAX_ENTRY_DEVIATION_R;
    assert.equal(maxEntryDeviationR(), 0.5);
    process.env.BINANCE_MAX_ENTRY_DEVIATION_R = "1";
    assert.equal(maxEntryDeviationR(), 1);
    process.env.BINANCE_MAX_ENTRY_DEVIATION_R = "abc";
    assert.equal(maxEntryDeviationR(), 0.5);
    if (prev === undefined) delete process.env.BINANCE_MAX_ENTRY_DEVIATION_R;
    else process.env.BINANCE_MAX_ENTRY_DEVIATION_R = prev;
  });
});

describe("ensureStopLossOrExit", () => {
  function harness(opts: { primary?: Error; fallback?: Error; close?: Error }) {
    const calls: string[] = [];
    const logs: string[] = [];
    const deps = {
      placePrimary: async () => {
        calls.push("primary");
        if (opts.primary) throw opts.primary;
      },
      placeFallback: async () => {
        calls.push("fallback");
        if (opts.fallback) throw opts.fallback;
      },
      emergencyClose: async () => {
        calls.push("close");
        if (opts.close) throw opts.close;
      },
      log: (level: string, m: string) => logs.push(`${level} ${m}`),
    };
    return { deps, calls, logs };
  }

  test("primary SL placed → no fallback, no close", async () => {
    const h = harness({});
    assert.equal(await ensureStopLossOrExit(h.deps), "PRIMARY");
    assert.deepEqual(h.calls, ["primary"]);
  });

  test("primary rejected → quantity fallback", async () => {
    const h = harness({ primary: new Error("-4509") });
    assert.equal(await ensureStopLossOrExit(h.deps), "FALLBACK");
    assert.deepEqual(h.calls, ["primary", "fallback"]);
  });

  test("fallback reports an existing stop → treated as protected", async () => {
    const h = harness({ primary: new Error("x"), fallback: new Error("-4130 existing stop order") });
    assert.equal(await ensureStopLossOrExit(h.deps), "ALREADY_PROTECTED");
    assert.deepEqual(h.calls, ["primary", "fallback"]);
  });

  test("both layers fail → position is closed at market", async () => {
    const h = harness({ primary: new Error("would immediately trigger"), fallback: new Error("-2021") });
    assert.equal(await ensureStopLossOrExit(h.deps), "EMERGENCY_CLOSED");
    assert.deepEqual(h.calls, ["primary", "fallback", "close"]);
    assert.ok(h.logs.some((l) => l.startsWith("ERROR") && l.includes("Closing position")));
  });

  test("emergency close also fails → UNPROTECTED with a critical log", async () => {
    const h = harness({ primary: new Error("a"), fallback: new Error("b"), close: new Error("c") });
    assert.equal(await ensureStopLossOrExit(h.deps), "UNPROTECTED");
    assert.ok(h.logs.some((l) => l.includes("OPEN WITHOUT STOP LOSS")));
  });
});

describe("computeRiskAtSlSizing (RISK_AT_SL)", () => {
  const base = { walletBalance: 500, riskPct: 1, entryPrice: 100, leverage: 10, minSlPct: 0.5, maxMarginPct: 20 };

  test("every SL distance loses the same amount at stop loss", () => {
    for (const [sl, notional] of [[101, 500], [102.5, 200], [105, 100]] as const) {
      const r = computeRiskAtSlSizing({ ...base, slPrice: sl });
      assert.ok(!("error" in r));
      assert.ok(Math.abs(r.notional - notional) < 1e-6, `notional for SL ${sl}`);
      assert.ok(Math.abs(r.riskUsd - 5) < 1e-6, `risk for SL ${sl}`);
      assert.equal(r.capped, false);
    }
  });

  test("works for LONG (SL below entry)", () => {
    const r = computeRiskAtSlSizing({ ...base, slPrice: 98 });
    assert.ok(!("error" in r));
    assert.ok(Math.abs(r.notional - 250) < 1e-6);
    assert.ok(Math.abs(r.margin - 25) < 1e-6);
  });

  test("margin cap shrinks the position and the effective risk", () => {
    // SL 0.6% → notional 833; at 5x leverage margin 166 > cap 20% × 500 = 100
    const r = computeRiskAtSlSizing({ ...base, leverage: 5, slPrice: 100.6 });
    assert.ok(!("error" in r));
    assert.equal(r.capped, true);
    assert.ok(Math.abs(r.margin - 100) < 1e-6);
    assert.ok(Math.abs(r.notional - 500) < 1e-6);
    assert.ok(r.riskUsd < 5);
  });

  test("rejects an SL tighter than the minimum distance", () => {
    const r = computeRiskAtSlSizing({ ...base, slPrice: 100.3 });
    assert.ok("error" in r && /below minimum/.test(r.error));
  });

  test("rejects invalid inputs", () => {
    assert.ok("error" in computeRiskAtSlSizing({ ...base, slPrice: 0 }));
    assert.ok("error" in computeRiskAtSlSizing({ ...base, walletBalance: 0, slPrice: 102 }));
    assert.ok("error" in computeRiskAtSlSizing({ ...base, riskPct: 0, slPrice: 102 }));
  });

  test("limits come from env with safe defaults", () => {
    const prev = { a: process.env.BINANCE_RISK_MIN_SL_PCT, b: process.env.BINANCE_RISK_MAX_MARGIN_PCT };
    delete process.env.BINANCE_RISK_MIN_SL_PCT;
    delete process.env.BINANCE_RISK_MAX_MARGIN_PCT;
    assert.deepEqual(riskAtSlLimits(), { minSlPct: 0.5, maxMarginPct: 20 });
    process.env.BINANCE_RISK_MIN_SL_PCT = "0.8";
    process.env.BINANCE_RISK_MAX_MARGIN_PCT = "150";
    assert.deepEqual(riskAtSlLimits(), { minSlPct: 0.8, maxMarginPct: 20 });
    for (const [k, v] of [["BINANCE_RISK_MIN_SL_PCT", prev.a], ["BINANCE_RISK_MAX_MARGIN_PCT", prev.b]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
});
