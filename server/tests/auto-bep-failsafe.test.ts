import assert from "node:assert";

console.log("Running Auto-BEP Fail-Safe Logic Unit Tests...");

function roundTickDirectional(
  price: number,
  tickSize: number,
  mode: "floor" | "ceil",
): number {
  const precision = Math.max(0, Math.round(-Math.log10(tickSize)));
  const epsilon = tickSize * 1e-6;
  const steps =
    mode === "floor"
      ? Math.floor((price + epsilon) / tickSize)
      : Math.ceil((price - epsilon) / tickSize);
  return parseFloat((steps * tickSize).toFixed(precision));
}

// 1. Directional tick rounding
// CELOUSDT: tick 0.0001, entry 0.077, short buffer 0.2% -> 0.076846
// For SHORT: floor -> 0.0768 (strictly below 0.077, covers fee)
const shortBep = roundTickDirectional(0.077 * (1 - 0.002), 0.0001, "floor");
assert.strictEqual(shortBep, 0.0768, "SHORT BEP must round down to 0.0768");

// For LONG: entry 0.077, buffer 0.2% -> 0.077154
// For LONG: ceil -> 0.0772 (strictly above 0.077, covers fee)
const longBep = roundTickDirectional(0.077 * (1 + 0.002), 0.0001, "ceil");
assert.strictEqual(longBep, 0.0772, "LONG BEP must round up to 0.0772");

// 2. Minimum 2-tick safety gap with epsilon tolerance
const tickSize = 0.0001;
const minGap = tickSize * 2; // 0.0002
const epsilon = tickSize * 1e-4;

// For SHORT: bepPrice must be >= markPrice + minGap - epsilon
const markPriceShort = 0.0766;
const bepPriceShort = 0.0768;
assert.strictEqual(bepPriceShort >= markPriceShort + minGap - epsilon, true);

// If markPrice already bounced back to 0.07675 (less than 2 ticks away from 0.0768)
const closeMarkShort = 0.07675;
assert.strictEqual(bepPriceShort >= closeMarkShort + minGap - epsilon, false);

// For LONG: bepPrice must be <= markPrice - minGap + epsilon
const markPriceLong = 0.0775;
const bepPriceLong = 0.0772;
assert.strictEqual(bepPriceLong <= markPriceLong - minGap + epsilon, true);

// If markPrice for LONG dropped to 0.0773 (less than 2 ticks away from 0.0772)
const closeMarkLong = 0.0773;
assert.strictEqual(bepPriceLong <= closeMarkLong - minGap + epsilon, false);

console.log("✅ All Auto-BEP Unit Tests Passed!");
