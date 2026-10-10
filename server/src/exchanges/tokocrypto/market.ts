import { TOKOCRYPTO_BASE_URL } from "./client";
import { TokocryptoSymbolRules } from "./types";

/**
 * Normalisasi format simbol dari sinyal (misal: "BTCUSDT", "BTC/USDT", "BTC", "1000PEPEUSDT")
 * ke format standar Tokocrypto Spot: "BASE_QUOTE" (contoh: "BTC_USDT" atau "BTC_BIDR")
 */
export function normalizeTokocryptoSymbol(
  symbol: string,
  targetQuote: "USDT" | "BIDR" = "USDT",
): string {
  if (!symbol) return `BTC_${targetQuote}`;

  // Bersihkan karakter pemisah: slash, dash, spasi
  let clean = symbol
    .trim()
    .toUpperCase()
    .replace(/[\/\-\s]/g, "");

  // Hapus awalan 1000 untuk meme koin (seperti 1000PEPE -> PEPE)
  if (clean.startsWith("1000")) {
    clean = clean.slice(4);
  }

  // Jika sudah memiliki format dengan garis bawah
  if (clean.includes("_")) {
    const [base, currentQuote] = clean.split("_");
    if (targetQuote && currentQuote !== targetQuote) {
      return `${base}_${targetQuote}`;
    }
    return clean;
  }

  // Deteksi quote asset di akhir string
  let baseAsset = clean;
  if (clean.endsWith("USDT")) {
    baseAsset = clean.slice(0, -4);
  } else if (clean.endsWith("BIDR")) {
    baseAsset = clean.slice(0, -4);
  } else if (clean.endsWith("BUSD")) {
    baseAsset = clean.slice(0, -4);
  }

  return `${baseAsset}_${targetQuote}`;
}

// Cache aturan simbol Tokocrypto agar tidak melakukan pemanggilan API berulang-ulang
const tokocryptoSymbolCache = new Map<string, TokocryptoSymbolRules>();

/**
 * Mengambil filter dan aturan lot size simbol dari Tokocrypto
 */
export async function getTokocryptoSymbolRules(
  symbol: string,
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<TokocryptoSymbolRules> {
  const formattedSymbol = normalizeTokocryptoSymbol(symbol);
  if (tokocryptoSymbolCache.has(formattedSymbol)) {
    return tokocryptoSymbolCache.get(formattedSymbol)!;
  }

  try {
    const res = await customFetch(`${baseUrl}/open/v1/common/symbols`);
    if (res.ok) {
      const json = (await res.json()) as any;
      const list = json?.data?.list || json?.data || [];
      const match = list.find(
        (s: any) =>
          (s.symbol || "").toUpperCase() === formattedSymbol.toUpperCase(),
      );

      if (match) {
        const rules: TokocryptoSymbolRules = {
          symbol: formattedSymbol,
          baseAsset: match.baseAsset || formattedSymbol.split("_")[0],
          quoteAsset: match.quoteAsset || formattedSymbol.split("_")[1],
          minQty: parseFloat(match.minQty || match.minTradeQty || "0.0001"),
          maxQty: parseFloat(match.maxQty || match.maxTradeQty || "1000000"),
          stepSize: parseFloat(match.stepSize || match.qtyStep || "0.0001"),
          minNotional: parseFloat(
            match.minNotional ||
              match.minNominal ||
              match.minTradeAmount ||
              "5.0",
          ),
          tickSize: parseFloat(match.tickSize || match.priceStep || "0.01"),
          pricePrecision: match.pricePrecision ?? 2,
          quantityPrecision: match.quantityPrecision ?? 4,
        };
        tokocryptoSymbolCache.set(formattedSymbol, rules);
        return rules;
      }
    }
  } catch {}

  // Fallback konservatif jika API symbols gagal
  const fallbackRules: TokocryptoSymbolRules = {
    symbol: formattedSymbol,
    baseAsset: formattedSymbol.split("_")[0] || formattedSymbol,
    quoteAsset: formattedSymbol.split("_")[1] || "USDT",
    minQty: 0.0001,
    maxQty: 1000000,
    stepSize: 0.0001,
    minNotional: 5.0, // Minimum notional standar Tokocrypto / Binance ($5 USD)
    tickSize: 0.01,
    pricePrecision: 2,
    quantityPrecision: 4,
  };
  return fallbackRules;
}

/**
 * Mengambil harga pasar spot terkini untuk simbol Tokocrypto
 */
export async function getTokocryptoTicker(
  symbol: string,
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<{ symbol: string; lastPrice: number }> {
  const normSymbol = normalizeTokocryptoSymbol(symbol);
  try {
    const res = await customFetch(
      `${baseUrl}/open/v1/market/ticker/price?symbol=${encodeURIComponent(normSymbol)}`,
    );
    if (res.ok) {
      const json = (await res.json()) as any;
      const price = parseFloat(
        json?.data?.price || json?.data?.lastPrice || "0",
      );
      if (price > 0) {
        return { symbol: normSymbol, lastPrice: price };
      }
    }
  } catch {}
  return { symbol: normSymbol, lastPrice: 0 };
}
