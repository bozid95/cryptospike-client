import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

// Helper fungsi logika evaluasi filter koin yang identik dengan implementasi di binance.ts
export function evaluateCoinFilter(
  symbol: string,
  filterMode: string = "ALL",
  rawTargetCoins: string = "",
): { allowed: boolean; reason: string } {
  const mode = (filterMode || "ALL").toUpperCase();
  const cleanSignal = symbol
    .trim()
    .replace(/[\/\-_\s]/g, "")
    .toUpperCase();
  const signalBase = cleanSignal.endsWith("USDT")
    ? cleanSignal.slice(0, -4)
    : cleanSignal;
  const signalWithUsdt = cleanSignal.endsWith("USDT")
    ? cleanSignal
    : `${cleanSignal}USDT`;

  if (mode === "ALL") {
    return { allowed: true, reason: "Mode ALL: semua koin diizinkan" };
  }

  const coinList = rawTargetCoins
    .split(/[,;\s]+/)
    .map((c) =>
      c
        .trim()
        .replace(/[\/\-_\s]/g, "")
        .toUpperCase(),
    )
    .filter(Boolean);

  const strip1000 = (s: string) => (s.startsWith("1000") ? s.slice(4) : s);
  const signalPure = strip1000(signalBase);

  const isMatch = coinList.some((target) => {
    const targetBase = target.endsWith("USDT") ? target.slice(0, -4) : target;
    const targetWithUsdt = target.endsWith("USDT") ? target : `${target}USDT`;
    const targetPure = strip1000(targetBase);

    return (
      cleanSignal === target ||
      cleanSignal === targetWithUsdt ||
      signalBase === targetBase ||
      signalWithUsdt === targetWithUsdt ||
      signalPure === targetPure
    );
  });

  if (mode === "WHITELIST") {
    if (!isMatch) {
      return {
        allowed: false,
        reason: `Sinyal ${cleanSignal} dilewati karena tidak ada dalam Whitelist`,
      };
    }
    return {
      allowed: true,
      reason: `Sinyal ${cleanSignal} diizinkan oleh Whitelist`,
    };
  }

  if (mode === "BLACKLIST") {
    if (isMatch) {
      return {
        allowed: false,
        reason: `Sinyal ${cleanSignal} dilewati karena ada dalam Blacklist`,
      };
    }
    return {
      allowed: true,
      reason: `Sinyal ${cleanSignal} tidak ada dalam Blacklist`,
    };
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
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "SOLUSDT",
  "TRXUSDT",
  "HYPEUSDT",
  "ZECUSDT",
  "DOGEUSDT",
  "LINKUSDT",
  "ADAUSDT",
  "NEARUSDT",
  "XLMUSDT",
  "BCHUSDT",
  "LTCUSDT",
  "UNIUSDT",
  "AVAXUSDT",
  "SUIUSDT",
  "HBARUSDT",
  "TAOUSDT",
  "1000SHIBUSDT",
  "ENAUSDT",
  "QNTUSDT",
  "AAVEUSDT",
  "PUMPUSDT",
  "ONDOUSDT",
  "DOTUSDT",
  "WLDUSDT",
  "ICPUSDT",
  "1000PEPEUSDT",
  "ETCUSDT",
  "ARBUSDT",
  "JUPUSDT",
  "KASUSDT",
  "POLUSDT",
  "ALGOUSDT",
  "ATOMUSDT",
  "RENDERUSDT",
  "FILUSDT",
  "AEROUSDT",
  "ZROUSDT",
  "CAKEUSDT",
  "INJUSDT",
  "APTUSDT",
  "XDCUSDT",
  "STRKUSDT",
  "STXUSDT",
  "VETUSDT",
  "DASHUSDT",
  "ETHFIUSDT",
];

export const TOP_100_CMC: string[] = Array.from(
  new Set([
    ...TOP_50_CMC,
    "RAYUSDT",
    "PYTHUSDT",
    "FLRUSDT",
    "CRVUSDT",
    "TRUMPUSDT",
    "FETUSDT",
    "SEIUSDT",
    "PENGUUSDT",
    "VIRTUALUSDT",
    "TIAUSDT",
    "IMXUSDT",
    "PENDLEUSDT",
    "KAIAUSDT",
    "LDOUSDT",
    "CFXUSDT",
    "XTZUSDT",
    "SUNUSDT",
    "OPUSDT",
    "GNOUSDT",
    "DCRUSDT",
    "1000BONKUSDT",
    "GRTUSDT",
    "MONUSDT",
    "JTOUSDT",
    "1000LUNCUSDT",
    "SYRUPUSDT",
    "ARUSDT",
    "ENSUSDT",
    "1000FLOKIUSDT",
    "JASMYUSDT",
    "PONSUSDT",
    "COMPUSDT",
    "IOTAUSDT",
    "METUSDT",
    "NFTUSDT",
    "EIGENUSDT",
    "ZBCNUSDT",
    "RUNEUSDT",
    "THETAUSDT",
    "TWTUSDT",
    "AXSUSDT",
    "AKTUSDT",
    "WIFUSDT",
    "TRACUSDT",
    "CVXUSDT",
    "KMNOUSDT",
    "SANDUSDT",
    "BATUSDT",
    "ZAMAUSDT",
    "MANAUSDT",
  ]),
);

export const MEMECOINS: string[] = [
  "DOGEUSDT",
  "1000SHIBUSDT",
  "1000PEPEUSDT",
  "WIFUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
  "PUMPUSDT",
  "PENGUUSDT",
  "POPCATUSDT",
  "TURBOUSDT",
  "BRETTUSDT",
  "NEIROUSDT",
  "BOMEUSDT",
  "MEMEUSDT",
  "1000SATSUSDT",
  "1000RATSUSDT",
  "1000CATUSDT",
  "1000LUNCUSDT",
  "MYROUSDT",
  "PEOPLEUSDT",
];

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
      assert.equal(
        evaluateCoinFilter("BTCUSDT", "WHITELIST", whitelist).allowed,
        true,
      );
      assert.equal(
        evaluateCoinFilter("ADAUSDT", "WHITELIST", whitelist).allowed,
        true,
      );
      assert.equal(
        evaluateCoinFilter("SOLUSDT", "WHITELIST", whitelist).allowed,
        true,
      );
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
      assert.equal(
        evaluateCoinFilter("ADAUSDT", "WHITELIST", mixedDelimiter).allowed,
        true,
      );
      assert.equal(
        evaluateCoinFilter("ETHUSDT", "WHITELIST", mixedDelimiter).allowed,
        true,
      );
      assert.equal(
        evaluateCoinFilter("XRPUSDT", "WHITELIST", mixedDelimiter).allowed,
        false,
      );
    });

    it("harus memblokir semua koin jika whitelist kosong", () => {
      assert.equal(
        evaluateCoinFilter("BTCUSDT", "WHITELIST", "").allowed,
        false,
      );
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
      assert.equal(
        evaluateCoinFilter("BTCUSDT", "BLACKLIST", blacklist).allowed,
        true,
      );
      assert.equal(
        evaluateCoinFilter("ETHUSDT", "BLACKLIST", blacklist).allowed,
        true,
      );
      assert.equal(
        evaluateCoinFilter("ADAUSDT", "BLACKLIST", blacklist).allowed,
        true,
      );
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
      assert.equal(
        set.size,
        TOP_50_CMC.length,
        "Top 50 tidak boleh memiliki duplikat",
      );
    });

    it("semua koin Top 100 harus berakhiran USDT", () => {
      for (const coin of TOP_100_CMC) {
        assert.ok(coin.endsWith("USDT"), `Koin ${coin} harus berakhiran USDT`);
      }
    });

    it("tidak boleh ada simbol duplikat di Top 100", () => {
      const set = new Set(TOP_100_CMC);
      assert.equal(
        set.size,
        TOP_100_CMC.length,
        "Top 100 tidak boleh memiliki duplikat",
      );
    });

    it("Top 50 harus merupakan subset dari Top 100", () => {
      const top100Set = new Set(TOP_100_CMC);
      for (const coin of TOP_50_CMC) {
        assert.ok(
          top100Set.has(coin),
          `Top 100 harus mencakup ${coin} dari Top 50`,
        );
      }
    });

    it("harus memblokir semua koin meme saat preset MEMECOINS dijadikan blacklist", () => {
      const memeBlacklist = MEMECOINS.join(",");
      assert.equal(
        evaluateCoinFilter("DOGEUSDT", "BLACKLIST", memeBlacklist).allowed,
        false,
      );
      assert.equal(
        evaluateCoinFilter("1000PEPEUSDT", "BLACKLIST", memeBlacklist).allowed,
        false,
      );
      assert.equal(
        evaluateCoinFilter("PEPEUSDT", "BLACKLIST", memeBlacklist).allowed,
        false,
      );
      assert.equal(
        evaluateCoinFilter("WIFUSDT", "BLACKLIST", memeBlacklist).allowed,
        false,
      );
      assert.equal(
        evaluateCoinFilter("BTCUSDT", "BLACKLIST", memeBlacklist).allowed,
        true,
      );
      assert.equal(
        evaluateCoinFilter("ETHUSDT", "BLACKLIST", memeBlacklist).allowed,
        true,
      );
    });
  });

  describe("6. Smart Dual-Match (Format Simbol Fleksibel: Slash, Underscore, Base Coin)", () => {
    it("harus mencocokkan sinyal berformat BTC/USDT dengan whitelist BTCUSDT", () => {
      const res = evaluateCoinFilter("BTC/USDT", "WHITELIST", "BTCUSDT");
      assert.equal(res.allowed, true);
    });

    it("harus mencocokkan sinyal berformat BTCUSDT dengan whitelist base coin BTC", () => {
      const res = evaluateCoinFilter("BTCUSDT", "WHITELIST", "BTC");
      assert.equal(res.allowed, true);
    });

    it("harus mencocokkan sinyal berformat SOL_USDT dengan whitelist SOLUSDT", () => {
      const res = evaluateCoinFilter("SOL_USDT", "WHITELIST", "SOLUSDT");
      assert.equal(res.allowed, true);
    });

    it("harus memblokir sinyal ETH/USDT jika blacklist berisi base coin ETH", () => {
      const res = evaluateCoinFilter("ETH/USDT", "BLACKLIST", "ETH");
      assert.equal(res.allowed, false);
    });

    it("harus memblokir sinyal DOGEUSDT jika blacklist berisi DOGE", () => {
      const res = evaluateCoinFilter("DOGEUSDT", "BLACKLIST", "DOGE");
      assert.equal(res.allowed, false);
    });

    it("harus mengizinkan koin yang tidak cocok di blacklist meskipun beda format", () => {
      const res = evaluateCoinFilter("SOL/USDT", "BLACKLIST", "BTC, ETH");
      assert.equal(res.allowed, true);
    });

    it("harus mencocokkan sinyal 1000PEPEUSDT dengan whitelist PEPE maupun PEPEUSDT", () => {
      const res1 = evaluateCoinFilter("1000PEPEUSDT", "WHITELIST", "PEPEUSDT");
      assert.equal(res1.allowed, true);

      const res2 = evaluateCoinFilter("PEPEUSDT", "WHITELIST", "1000PEPEUSDT");
      assert.equal(res2.allowed, true);

      const res3 = evaluateCoinFilter("1000SHIBUSDT", "WHITELIST", "SHIB");
      assert.equal(res3.allowed, true);
    });
  });
});
