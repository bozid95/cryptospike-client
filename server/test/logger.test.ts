import test, { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { addAppLog, getAppLogs, clearAppLogs } from "../src/lib/logger";

describe("Logger Module Unit Tests", () => {
  beforeEach(() => {
    clearAppLogs();
  });

  it("harus menambahkan dan membaca log dengan format yang sesuai", () => {
    addAppLog("INFO", "SignalClient", "Test log message 1");

    const logs = getAppLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.level, "INFO");
    assert.equal(logs[0]?.source, "SignalClient");
    assert.equal(logs[0]?.message, "Test log message 1");
    assert.ok(logs[0]?.timestamp);
  });

  it("harus menyortir log terbaru di urutan pertama (LIFO)", () => {
    addAppLog("INFO", "Step1", "First message");
    addAppLog("WARN", "Step2", "Second message");

    const logs = getAppLogs();
    assert.equal(logs.length, 2);
    assert.equal(logs[0]?.message, "Second message");
    assert.equal(logs[1]?.message, "First message");
  });

  it("harus membatasi jumlah log sesuai parameter limit", () => {
    for (let i = 1; i <= 20; i++) {
      addAppLog("INFO", "Loop", `Message ${i}`);
    }

    const limitedLogs = getAppLogs(5);
    assert.equal(limitedLogs.length, 5);
    assert.equal(limitedLogs[0]?.message, "Message 20");
  });

  it("harus mengosongkan semua log saat clearAppLogs dipanggil", () => {
    addAppLog("INFO", "App", "Message to clear");
    assert.equal(getAppLogs().length, 1);

    clearAppLogs();
    assert.equal(getAppLogs().length, 0);
  });
});
