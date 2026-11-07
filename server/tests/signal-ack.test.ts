import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { deriveExecutionOutcome } from "../src/exchanges/binance/execution-outcome";
import { addAppLog, captureAppLogs, AppLogItem } from "../src/lib/logger";
import { executeSignalOrder } from "../src/exchanges/binance/orders";
import * as svc from "../src/services/socket.service";

/**
 * ACK status pengiriman sinyal ke Signal Server.
 * Jalankan: npx tsx --test tests/signal-ack.test.ts
 */
process.env.SIGNAL_DEDUPE_FILE = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "sig-ack-")),
  "processed.json",
);

const log = (level: AppLogItem["level"], message: string): AppLogItem => ({
  id: message,
  timestamp: "",
  level,
  source: "Executor",
  message,
});

describe("deriveExecutionOutcome", () => {
  test("entry terisi → EXECUTED", () => {
    assert.deepEqual(
      deriveExecutionOutcome([
        log("INFO", "Received signal"),
        log("SUCCESS", "Entry Order Succeeded! ID: 1 | BTCUSDT SHORT 0.01"),
      ]),
      { status: "EXECUTED" },
    );
  });

  test("entry terisi tapi TP gagal → EXECUTED + alasan error", () => {
    const o = deriveExecutionOutcome([
      log("SUCCESS", "Entry Order Succeeded! ID: 1"),
      log("ERROR", "Failed to place TP1"),
    ]);
    assert.deepEqual(o, { status: "EXECUTED", reason: "Failed to place TP1" });
  });

  test("error tanpa entry → FAILED", () => {
    assert.deepEqual(
      deriveExecutionOutcome([
        log("WARN", "something"),
        log("ERROR", "Signal execution failed for PUMPUSDT: Invalid symbol status"),
      ]),
      { status: "FAILED", reason: "Signal execution failed for PUMPUSDT: Invalid symbol status" },
    );
  });

  test("tanpa order → SKIPPED dengan peringatan terakhir", () => {
    assert.deepEqual(
      deriveExecutionOutcome([
        log("WARN", "first warning"),
        log("WARN", "Entry guard: mark price deviates 0.62R"),
      ]),
      { status: "SKIPPED", reason: "Entry guard: mark price deviates 0.62R" },
    );
    assert.deepEqual(deriveExecutionOutcome([]), {
      status: "SKIPPED",
      reason: "No order placed",
    });
  });

  test("alasan dipotong 300 karakter", () => {
    const o = deriveExecutionOutcome([log("ERROR", "x".repeat(900))]);
    assert.equal(o.reason?.length, 300);
  });
});

describe("captureAppLogs", () => {
  test("log eksekusi paralel tidak tercampur", async () => {
    const run = (name: string, delay: number) =>
      captureAppLogs(async () => {
        addAppLog("INFO", "Test", `${name}-1`);
        await new Promise((r) => setTimeout(r, delay));
        addAppLog("INFO", "Test", `${name}-2`);
      });
    const [a, b] = await Promise.all([run("A", 20), run("B", 5)]);
    assert.deepEqual(a.logs.map((l) => l.message), ["A-1", "A-2"]);
    assert.deepEqual(b.logs.map((l) => l.message), ["B-1", "B-2"]);
  });
});

describe("executeSignalOrder mengembalikan hasil untuk ACK", () => {
  test("autoExecute off → SKIPPED + alasan; salinan → SKIPPED duplicate", async () => {
    const signal = {
      id: `ack-${Date.now()}`,
      symbol: `ACK${Date.now()}USDT`,
      side: "SHORT",
      entryPrice: 1,
      sl: 1.05,
    };
    const cfg = { autoExecute: false, environment: "TESTNET" } as any;
    const first = await executeSignalOrder(signal, cfg);
    assert.equal(first.status, "SKIPPED");
    assert.match(first.reason ?? "", /AutoExecute is disabled/);
    const dup = await executeSignalOrder(signal, cfg);
    assert.equal(dup.status, "SKIPPED");
    assert.match(dup.reason ?? "", /duplicate signal/);
  });
});

describe("sendSignalAck", () => {
  class FakeSocket extends EventEmitter {
    active = true;
    sent: Array<[string, any]> = [];
    override emit(event: string, ...args: any[]): boolean {
      if (event === "signal_ack") {
        this.sent.push([event, args[0]]);
        return true;
      }
      return super.emit(event, ...args);
    }
    disconnect() {
      this.active = false;
      return this;
    }
  }
  let fake: FakeSocket;

  before(async () => {
    svc.setSocketFactoryForTests(() => (fake = new FakeSocket()) as any);
    svc.disconnectSocket();
    await svc.connectToNestJS("token-ack");
  });
  after(() => {
    svc.disconnectSocket();
    svc.setSocketFactoryForTests(null);
    delete process.env.SIGNAL_ACK_ENABLED;
  });

  test("mengirim ACK RECEIVED & RESULT ke server", () => {
    assert.equal(svc.sendSignalAck({ signalId: "s1", stage: "RECEIVED" }), true);
    assert.equal(
      svc.sendSignalAck({
        signalId: "s1",
        stage: "RESULT",
        environment: "LIVE",
        status: "SKIPPED",
        reason: "r".repeat(500),
      }),
      true,
    );
    assert.deepEqual(fake.sent[0], ["signal_ack", { signalId: "s1", stage: "RECEIVED" }]);
    const result = fake.sent[1]![1];
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.environment, "LIVE");
    assert.equal(result.reason.length, 300);
  });

  test("tanpa ID sinyal → tidak dikirim", () => {
    const before = fake.sent.length;
    assert.equal(svc.sendSignalAck({ signalId: null, stage: "RECEIVED" }), false);
    assert.equal(fake.sent.length, before);
  });

  test("SIGNAL_ACK_ENABLED=false → tidak dikirim (opt-out privasi)", () => {
    process.env.SIGNAL_ACK_ENABLED = "false";
    const before = fake.sent.length;
    assert.equal(svc.sendSignalAck({ signalId: "s2", stage: "RECEIVED" }), false);
    assert.equal(fake.sent.length, before);
    delete process.env.SIGNAL_ACK_ENABLED;
  });
});
