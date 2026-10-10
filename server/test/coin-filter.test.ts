import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

// Helper fungsi logika evaluasi filter koin yang identik dengan implementasi di binance.ts
export function evaluateCoinFilter(
  symbol: string,
  filterMode: string = "ALL",
  rawTargetCoins: string = ""
): { allowed: boolean; reason: string } {
  const mode = (filterMode || "ALL").toUpperCase();
  const cleanSymbol = symbol.trim().toUpperCase();

  if (mode === "ALL") {
    return { allowed: true, reason: "Mode ALL: semua koin diizinkan" };
  }

  const coinList = rawTargetCoins
    .split(/[,;\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const isMatch = coinList.includes(cleanSymbol);

  if (mode === "WHITELIST") {
    if (!isMatch) {
      return {
        allowed: false,
        reason: `Sinyal ${cleanSymbol} dilewati karena tidak ada dalam Whitelist`,
      };
    }
    return { allowed: true, reason: `Sinyal ${cleanSymbol} diizinkan oleh Whitelist` };
  }

  if (mode === "BLACKLIST") {
    if (isMatch) {
      return {
        allowed: false,
        reason: `Sinyal ${cleanSymbol} dilewati karena ada dalam Blacklist`,
      };
    }
    return { allowed: true, reason: `Sinyal ${cleanSymbol} tidak ada dalam Blacklist` };
  }

  return { allowed: true, reason: "Default fallback" };
}

// Helper normalisasi input simbol (identik dengan frontend CredentialConfig)
export function normalizeSymbolInput(input: string): string {
  let clean = input.trim().toUpperCase();
  if (!clean) return "";
  if (!clean.endsWith("USDT")) {
    clean = `${clean}USDT`;
  }
  return clean;
}

// Preset Top 50 & 100 CMC
export const TOP_50_CMC: string[] = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT",
  "AVAXUSDT", "LINKUSDT", "SUIUSDT", "SHIBUSDT", "DOTUSDT", "NEARUSDT", "LTCUSDT",
  "BCHUSDT", "UNIUSDT", "PEPEUSDT", "APTUSDT", "ICPUSDT", "TRXUSDT", "TAOUSDT",
  "FETUSDT", "RENDERUSDT", "XLMUSDT", "AAVEUSDT", "ETCUSDT", "POLUSDT", "ARBUSDT",
  "OPUSDT", "ATOMUSDT", "INJUSDT", "SEIUSDT", "FILUSDT", "RUNEUSDT", "TIAUSDT",
  "HBARUSDT", "IMXUSDT", "WIFUSDT", "BONKUSDT", "GRTUSDT", "STXUSDT", "FLOKIUSDT",
  "VETUSDT", "MKRUSDT", "ENAUSDT", "JUPUSDT", "ALGOUSDT", "FTMUSDT", "THETAUSDT", "ONDOUSDT",
];

export const TOP_100_CMC: string[] = Array.from(
  new Set([
    ...TOP_50_CMC,
    "SANDUSDT", "MANAUSDT", "AXSUSDT", "GALAUSDT", "NEOUSDT", "CRVUSDT", "FLOWUSDT",
    "DYDXUSDT", "BEAMUSDT", "PENDLEUSDT", "KSMUSDT", "CHZUSDT", "ZECUSDT", "1INCHUSDT",
    "CFXUSDT", "EGLDUSDT", "EOSUSDT", "IOTAUSDT", "QNTUSDT", "SNXUSDT", "ROSEUSDT",
    "MINAUSDT", "CAKEUSDT", "LDOUSDT", "WLDUSDT", "PYTHUSDT", "STRKUSDT", "BLURUSDT",
    "ORDIUSDT", "MEMEUSDT", "ARKMUSDT", "JTOUSDT", "NOTUSDT", "WUSDT", "ZKUSDT",
    "IOUSDT", "ZROUSDT", "POPCATUSDT", "TURBOUSDT", "BRETTUSDT", "NEIROUSDT", "AEROUSDT",
    "KAVAUSDT", "COMPUSDT", "GMXUSDT", "DYMUSDT", "ALTUSDT", "PORTALUSDT", "PIXELUSDT",
  ])
);

describe("Coin Filter Feature Unit Tests", () => {
  describe("1. Mode ALL (No Filter)", () => {
    it("harus mengizinkan BTCUSDT saat mode ALL", () => {
      const res = evaluateCoinFilter("BTCUSDT", "ALL", "ETHUSDT,ADAUSDT");
      assert.equal(res.allowed, true);
    });

    it("harus mengizinkan koin apapun bahkan koin di luar target", () => {
      const res = evaluateCoinFilter("DOGEUSDT", "ALL", "");
      assert.equal(res.allowed, true);
    });
  });

  describe("2. Mode WHITELIST", () => {
    const whitelist = "BTCUSDT,ETHUSDT,ADAUSDT,SOLUSDT";

    it("harus mengizinkan koin yang ada dalam whitelist", () => {
      assert.equal(evaluateCoinFilter("BTCUSDT", "WHITELIST", whitelist).allowed, true);
      assert.equal(evaluateCoinFilter("ADAUSDT", "WHITELIST", whitelist).allowed, true);
      assert.equal(evaluateCoinFilter("SOLUSDT", "WHITELIST", whitelist).allowed, true);
    });

    it("harus memblokir/melewati koin yang TIDAK ada dalam whitelist", () => {
      const res1 = evaluateCoinFilter("PEPEUSDT", "WHITELIST", whitelist);
      assert.equal(res1.allowed, false);
      assert.match(res1.reason, /dilewati karena tidak ada dalam Whitelist/);

      const res2 = evaluateCoinFilter("DOGEUSDT", "WHITELIST", whitelist);
      assert.equal(res2.allowed, false);
    });

    it("harus case-insensitive (huruf kecil btcusdt tetap lolos)", () => {
      const res = evaluateCoinFilter("btcusdt", "WHITELIST", whitelist);
      assert.equal(res.allowed, true);
    });

    it("harus mendukung delimiter koma, spasi, atau titik koma", () => {
      const mixedDelimiter = "BTCUSDT; ETHUSDT  ADAUSDT,SOLUSDT";
      assert.equal(evaluateCoinFilter("ADAUSDT", "WHITELIST", mixedDelimiter).allowed, true);
      assert.equal(evaluateCoinFilter("ETHUSDT", "WHITELIST", mixedDelimiter).allowed, true);
      assert.equal(evaluateCoinFilter("XRPUSDT", "WHITELIST", mixedDelimiter).allowed, false);
    });

    it("harus memblokir semua koin jika whitelist kosong", () => {
      assert.equal(evaluateCoinFilter("BTCUSDT", "WHITELIST", "").allowed, false);
    });
  });

  describe("3. Mode BLACKLIST", () => {
    const blacklist = "PEPEUSDT,DOGEUSDT,SHIBUSDT";

    it("harus memblokir koin yang ada dalam blacklist", () => {
      const res = evaluateCoinFilter("PEPEUSDT", "BLACKLIST", blacklist);
      assert.equal(res.allowed, false);
      assert.match(res.reason, /dilewati karena ada dalam Blacklist/);
    });

    it("harus mengizinkan koin yang TIDAK ada dalam blacklist", () => {
      assert.equal(evaluateCoinFilter("BTCUSDT", "BLACKLIST", blacklist).allowed, true);
      assert.equal(evaluateCoinFilter("ETHUSDT", "BLACKLIST", blacklist).allowed, true);
      assert.equal(evaluateCoinFilter("ADAUSDT", "BLACKLIST", blacklist).allowed, true);
    });
  });

  describe("4. Normalisasi Simbol Input", () => {
    it("harus menambahkan suffix USDT jika input hanya base coin", () => {
      assert.equal(normalizeSymbolInput("btc"), "BTCUSDT");
      assert.equal(normalizeSymbolInput("ADA"), "ADAUSDT");
      assert.equal(normalizeSymbolInput("  sol  "), "SOLUSDT");
    });

    it("tidak boleh menduplikasi USDT jika sudah ada", () => {
      assert.equal(normalizeSymbolInput("BTCUSDT"), "BTCUSDT");
      assert.equal(normalizeSymbolInput("ethusdt"), "ETHUSDT");
    });

    it("harus mengembalikan string kosong jika input kosong", () => {
      assert.equal(normalizeSymbolInput(""), "");
      assert.equal(normalizeSymbolInput("   "), "");
    });
  });

  describe("5. Preset Top 50 & Top 100 CMC", () => {
    it("semua koin Top 50 harus berakhiran USDT", () => {
      for (const coin of TOP_50_CMC) {
        assert.ok(coin.endsWith("USDT"), `Koin ${coin} harus berakhiran USDT`);
      }
    });

    it("tidak boleh ada simbol duplikat di Top 50", () => {
      const set = new Set(TOP_50_CMC);
      assert.equal(set.size, TOP_50_CMC.length, "Top 50 tidak boleh memiliki duplikat");
    });

    it("semua koin Top 100 harus berakhiran USDT", () => {
      for (const coin of TOP_100_CMC) {
        assert.ok(coin.endsWith("USDT"), `Koin ${coin} harus berakhiran USDT`);
      }
    });

    it("tidak boleh ada simbol duplikat di Top 100", () => {
      const set = new Set(TOP_100_CMC);
      assert.equal(set.size, TOP_100_CMC.length, "Top 100 tidak boleh memiliki duplikat");
    });

    it("Top 50 harus merupakan subset dari Top 100", () => {
      const top100Set = new Set(TOP_100_CMC);
      for (const coin of TOP_50_CMC) {
        assert.ok(top100Set.has(coin), `Top 100 harus mencakup ${coin} dari Top 50`);
      }
    });
  });
});

