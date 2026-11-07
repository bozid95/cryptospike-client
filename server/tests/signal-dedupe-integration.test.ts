import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { executeSignalOrder } from "../src/exchanges/binance/orders";
import { getAppLogs } from "../src/lib/logger";
import * as svc from "../src/services/socket.service";

/**
 * Integrasi: executeSignalOrder (dedupe) & satu koneksi socket sinyal.
 * Jalankan: npx tsx --test tests/signal-dedupe-integration.test.ts
 */
const dedupeDir = fs.mkdtempSync(path.join(os.tmpdir(), "sig-dedupe-"));
process.env.SIGNAL_DEDUPE_FILE = path.join(dedupeDir, "processed.json");

class FakeSocket extends EventEmitter {
  active = true;
  connected = false;
  recovered = false;
  disconnects = 0;
  constructor(public readonly token: string) {
    super();
  }
  disconnect() {
    this.disconnects++;
    this.active = false;
    this.connected = false;
    return this;
  }
}

describe("executeSignalOrder: sinyal yang sama tidak dieksekusi dua kali", () => {
  test("broadcast + replay bersamaan → hanya diproses sekali per environment", async () => {
    // Simbol unik per run: buffer log memuat riwayat run sebelumnya
    const symbol = `DEDUPE${Date.now()}USDT`;
    const signal = {
      id: `dup-${Date.now()}`,
      symbol,
      side: "SHORT",
      entryPrice: 1,
      sl: 1.05,
      tp1: 0.95,
      strategy: "pa_donchian_v1",
    };
    // autoExecute=false: eksekutor berhenti sebelum memanggil Binance
    const config = { autoExecute: false, environment: "TESTNET" } as any;
    await Promise.all([
      executeSignalOrder(signal, config),
      executeSignalOrder(signal, config),
    ]);
    await executeSignalOrder(signal, config); // replay belakangan
    await executeSignalOrder(signal, { ...config, environment: "LIVE" });

    const logs = getAppLogs().filter((l) => l.message.includes(symbol));
    const received = logs.filter((l) => l.message.startsWith("Received signal"));
    const dupes = logs.filter((l) => /duplicate signal .* already processed on TESTNET/.test(l.message));
    assert.equal(received.length, 2, "1x TESTNET + 1x LIVE");
    assert.equal(dupes.length, 2, "2 salinan TESTNET ditolak");
  });
});

describe("connectToNestJS: hanya satu koneksi sinyal", () => {
  let created: FakeSocket[] = [];

  before(() => {
    svc.setSocketFactoryForTests((_url, opts: any) => {
      const s = new FakeSocket(opts?.auth?.token);
      created.push(s);
      return s as any;
    });
  });
  after(() => {
    svc.disconnectSocket();
    svc.setSocketFactoryForTests(null);
  });

  test("simpan config dengan token sama → koneksi tidak dibuat ulang", async () => {
    created = [];
    svc.disconnectSocket();
    await svc.connectToNestJS("token-A");
    await svc.connectToNestJS("token-A");
    await svc.connectToNestJS("token-A");
    assert.equal(created.length, 1);
    assert.equal(created[0]!.disconnects, 0);
  });

  test("token berubah → socket lama ditutup & tidak lagi menerima sinyal", async () => {
    created = [];
    svc.disconnectSocket();
    await svc.connectToNestJS("token-A");
    await svc.connectToNestJS("token-B");
    assert.equal(created.length, 2);
    const [oldS, newS] = created;
    assert.equal(oldS!.disconnects, 1);
    assert.equal(oldS!.listenerCount("new_signal"), 0, "socket lama tanpa handler sinyal");
    assert.equal(newS!.listenerCount("new_signal"), 1, "tepat satu handler sinyal");
    assert.equal(newS!.token, "token-B");
  });

  test("socket mati permanen (server disconnect) → boleh dibuat ulang walau token sama", async () => {
    created = [];
    svc.disconnectSocket();
    await svc.connectToNestJS("token-A");
    created[0]!.active = false; // tidak akan auto-reconnect
    await svc.connectToNestJS("token-A");
    assert.equal(created.length, 2);
  });

  test("connect saat start (baca DB) + simpan config bersamaan → hanya 1 socket aktif", async () => {
    created = [];
    svc.disconnectSocket();
    const startup = svc.connectToNestJS(); // menunggu DB
    const save = svc.connectToNestJS("token-C"); // menang (terbaru)
    await Promise.all([startup, save]);
    const live = created.filter((s) => s.active);
    assert.equal(live.length, 1);
    assert.equal(live[0]!.token, "token-C");
    assert.equal(created.filter((s) => s.listenerCount("new_signal") > 0).length, 1);
  });

  test("disconnectSocket membatalkan connect yang masih menunggu DB", async () => {
    created = [];
    svc.disconnectSocket();
    const pending = svc.connectToNestJS();
    svc.disconnectSocket();
    await pending;
    assert.equal(created.filter((s) => s.active).length, 0);
  });
});
