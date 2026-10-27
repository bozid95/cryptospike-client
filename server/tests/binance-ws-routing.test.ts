import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getMarketWsUrl,
  getUserDataWsUrl,
  isMarketStreamStale,
  isStreamHealthy,
  shouldRunMonitorCycle,
  MARKET_STALE_MS,
  MONITOR_SAFETY_INTERVAL_MS,
} from "../src/services/binance-stream-health";
import { createBreakEvenGuard } from "../src/exchanges/binance/orders";

/**
 * Routing WebSocket Binance (LIVE wajib /market & /private sejak 2026-04-23),
 * kesehatan stream, keputusan monitor REST, dan guard Auto-BEP anti-duplikat.
 * Jalankan: npx tsx --test tests/binance-ws-routing.test.ts
 */

describe("WebSocket URL routing", () => {
  test("LIVE mark price stream uses the routed /market path", () => {
    assert.equal(
      getMarketWsUrl(false),
      "wss://fstream.binance.com/market/ws/!markPrice@arr@1s",
    );
  });

  test("LIVE user data stream uses the routed /private path", () => {
    assert.equal(
      getUserDataWsUrl(false, "abc123"),
      "wss://fstream.binance.com/private/ws/abc123",
    );
  });

  test("TESTNET streams keep the testnet legacy base", () => {
    assert.equal(
      getMarketWsUrl(true),
      "wss://stream.binancefuture.com/ws/!markPrice@arr@1s",
    );
    assert.equal(
      getUserDataWsUrl(true, "k"),
      "wss://stream.binancefuture.com/ws/k",
    );
  });

  test("LIVE never uses the retired unrouted URL or the testnet domain", () => {
    for (const url of [getMarketWsUrl(false), getUserDataWsUrl(false, "k")]) {
      assert.doesNotMatch(url, /fstream\.binance\.com\/ws\//);
      assert.doesNotMatch(url, /binancefuture\.com/);
    }
  });

  test("TESTNET never points at the LIVE host", () => {
    for (const url of [getMarketWsUrl(true), getUserDataWsUrl(true, "k")]) {
      assert.doesNotMatch(url, /fstream\.binance\.com/);
    }
  });
});

describe("Mark price stream watchdog", () => {
  const T0 = 1_000_000;

  test("a closed stream (connectedAt 0) is never stale", () => {
    assert.equal(isMarketStreamStale(0, 0, T0 + 10 * MARKET_STALE_MS), false);
  });

  test("connected without any data: stale only after the timeout", () => {
    assert.equal(isMarketStreamStale(T0, 0, T0 + MARKET_STALE_MS - 1), false);
    assert.equal(isMarketStreamStale(T0, 0, T0 + MARKET_STALE_MS), true);
  });

  test("receiving data keeps the stream alive", () => {
    assert.equal(isMarketStreamStale(T0, T0 + 50_000, T0 + 60_000), false);
  });

  test("data that stopped flowing becomes stale", () => {
    const last = T0 + 5_000;
    assert.equal(isMarketStreamStale(T0, last, last + MARKET_STALE_MS), true);
  });
});

describe("Stream health (used to skip the REST monitor)", () => {
  const now = 2_000_000;

  test("user stream open + fresh market data → healthy", () => {
    assert.equal(isStreamHealthy(true, now - 1_000, now), true);
  });

  test("open but never received data (silent unrouted URL) → unhealthy", () => {
    assert.equal(isStreamHealthy(true, 0, now), false);
  });

  test("open but market data went stale → unhealthy", () => {
    assert.equal(isStreamHealthy(true, now - MARKET_STALE_MS, now), false);
  });

  test("user stream closed → unhealthy even with fresh market data", () => {
    assert.equal(isStreamHealthy(false, now - 1_000, now), false);
  });
});

describe("REST monitor cycle decision", () => {
  const now = 3_000_000;

  test("unhealthy stream → monitor runs every cycle", () => {
    assert.equal(shouldRunMonitorCycle(false, now - 1, now), true);
    assert.equal(shouldRunMonitorCycle(false, now, now), true);
  });

  test("healthy stream → monitor skipped within the safety interval", () => {
    assert.equal(shouldRunMonitorCycle(true, now - 30_000, now), false);
  });

  test("healthy stream → monitor still runs as a safety net", () => {
    assert.equal(
      shouldRunMonitorCycle(true, now - MONITOR_SAFETY_INTERVAL_MS, now),
      true,
    );
    assert.equal(shouldRunMonitorCycle(true, 0, now), true); // run pertama
  });
});

describe("Auto-BEP guard (WebSocket + REST monitor)", () => {
  type Call = { symbol: string; side: string; entry: number; testnet: boolean };

  function fakeRunner(results: Array<boolean | Error> = [true], delayMs = 5) {
    const calls: Call[] = [];
    const run = async (
      _k: string,
      _s: string,
      symbol: string,
      side: "LONG" | "SHORT",
      entry: number,
      testnet: boolean,
      _buf?: number,
    ): Promise<boolean> => {
      calls.push({ symbol, side, entry, testnet });
      await new Promise((r) => setTimeout(r, delayMs));
      const r = results.length > 1 ? results.shift()! : results[0]!;
      if (r instanceof Error) throw r;
      return r;
    };
    return { run, calls };
  }

  test("concurrent calls for the same position share one execution", async () => {
    const { run, calls } = fakeRunner([true]);
    const g = createBreakEvenGuard(run);
    const [a, b] = await Promise.all([
      g.move("k", "s", "DOTUSDT", "SHORT", 0.9838, false),
      g.move("k", "s", "DOTUSDT", "SHORT", 0.9838, false),
    ]);
    assert.equal(calls.length, 1);
    assert.equal(a, true);
    assert.equal(b, true);
  });

  test("after success the same entry is not moved again", async () => {
    const { run, calls } = fakeRunner([true]);
    const g = createBreakEvenGuard(run);
    await g.move("k", "s", "DOTUSDT", "SHORT", 0.9838, false);
    assert.equal(await g.move("k", "s", "DOTUSDT", "SHORT", 0.9838, false), true);
    assert.equal(calls.length, 1);
  });

  test("a new position (different entry) on the same symbol runs again", async () => {
    const { run, calls } = fakeRunner([true]);
    const g = createBreakEvenGuard(run);
    await g.move("k", "s", "DOTUSDT", "SHORT", 0.9838, false);
    await g.move("k", "s", "DOTUSDT", "SHORT", 0.95, false);
    assert.equal(calls.length, 2);
  });

  test("a failed attempt is not recorded and can be retried", async () => {
    const { run, calls } = fakeRunner([false, true]);
    const g = createBreakEvenGuard(run);
    assert.equal(await g.move("k", "s", "UBUSDT", "SHORT", 0.11671, false), false);
    assert.equal(await g.move("k", "s", "UBUSDT", "SHORT", 0.11671, false), true);
    assert.equal(calls.length, 2);
  });

  test("a thrown error clears the in-flight lock", async () => {
    const { run, calls } = fakeRunner([new Error("network"), true]);
    const g = createBreakEvenGuard(run);
    await assert.rejects(g.move("k", "s", "UBUSDT", "SHORT", 0.11671, false));
    assert.equal(await g.move("k", "s", "UBUSDT", "SHORT", 0.11671, false), true);
    assert.equal(calls.length, 2);
  });

  test("clear() after the position closes allows BEP for the same entry again", async () => {
    const { run, calls } = fakeRunner([true]);
    const g = createBreakEvenGuard(run);
    await g.move("k", "s", "SOLUSDT", "LONG", 150, false);
    g.clear("LIVE", "SOLUSDT");
    await g.move("k", "s", "SOLUSDT", "LONG", 150, false);
    assert.equal(calls.length, 2);
  });

  test("clear() on another environment does not reset LIVE state", async () => {
    const { run, calls } = fakeRunner([true]);
    const g = createBreakEvenGuard(run);
    await g.move("k", "s", "SOLUSDT", "LONG", 150, false);
    g.clear("TESTNET", "SOLUSDT");
    await g.move("k", "s", "SOLUSDT", "LONG", 150, false);
    assert.equal(calls.length, 1);
  });

  test("environment, symbol and side are independent", async () => {
    const { run, calls } = fakeRunner([true]);
    const g = createBreakEvenGuard(run);
    await Promise.all([
      g.move("k", "s", "SOLUSDT", "LONG", 150, false),
      g.move("k", "s", "SOLUSDT", "LONG", 150, true),
      g.move("k", "s", "SOLUSDT", "SHORT", 150, false),
      g.move("k", "s", "ETHUSDT", "LONG", 150, false),
    ]);
    assert.equal(calls.length, 4);
  });

  test("unknown entry price (0) is never treated as already done", async () => {
    const { run, calls } = fakeRunner([true]);
    const g = createBreakEvenGuard(run);
    await g.move("k", "s", "SOLUSDT", "LONG", 0, false);
    await g.move("k", "s", "SOLUSDT", "LONG", 0, false);
    assert.equal(calls.length, 2);
  });
});
