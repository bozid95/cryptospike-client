import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Client hanya mengelola posisi yang DIBUKA Client (bukan posisi manual pengguna), kredensial selalu dibaca
 * dengan aturan per environment, dan koneksi WebSocket lama tidak tertinggal setelah konfigurasi berubah.
 * Jalankan: npx tsx --test tests/owned-positions-and-credentials.test.ts
 */
const tmpFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "owned-pos-")),
  "owned_positions.json",
);
process.env.OWNED_POSITIONS_PATH = tmpFile;

import {
  markOwnedPosition,
  getOwnedPosition,
  isOwnedPosition,
  releaseOwnedPosition,
  listOwnedPositions,
  resetOwnedPositionsCache,
} from "../src/lib/owned-positions";
import { resolveBinanceCredentials } from "../src/lib/binance-credentials";
import { BinanceEnvironmentStream } from "../src/services/binance-ws.service";

const reset = () => {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  resetOwnedPositionsCache();
};

describe("owned positions registry", () => {
  beforeEach(reset);

  test("marks, reads, lists and releases per environment", () => {
    markOwnedPosition({ env: "LIVE", symbol: "XRPUSDT", side: "SHORT", entryPrice: 1.0443, quantity: 50, openedAt: 1000 });
    markOwnedPosition({ env: "TESTNET", symbol: "XRPUSDT", side: "LONG", entryPrice: 1, quantity: 5, openedAt: 2000 });
    assert.equal(isOwnedPosition("LIVE", "XRPUSDT"), true);
    assert.equal(isOwnedPosition("LIVE", "MAGMAUSDT"), false);
    assert.equal(getOwnedPosition("TESTNET", "XRPUSDT")?.side, "LONG");
    assert.equal(listOwnedPositions("LIVE").length, 1);
    releaseOwnedPosition("LIVE", "XRPUSDT");
    assert.equal(isOwnedPosition("LIVE", "XRPUSDT"), false);
    assert.equal(isOwnedPosition("TESTNET", "XRPUSDT"), true);
  });

  test("survives a restart (persisted to file, openedAt kept)", () => {
    markOwnedPosition({ env: "LIVE", symbol: "UNIUSDT", side: "SHORT", entryPrice: 6.454, quantity: 7, openedAt: 12345 });
    resetOwnedPositionsCache();
    assert.equal(getOwnedPosition("LIVE", "UNIUSDT")?.openedAt, 12345);
  });
});

describe("credential resolution", () => {
  test("environment-specific key wins over the legacy key", () => {
    const c = resolveBinanceCredentials(
      { liveApiKey: " new ", liveApiSecret: "s", liveAutoExecute: true, apiKey: "old", apiSecret: "old", environment: "LIVE" },
      "LIVE",
    );
    assert.deepEqual(c, { apiKey: "new", apiSecret: "s", autoExecute: true });
  });

  test("legacy key is used only when the legacy environment matches", () => {
    const cfg = { apiKey: "legacy", apiSecret: "ls", environment: "TESTNET", autoExecute: true };
    assert.equal(resolveBinanceCredentials(cfg, "LIVE"), null);
    assert.equal(resolveBinanceCredentials(cfg, "TESTNET")?.apiKey, "legacy");
  });

  test("returns null when the key or secret was removed", () => {
    assert.equal(resolveBinanceCredentials({ liveApiKey: "k", liveApiSecret: null }, "LIVE"), null);
    assert.equal(resolveBinanceCredentials(null, "LIVE"), null);
  });
});

describe("WebSocket stream only manages Client-opened positions", () => {
  beforeEach(reset);

  const accountUpdate = (symbol: string, amt: string) =>
    JSON.stringify({ e: "ACCOUNT_UPDATE", a: { B: [], P: [{ s: symbol, pa: amt, ep: "1.0", up: "0", ps: "BOTH" }] } });

  test("a manual position is shown but not tracked for Auto-BEP / cleanup", () => {
    const s = new BinanceEnvironmentStream("LIVE");
    s.handleWsMessage(accountUpdate("MAGMAUSDT", "-22"), "k", "s");
    assert.equal(s.getPositions().length, 1);
    assert.equal((s as any).monitoredWsPositions.has("MAGMAUSDT"), false);
  });

  test("a manual exit fill does not trigger Auto-BEP", () => {
    const s = new BinanceEnvironmentStream("LIVE");
    s.handleWsMessage(accountUpdate("MAGMAUSDT", "-22"), "k", "s");
    s.handleWsMessage(JSON.stringify({ e: "ORDER_TRADE_UPDATE", o: { s: "MAGMAUSDT", X: "FILLED", R: true, ot: "LIMIT" } }), "k", "s");
    assert.equal((s as any).monitoredWsPositions.size, 0);
  });

  test("a Client-opened position is tracked with its persisted entry time", () => {
    markOwnedPosition({ env: "LIVE", symbol: "XRPUSDT", side: "SHORT", entryPrice: 1.0443, quantity: 480, openedAt: 777 });
    const s = new BinanceEnvironmentStream("LIVE");
    s.handleWsMessage(accountUpdate("XRPUSDT", "-480"), "k", "s");
    const tracked = (s as any).monitoredWsPositions.get("XRPUSDT");
    assert.ok(tracked);
    assert.equal(tracked.openedAt, 777);
    assert.equal(tracked.entryPrice, 1.0443);
  });

  test("ownership is per environment (TESTNET record does not make LIVE position owned)", () => {
    markOwnedPosition({ env: "TESTNET", symbol: "XRPUSDT", side: "SHORT", entryPrice: 1, quantity: 1, openedAt: 1 });
    const s = new BinanceEnvironmentStream("LIVE");
    s.handleWsMessage(accountUpdate("XRPUSDT", "-1"), "k", "s");
    assert.equal((s as any).monitoredWsPositions.has("XRPUSDT"), false);
  });
});

describe("WebSocket connection generations", () => {
  test("stop() terminates the old socket, removes its listeners and bumps the generation", async () => {
    const s = new BinanceEnvironmentStream("LIVE");
    let terminated = false;
    let removed = false;
    const fakeWs = {
      removeAllListeners: () => { removed = true; },
      on: () => fakeWs,
      terminate: () => { terminated = true; },
    };
    (s as any).wsClient = fakeWs;
    const before = (s as any).generation;
    await s.stop();
    assert.equal(terminated, true);
    assert.equal(removed, true);
    assert.equal((s as any).wsClient, null);
    assert.ok((s as any).generation > before);
  });
});
