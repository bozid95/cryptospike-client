import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  normalizeTokocryptoSymbol,
  createTokocryptoSignature,
  buildTokocryptoSignedQuery,
  validateTokocryptoSignal,
  calculateSpotOrderQuantity,
  getTokocryptoBalance,
  testTokocryptoConnection,
  executeTokocryptoSignalOrder,
  TokocryptoExecutionConfig,
} from "../src/lib/tokocrypto";

describe("Tokocrypto Spot Module Unit Tests", () => {
  describe("1. Symbol Normalization (Format Simbol Spot Tokocrypto)", () => {
    it("harus mengonversi BTCUSDT menjadi BTC_USDT", () => {
      assert.equal(normalizeTokocryptoSymbol("BTCUSDT"), "BTC_USDT");
    });

    it("harus mengonversi format dengan slash (BTC/USDT) menjadi BTC_USDT", () => {
      assert.equal(normalizeTokocryptoSymbol("BTC/USDT"), "BTC_USDT");
    });

    it("harus mengonversi format dengan dash (SOL-USDT) menjadi SOL_USDT", () => {
      assert.equal(normalizeTokocryptoSymbol("SOL-USDT"), "SOL_USDT");
    });

    it("harus mengonversi base coin murni (ETH) menjadi ETH_USDT", () => {
      assert.equal(normalizeTokocryptoSymbol("ETH"), "ETH_USDT");
    });

    it("harus menghilangkan multiplier 1000 pada memecoin (1000PEPEUSDT -> PEPE_USDT)", () => {
      assert.equal(normalizeTokocryptoSymbol("1000PEPEUSDT"), "PEPE_USDT");
      assert.equal(normalizeTokocryptoSymbol("1000SHIBUSDT"), "SHIB_USDT");
      assert.equal(normalizeTokocryptoSymbol("1000BONK"), "BONK_USDT");
    });

    it("harus mempertahankan simbol yang sudah valid (ADA_USDT -> ADA_USDT)", () => {
      assert.equal(normalizeTokocryptoSymbol("ADA_USDT"), "ADA_USDT");
    });

    it("harus mendukung quote asset BIDR jika ditentukan", () => {
      assert.equal(normalizeTokocryptoSymbol("BTCUSDT", "BIDR"), "BTC_BIDR");
      assert.equal(normalizeTokocryptoSymbol("ETH", "BIDR"), "ETH_BIDR");
      assert.equal(normalizeTokocryptoSymbol("SOL_USDT", "BIDR"), "SOL_BIDR");
    });
  });

  describe("2. HMAC-SHA256 Signature & Signed Query Builder", () => {
    it("harus menghasilkan signature HMAC-SHA256 yang tepat", () => {
      const query = "asset=USDT&timestamp=1600000000000";
      const secret = "testSecretKey123";
      const expected = crypto
        .createHmac("sha256", secret)
        .update(query)
        .digest("hex");

      const actual = createTokocryptoSignature(query, secret);
      assert.equal(actual, expected);
    });

    it("harus menyusun query parameter berurutan secara alfabetis lengkap dengan timestamp dan signature", () => {
      const secret = "mySecret";
      const params = {
        symbol: "BTC_USDT",
        side: 0,
        type: 2,
      };

      const result = buildTokocryptoSignedQuery(params, secret, 1700000000000);
      assert.match(result, /recvWindow=5000/);
      assert.match(result, /side=0/);
      assert.match(result, /symbol=BTC_USDT/);
      assert.match(result, /timestamp=1700000000000/);
      assert.match(result, /type=2/);
      assert.match(result, /&signature=[a-f0-9]{64}$/);
    });
  });

  describe("3. Validasi Sinyal (Spot Market Guard)", () => {
    it("harus mengizinkan sinyal LONG dan BUY", () => {
      const longRes = validateTokocryptoSignal({
        symbol: "BTCUSDT",
        side: "LONG",
        entryPrice: 65000,
      });
      assert.equal(longRes.allowed, true);

      const buyRes = validateTokocryptoSignal({
        symbol: "ETHUSDT",
        side: "BUY",
        entryPrice: 3500,
      });
      assert.equal(buyRes.allowed, true);
    });

    it("harus menolak dan mengabaikan sinyal SHORT", () => {
      const shortRes = validateTokocryptoSignal({
        symbol: "BTCUSDT",
        side: "SHORT",
        entryPrice: 65000,
      });
      assert.equal(shortRes.allowed, false);
      assert.match(shortRes.reason, /hanya mendukung posisi BUY \/ LONG/);
    });

    it("harus menolak dan mengabaikan sinyal SELL", () => {
      const sellRes = validateTokocryptoSignal({
        symbol: "SOLUSDT",
        side: "SELL",
        entryPrice: 150,
      });
      assert.equal(sellRes.allowed, false);
      assert.match(sellRes.reason, /hanya mendukung posisi BUY \/ LONG/);
    });

    it("harus menolak sinyal dengan side tidak dikenal", () => {
      const invalidRes = validateTokocryptoSignal({
        symbol: "SOLUSDT",
        side: "UNKNOWN",
        entryPrice: 150,
      });
      assert.equal(invalidRes.allowed, false);
      assert.match(invalidRes.reason, /tidak valid/);
    });
  });

  describe("4. Perhitungan Lot Size & Alokasi Modal Spot", () => {
    it("harus menghitung kuantitas beli dengan pembulatan stepSize yang presisi", () => {
      const res = calculateSpotOrderQuantity({
        balance: 1000, // $1000 USDT
        riskPct: 5, // 5% = $50 USDT
        currentPrice: 100, // Harga $100 per koin -> 0.5 koin
        stepSize: 0.01,
        minNotional: 5,
      });

      assert.equal(res.isValid, true);
      assert.equal(res.quantity, 0.5);
      assert.equal(res.notional, 50);
    });

    it("harus menyesuaikan modal ke minNotional ($5) jika alokasi persentase terlalu kecil namun saldo mencukupi", () => {
      const res = calculateSpotOrderQuantity({
        balance: 100, // Saldo $100
        riskPct: 1, // 1% = $1 (di bawah minNotional $5)
        currentPrice: 10, // Harga $10 -> 0.5 koin ($5)
        stepSize: 0.1,
        minNotional: 5,
      });

      assert.equal(res.isValid, true);
      assert.equal(res.notional, 5);
      assert.equal(res.quantity, 0.5);
    });

    it("harus menolak order jika total saldo di bawah minNotional", () => {
      const res = calculateSpotOrderQuantity({
        balance: 3.5, // Saldo $3.5 (di bawah $5)
        riskPct: 10,
        currentPrice: 50,
        stepSize: 0.01,
        minNotional: 5,
      });

      assert.equal(res.isValid, false);
      assert.match(res.reason!, /di bawah batas minimum transaksi/);
    });

    it("harus menolak jika saldo 0 atau harga koin 0", () => {
      const zeroBalance = calculateSpotOrderQuantity({
        balance: 0,
        riskPct: 5,
        currentPrice: 50,
        stepSize: 0.01,
        minNotional: 5,
      });
      assert.equal(zeroBalance.isValid, false);

      const zeroPrice = calculateSpotOrderQuantity({
        balance: 100,
        riskPct: 5,
        currentPrice: 0,
        stepSize: 0.01,
        minNotional: 5,
      });
      assert.equal(zeroPrice.isValid, false);
    });
  });

  describe("5. Autentikasi & Koneksi Tokocrypto (Mock HTTP)", () => {
    it("harus mengembalikan error jika API Key atau Secret kosong", async () => {
      const res = await testTokocryptoConnection("", "");
      assert.equal(res.success, false);
      assert.match(res.message, /wajib diisi/);
    });

    it("harus berhasil membaca saldo kas ketika API Tokocrypto mengembalikan respon sukses", async () => {
      // Mock fetch lokal
      const mockFetch = (async (url: string) => {
        if (url.includes("/common/time")) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: 1600000000000 }),
          };
        }
        if (url.includes("/account/spot/asset")) {
          return {
            ok: true,
            json: async () => ({
              code: 0,
              msg: "success",
              data: {
                asset: "USDT",
                free: "250.75",
                locked: "0.00",
              },
            }),
          };
        }
        return { ok: false, status: 404, text: async () => "Not found" };
      }) as unknown as typeof fetch;

      const balance = await getTokocryptoBalance(
        "mockApiKey",
        "mockApiSecret",
        "USDT",
        "https://mock.tokocrypto.com",
        mockFetch,
      );

      assert.equal(balance.asset, "USDT");
      assert.equal(balance.free, 250.75);
      assert.equal(balance.locked, 0);

      const conn = await testTokocryptoConnection(
        "mockApiKey",
        "mockApiSecret",
        "USDT",
        "https://mock.tokocrypto.com",
        mockFetch,
      );
      assert.equal(conn.success, true);
      assert.equal(conn.balance, 250.75);
    });

    it("harus menangani respon error bursa Tokocrypto dengan pesan yang jelas", async () => {
      const mockFailFetch = (async (url: string) => {
        if (url.includes("/common/time")) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: 1600000000000 }),
          };
        }
        return {
          ok: false,
          status: 401,
          text: async () =>
            JSON.stringify({ code: 401, msg: "Signature invalid" }),
        };
      }) as unknown as typeof fetch;

      const conn = await testTokocryptoConnection(
        "badKey",
        "badSecret",
        "USDT",
        "https://mock.tokocrypto.com",
        mockFailFetch,
      );
      assert.equal(conn.success, false);
      assert.match(conn.message, /Gagal verifikasi Tokocrypto/);
    });
  });

  describe("6. Eksekusi Sinyal Tokocrypto (Dry-Run & Signal Routing)", () => {
    it("harus melewati sinyal jika autoExecute bernilai false", async () => {
      const config: TokocryptoExecutionConfig = {
        autoExecute: false,
      };

      const res = await executeTokocryptoSignalOrder(
        { symbol: "BTCUSDT", side: "LONG", entryPrice: 65000 },
        config,
      );

      assert.equal(res.success, false);
      assert.match(res.message, /Auto-trade nonaktif/);
    });

    it("harus otomatis menolak sinyal SHORT tanpa menembak order", async () => {
      const config: TokocryptoExecutionConfig = {
        autoExecute: true,
        dryRun: true,
      };

      const res = await executeTokocryptoSignalOrder(
        { symbol: "BTCUSDT", side: "SHORT", entryPrice: 65000 },
        config,
      );

      assert.equal(res.success, false);
      assert.match(res.message, /hanya mendukung posisi BUY \/ LONG/);
    });

    it("harus mematuhi coin filter (menolak koin yang tidak ada di whitelist)", async () => {
      const config: TokocryptoExecutionConfig = {
        autoExecute: true,
        coinFilterMode: "WHITELIST",
        targetCoins: "BTCUSDT,ETHUSDT",
      };

      const res = await executeTokocryptoSignalOrder(
        { symbol: "SOLUSDT", side: "LONG", entryPrice: 150 },
        config,
      );

      assert.equal(res.success, false);
      assert.match(res.message, /tidak ada di whitelist/i);
    });

    it("harus mengeksekusi simulasi order BUY dalam mode Dry-Run lengkap dengan target TP1 (+5%) dan SL (-2.5%)", async () => {
      const config: TokocryptoExecutionConfig = {
        autoExecute: true,
        dryRun: true,
        coinFilterMode: "ALL",
      };

      const entryPrice = 100;
      const res = await executeTokocryptoSignalOrder(
        { symbol: "SOLUSDT", side: "LONG", entryPrice },
        config,
      );

      assert.equal(res.success, true);
      assert.equal(res.simulated, true);
      assert.equal(res.tpPrice, 105); // +5%
      assert.equal(res.slPrice, 97.5); // -2.5%
      assert.equal(res.order?.symbol, "SOL_USDT");
      assert.equal(res.order?.side, "BUY");
    });
  });
});
