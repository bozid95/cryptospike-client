import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { app } from "../src/app";
import { signJWT } from "../src/lib/jwt";

describe("Express App Modular Routing Integration Tests", () => {
  let server: http.Server;
  let baseUrl: string;
  let validToken: string;

  before(async () => {
    validToken = signJWT({ userId: "1", username: "admin", role: "Admin" });

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe("1. GET /api/status", () => {
    it("harus merespons status OK dan info server URL", async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.status, "ok");
      assert.equal(typeof data.bot_connected, "boolean");
      assert.ok(data.server_url);
    });
  });

  describe("2. Auth Routes (/api/auth)", () => {
    it("GET /api/auth/status harus mengembalikan status inisialisasi", async () => {
      const res = await fetch(`${baseUrl}/api/auth/status`);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(typeof data.initialized, "boolean");
    });

    it("POST /api/auth/login dengan body kosong harus mengembalikan 400", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.message.includes("wajib diisi"));
    });

    it("POST /api/auth/change-password tanpa token harus mengembalikan 401", async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "a", newPassword: "b" }),
      });

      assert.equal(res.status, 401);
    });
  });

  describe("3. Config Routes (/api/config)", () => {
    it("GET /api/config tanpa auth harus ditolak dengan 401", async () => {
      const res = await fetch(`${baseUrl}/api/config`);
      assert.equal(res.status, 401);
    });

    it("GET /api/config dengan token JWT valid harus mengembalikan konfigurasi", async () => {
      const res = await fetch(`${baseUrl}/api/config`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data !== undefined);
    });

    it("POST /api/config/test-connection tanpa API key harus mengembalikan 400", async () => {
      const res = await fetch(`${baseUrl}/api/config/test-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ apiKey: "", apiSecret: "" }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });
  });

  describe("4. Positions Routes (/api/positions)", () => {
    it("GET /api/positions tanpa auth harus ditolak dengan 401", async () => {
      const res = await fetch(`${baseUrl}/api/positions`);
      assert.equal(res.status, 401);
    });

    it("POST /api/positions/close tanpa symbol harus mengembalikan 400", async () => {
      const res = await fetch(`${baseUrl}/api/positions/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 400);
    });
  });

  describe("5. Logs Routes (/api/logs)", () => {
    it("GET /api/logs tanpa auth harus ditolak dengan 401", async () => {
      const res = await fetch(`${baseUrl}/api/logs`);
      assert.equal(res.status, 401);
    });

    it("GET /api/logs dengan token JWT valid harus berhasil", async () => {
      const res = await fetch(`${baseUrl}/api/logs`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.logs));
    });

    it("DELETE /api/logs dengan token JWT valid harus membersihkan log", async () => {
      const res = await fetch(`${baseUrl}/api/logs`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });
  });
});
