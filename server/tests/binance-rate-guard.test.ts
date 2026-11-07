import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BinanceRateGuard,
  recordExchangeInfoRateLimits,
} from "../src/exchanges/binance/rate-guard";

/**
 * Rem weight per host: mainnet 2400/menit, testnet 6000/menit (exchangeInfo.rateLimits).
 * Jalankan: npx tsx --test tests/binance-rate-guard.test.ts
 */
const TESTNET = "testnet.binancefuture.com";
const LIVE = "fapi.binance.com";
const T0 = 1_794_060_000_000; // awal menit

describe("BinanceRateGuard weight limit per host", () => {
  test("testnet: 2700 weight tidak mengerem (limit 6000, rem di 4500)", () => {
    const g = new BinanceRateGuard(() => T0 + 1000);
    assert.equal(g.weightLimit(TESTNET), 6000);
    assert.equal(g.softLimit(TESTNET), 4500);
    assert.equal(g.recordWeight(TESTNET, "2700"), false);
    assert.equal(g.check(TESTNET, "normal"), null);
  });

  test("testnet: >= 4500 mengerem request normal, request critical tetap jalan", () => {
    const g = new BinanceRateGuard(() => T0 + 1000);
    assert.equal(g.recordWeight(TESTNET, "4600"), true);
    const block = g.check(TESTNET, "normal");
    assert.ok(block);
    assert.equal(block!.until, T0 + 60_000);
    assert.match(block!.reason, /4600\/6000/);
    assert.equal(g.check(TESTNET, "critical"), null);
  });

  test("mainnet tidak berubah: rem di 1800/2400", () => {
    const g = new BinanceRateGuard(() => T0 + 1000);
    assert.equal(g.softLimit(LIVE), 1800);
    assert.equal(g.recordWeight(LIVE, "1799"), false);
    assert.equal(g.check(LIVE, "normal"), null);
    assert.equal(g.recordWeight(LIVE, "1800"), true);
    assert.ok(g.check(LIVE, "normal"));
  });

  test("host tak dikenal memakai default 2400", () => {
    const g = new BinanceRateGuard(() => T0);
    assert.equal(g.weightLimit("other.example"), 2400);
  });

  test("rem hanya berlaku di menit yang sama", () => {
    let now = T0 + 1000;
    const g = new BinanceRateGuard(() => now);
    g.recordWeight(TESTNET, "5000");
    assert.ok(g.check(TESTNET, "normal"));
    now = T0 + 61_000;
    assert.equal(g.check(TESTNET, "normal"), null);
  });
});

describe("recordExchangeInfoRateLimits", () => {
  const rateLimits = [
    { rateLimitType: "REQUEST_WEIGHT", interval: "MINUTE", intervalNum: 1, limit: 6000 },
    { rateLimitType: "ORDERS", interval: "MINUTE", intervalNum: 1, limit: 1200 },
  ];

  test("memperbarui limit host dari REQUEST_WEIGHT per 1 menit", () => {
    const g = new BinanceRateGuard(() => T0);
    recordExchangeInfoRateLimits("https://other.example/fapi/v1/exchangeInfo", rateLimits, g);
    assert.equal(g.weightLimit("other.example"), 6000);
    assert.equal(g.softLimit("other.example"), 4500);
  });

  test("data tidak valid diabaikan", () => {
    const g = new BinanceRateGuard(() => T0);
    recordExchangeInfoRateLimits("https://fapi.binance.com", undefined, g);
    recordExchangeInfoRateLimits("https://fapi.binance.com", [{ rateLimitType: "ORDERS", interval: "MINUTE", intervalNum: 1, limit: 1200 }], g);
    recordExchangeInfoRateLimits("https://fapi.binance.com", [{ rateLimitType: "REQUEST_WEIGHT", interval: "MINUTE", intervalNum: 1, limit: "x" }], g);
    assert.equal(g.weightLimit(LIVE), 2400);
  });
});
