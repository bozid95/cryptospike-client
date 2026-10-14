import assert from "assert";

function evaluateTradeDirection(
  signalSide: string,
  allowedDirection: string = "BOTH",
): { allowed: boolean; reason?: string } {
  const allowed = allowedDirection.toUpperCase();
  const side = signalSide.toUpperCase();

  if (allowed === "LONG_ONLY" && side !== "LONG") {
    return {
      allowed: false,
      reason: `Signal ${side} skipped: Bot configured for LONG_ONLY.`,
    };
  }

  if (allowed === "SHORT_ONLY" && side !== "SHORT") {
    return {
      allowed: false,
      reason: `Signal ${side} skipped: Bot configured for SHORT_ONLY.`,
    };
  }

  return { allowed: true };
}

async function runDirectionFilterTests() {
  console.log(
    "================================================================",
  );
  console.log("🧪 TESTING: TRADE DIRECTION FILTER (LONG / SHORT / BOTH)");
  console.log(
    "================================================================\n",
  );

  // Kasus 1: Mode BOTH (Terima semua)
  const bothLong = evaluateTradeDirection("LONG", "BOTH");
  assert.strictEqual(bothLong.allowed, true);
  console.log("  ✅ [PASS] Mode BOTH menerima sinyal LONG");

  const bothShort = evaluateTradeDirection("SHORT", "BOTH");
  assert.strictEqual(bothShort.allowed, true);
  console.log("  ✅ [PASS] Mode BOTH menerima sinyal SHORT");

  // Kasus 2: Mode LONG_ONLY
  const longOnlyPass = evaluateTradeDirection("LONG", "LONG_ONLY");
  assert.strictEqual(longOnlyPass.allowed, true);
  console.log("  ✅ [PASS] Mode LONG_ONLY menerima sinyal LONG");

  const longOnlyBlock = evaluateTradeDirection("SHORT", "LONG_ONLY");
  assert.strictEqual(longOnlyBlock.allowed, false);
  console.log("  ✅ [PASS] Mode LONG_ONLY memblokir sinyal SHORT");

  // Kasus 3: Mode SHORT_ONLY
  const shortOnlyPass = evaluateTradeDirection("SHORT", "SHORT_ONLY");
  assert.strictEqual(shortOnlyPass.allowed, true);
  console.log("  ✅ [PASS] Mode SHORT_ONLY menerima sinyal SHORT");

  const shortOnlyBlock = evaluateTradeDirection("LONG", "SHORT_ONLY");
  assert.strictEqual(shortOnlyBlock.allowed, false);
  console.log("  ✅ [PASS] Mode SHORT_ONLY memblokir sinyal LONG");

  console.log(
    "\n================================================================",
  );
  console.log(
    "📊 HASIL PENGUJIAN: 6 / 6 TEST FILTER ARAH BERHASIL (100% PASS)",
  );
  console.log(
    "================================================================\n",
  );
}

runDirectionFilterTests().catch(console.error);
