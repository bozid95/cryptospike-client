import test, { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/services/auth.service";
import { signJWT, verifyJWT } from "../src/lib/jwt";
import {
  loginRateLimiter,
  clearRateLimiter,
} from "../src/middlewares/rateLimiter";
import { requireAuth } from "../src/middlewares/auth";
import type { Request, Response, NextFunction } from "express";

describe("Auth Service & Security Unit Tests", () => {
  describe("1. Password Hashing & Verification (scrypt)", () => {
    it("harus menghasilkan hash unik untuk password yang sama (salt acak)", () => {
      const password = "SuperSecretPassword123!";
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);

      assert.notEqual(
        hash1,
        hash2,
        "Dua hash dari password yang sama harus berbeda karena salt acak",
      );
      assert.ok(
        hash1.includes(":"),
        "Format hash harus mengandung delimiter salt:key",
      );
    });

    it("harus berhasil memverifikasi password yang benar", () => {
      const password = "MyAdminSecurePassword!2026";
      const hash = hashPassword(password);

      const isValid = verifyPassword(password, hash);
      assert.equal(isValid, true, "Password benar harus menghasilkan true");
    });

    it("harus menolak password yang salah", () => {
      const password = "CorrectPassword123";
      const hash = hashPassword(password);

      const isWrongValid = verifyPassword("WrongPassword123", hash);
      assert.equal(
        isWrongValid,
        false,
        "Password salah harus menghasilkan false",
      );
    });

    it("harus menolak hash yang korup atau format tidak valid tanpa crash", () => {
      assert.equal(verifyPassword("pwd", "corruptedhashstring"), false);
      assert.equal(verifyPassword("pwd", ""), false);
      assert.equal(verifyPassword("pwd", ":"), false);
    });
  });

  describe("2. JWT Sign & Verification", () => {
    it("harus membuat token valid dan mendecode payload dengan tepat", () => {
      const payload = {
        userId: "1",
        username: "admin_test",
        role: "Admin",
      };

      const token = signJWT(payload);
      assert.ok(typeof token === "string");
      assert.equal(
        token.split(".").length,
        3,
        "JWT harus terdiri dari 3 bagian (header.payload.signature)",
      );

      const decoded = verifyJWT(token);
      assert.ok(decoded !== null);
      assert.equal(decoded?.userId, "1");
      assert.equal(decoded?.username, "admin_test");
      assert.equal(decoded?.role, "Admin");
      assert.ok(decoded?.exp && decoded.exp > Math.floor(Date.now() / 1000));
    });

    it("harus menolak token yang diubah / signature palsu", () => {
      const token = signJWT({ userId: "1", username: "admin", role: "Admin" });
      const parts = token.split(".");
      const forgedToken = `${parts[0]}.${parts[1]}.invalidsignature123`;

      const result = verifyJWT(forgedToken);
      assert.equal(result, null, "Token yang diubah harus ditolak");
    });

    it("harus menolak string token yang tidak valid", () => {
      assert.equal(verifyJWT("invalid.token"), null);
      assert.equal(verifyJWT(""), null);
      assert.equal(verifyJWT("not-a-jwt"), null);
    });
  });

  describe("3. Rate Limiter Middleware", () => {
    beforeEach(() => {
      clearRateLimiter();
    });

    it("harus mengizinkan request di bawah batas maxAttempts", () => {
      let nextCalled = 0;
      const fakeReq = {
        headers: {},
        socket: { remoteAddress: "192.168.1.50" },
      } as unknown as Request;

      const fakeRes = {
        status: () => fakeRes,
        json: () => fakeRes,
      } as unknown as Response;

      const next = () => {
        nextCalled++;
      };

      for (let i = 0; i < 5; i++) {
        loginRateLimiter(fakeReq, fakeRes, next);
      }

      assert.equal(nextCalled, 5, "Semua 5 percobaan pertama harus diizinkan");
    });

    it("harus memblokir dengan status 429 jika melebihi 8 percobaan", () => {
      const fakeReq = {
        headers: {},
        socket: { remoteAddress: "192.168.1.100" },
      } as unknown as Request;

      let responseStatus = 0;
      let responseBody: any = null;

      const fakeRes = {
        status: (code: number) => {
          responseStatus = code;
          return fakeRes;
        },
        json: (data: any) => {
          responseBody = data;
          return fakeRes;
        },
      } as unknown as Response;

      const next = () => {};

      // 8 percobaan pertama lolos
      for (let i = 0; i < 8; i++) {
        loginRateLimiter(fakeReq, fakeRes, next);
      }

      // Percobaan ke-9 harus terblokir 429
      loginRateLimiter(fakeReq, fakeRes, next);

      assert.equal(
        responseStatus,
        429,
        "Harus mengembalikan status HTTP 429 Too Many Requests",
      );
      assert.equal(responseBody?.success, false);
      assert.ok(responseBody?.message.includes("Terlalu banyak percobaan"));
    });
  });

  describe("4. requireAuth Middleware", () => {
    it("harus mengembalikan 401 jika authorization header tidak ada", () => {
      let statusResult = 0;
      let jsonResult: any = null;

      const fakeReq = {
        headers: {},
      } as unknown as Request;

      const fakeRes = {
        status: (code: number) => {
          statusResult = code;
          return fakeRes;
        },
        json: (data: any) => {
          jsonResult = data;
          return fakeRes;
        },
      } as unknown as Response;

      let nextCalled = false;
      requireAuth(fakeReq, fakeRes, () => {
        nextCalled = true;
      });

      assert.equal(statusResult, 401);
      assert.equal(nextCalled, false);
      assert.ok(jsonResult?.message.includes("tidak ditemukan"));
    });

    it("harus meloloskan request jika Bearer token valid", () => {
      const token = signJWT({
        userId: "99",
        username: "valid_user",
        role: "Admin",
      });

      const fakeReq = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as unknown as Request;

      const fakeRes = {} as unknown as Response;
      let nextCalled = false;

      requireAuth(fakeReq, fakeRes, () => {
        nextCalled = true;
      });

      assert.equal(
        nextCalled,
        true,
        "Next function harus dipanggil jika token valid",
      );
      assert.equal(fakeReq.user?.userId, "99");
      assert.equal(fakeReq.user?.username, "valid_user");
    });
  });
});
