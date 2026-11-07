import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createSignalExecutionGuard,
  signalIdOf,
} from "../src/exchanges/binance/signal-execution-guard";

/**
 * Pengaman eksekusi ganda: ID sinyal sekali per environment + kunci per simbol (anti race condition).
 * Jalankan: npx tsx --test tests/signal-execution-guard.test.ts
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmpFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sig-guard-")), "processed.json");
const sig = (id: string | undefined, symbol = "BTCUSDT") => ({
  id,
  symbol,
  side: "SHORT",
  entryPrice: 100,
});

describe("signalIdOf", () => {
  test("membaca id / signalId, kosong → null", () => {
    assert.equal(signalIdOf({ id: "abc" }), "abc");
    assert.equal(signalIdOf({ signalId: 42 }), "42");
    assert.equal(signalIdOf({ id: "  " }), null);
    assert.equal(signalIdOf({}), null);
  });
});

describe("dedupe ID sinyal", () => {
  test("sinyal sama datang 2x bersamaan → order hanya 1x (race condition)", async () => {
    const g = createSignalExecutionGuard();
    let calls = 0;
    const exec = async () => {
      calls++;
      await sleep(30); // cek posisi + kirim order
      return "filled";
    };
    const [a, b] = await Promise.all([
      g.run("TESTNET", sig("s1"), exec),
      g.run("TESTNET", sig("s1"), exec),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(a, { ran: true, value: "filled" });
    assert.equal(b.ran, false);
    if (!b.ran) assert.match(b.reason, /duplicate signal s1/);
  });

  test("sinyal sama datang lagi setelah selesai (replay) → ditolak", async () => {
    const g = createSignalExecutionGuard();
    let calls = 0;
    await g.run("LIVE", sig("s2"), async () => calls++);
    const again = await g.run("LIVE", sig("s2"), async () => calls++);
    assert.equal(calls, 1);
    assert.equal(again.ran, false);
  });

  test("TESTNET dan LIVE independen: sinyal sama dieksekusi di keduanya", async () => {
    const g = createSignalExecutionGuard();
    const envs: string[] = [];
    await g.run("TESTNET", sig("s3"), async () => envs.push("TESTNET"));
    await g.run("LIVE", sig("s3"), async () => envs.push("LIVE"));
    assert.deepEqual(envs, ["TESTNET", "LIVE"]);
  });

  test("environment tidak peka huruf besar/kecil", async () => {
    const g = createSignalExecutionGuard();
    await g.run("testnet", sig("s4"), async () => 1);
    assert.equal((await g.run("TESTNET", sig("s4"), async () => 1)).ran, false);
  });

  test("eksekusi gagal (throw) → ID tetap tercatat, kunci simbol dilepas", async () => {
    const g = createSignalExecutionGuard();
    await assert.rejects(
      g.run("TESTNET", sig("s5"), async () => {
        throw new Error("binance down");
      }),
      /binance down/,
    );
    assert.equal((await g.run("TESTNET", sig("s5"), async () => 1)).ran, false);
    // sinyal lain di simbol yang sama tidak macet
    const next = await g.run("TESTNET", sig("s6"), async () => "ok");
    assert.deepEqual(next, { ran: true, value: "ok" });
  });

  test("sinyal tanpa ID tidak di-dedupe (tetap lewat kunci simbol)", async () => {
    const g = createSignalExecutionGuard();
    let calls = 0;
    await g.run("TESTNET", sig(undefined), async () => calls++);
    await g.run("TESTNET", sig(undefined), async () => calls++);
    assert.equal(calls, 2);
  });

  test("ID kedaluwarsa setelah TTL", async () => {
    let now = 1_000_000;
    const g = createSignalExecutionGuard({ ttlMs: 60_000, now: () => now });
    await g.run("TESTNET", sig("s7"), async () => 1);
    now += 30_000;
    assert.equal(g.hasProcessed("TESTNET", "s7"), true);
    now += 31_000;
    assert.equal(g.hasProcessed("TESTNET", "s7"), false);
    assert.equal((await g.run("TESTNET", sig("s7"), async () => 1)).ran, true);
  });
});

describe("persistensi (tahan restart app client)", () => {
  test("ID yang sudah dieksekusi tetap ditolak setelah restart", async () => {
    const file = tmpFile();
    const before = createSignalExecutionGuard({ storePath: file });
    await before.run("LIVE", sig("s8"), async () => 1);
    const after = createSignalExecutionGuard({ storePath: file }); // simulasi restart
    let calls = 0;
    const res = await after.run("LIVE", sig("s8"), async () => calls++);
    assert.equal(res.ran, false);
    assert.equal(calls, 0);
    assert.equal((await after.run("TESTNET", sig("s8"), async () => 1)).ran, true);
  });

  test("ID kedaluwarsa dibuang saat load", async () => {
    const file = tmpFile();
    let now = 5_000_000;
    const a = createSignalExecutionGuard({ storePath: file, ttlMs: 1000, now: () => now });
    await a.run("LIVE", sig("s9"), async () => 1);
    now += 2000;
    const b = createSignalExecutionGuard({ storePath: file, ttlMs: 1000, now: () => now });
    assert.equal(b.hasProcessed("LIVE", "s9"), false);
  });

  test("file rusak → mulai kosong, tidak crash", async () => {
    const file = tmpFile();
    fs.writeFileSync(file, "{bukan json");
    const g = createSignalExecutionGuard({ storePath: file });
    assert.equal((await g.run("LIVE", sig("s10"), async () => "ok")).ran, true);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf-8"))["LIVE:s10"] > 0, true);
  });
});

describe("kunci per simbol (cek posisi → order tidak balapan)", () => {
  test("2 sinyal berbeda di simbol sama dieksekusi berurutan", async () => {
    const g = createSignalExecutionGuard();
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const exec = (name: string) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(20);
      order.push(name);
      active--;
    };
    await Promise.all([
      g.run("TESTNET", sig("a1", "ETHUSDT"), exec("a1")),
      g.run("TESTNET", sig("a2", "ETHUSDT"), exec("a2")),
      g.run("TESTNET", sig("a3", "ethusdt"), exec("a3")),
    ]);
    assert.equal(maxActive, 1);
    assert.deepEqual(order, ["a1", "a2", "a3"]);
  });

  test("simbol berbeda tetap paralel", async () => {
    const g = createSignalExecutionGuard();
    let active = 0;
    let maxActive = 0;
    const exec = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(20);
      active--;
    };
    await Promise.all([
      g.run("TESTNET", sig("b1", "SOLUSDT"), exec),
      g.run("TESTNET", sig("b2", "XRPUSDT"), exec),
    ]);
    assert.equal(maxActive, 2);
  });

  test("simbol sama di TESTNET dan LIVE tidak saling menunggu", async () => {
    const g = createSignalExecutionGuard();
    let active = 0;
    let maxActive = 0;
    const exec = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(20);
      active--;
    };
    await Promise.all([
      g.run("TESTNET", sig("c1", "BNBUSDT"), exec),
      g.run("LIVE", sig("c1", "BNBUSDT"), exec),
    ]);
    assert.equal(maxActive, 2);
  });
});
