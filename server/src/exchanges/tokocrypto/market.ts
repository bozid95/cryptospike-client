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
        const filters = Array.isArray(match.filters) ? match.filters : [];
        const lotSizeFilter = filters.find(
          (f: any) => f.filterType === "LOT_SIZE",
        );
        const priceFilter = filters.find(
          (f: any) => f.filterType === "PRICE_FILTER",
        );
        const notionalFilter = filters.find(
          (f: any) =>
            f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL",
        );

        const stepSize = parseFloat(
          lotSizeFilter?.stepSize ||
            match.stepSize ||
            match.qtyStep ||
            "0.0001",
        );
        const tickSize = parseFloat(
          priceFilter?.tickSize || match.tickSize || match.priceStep || "0.01",
        );
        const minQty = parseFloat(
          lotSizeFilter?.minQty ||
            match.minQty ||
            match.minTradeQty ||
            "0.0001",
        );
        const maxQty = parseFloat(
          lotSizeFilter?.maxQty ||
            match.maxQty ||
            match.maxTradeQty ||
            "1000000",
        );
        const minNotional = parseFloat(
          notionalFilter?.minNotional ||
            match.minNotional ||
            match.minNominal ||
            match.minTradeAmount ||
            "5.0",
        );

        const quantityPrecision =
          match.quantityPrecision ??
          (stepSize > 0 ? Math.max(0, Math.round(-Math.log10(stepSize))) : 4);

        const pricePrecision =
          match.pricePrecision ??
          (tickSize > 0 ? Math.max(0, Math.round(-Math.log10(tickSize))) : 2);

        const rules: TokocryptoSymbolRules = {
          symbol: formattedSymbol,
          baseAsset: match.baseAsset || formattedSymbol.split("_")[0],
          quoteAsset: match.quoteAsset || formattedSymbol.split("_")[1],
          minQty,
          maxQty,
          stepSize,
          minNotional,
          tickSize,
          pricePrecision,
          quantityPrecision,
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

  // 1. Coba ambil dari Tokocrypto Order Book Depth (Endpoint aktif)
  try {
    const res = await customFetch(
      `${baseUrl}/open/v1/market/depth?symbol=${encodeURIComponent(normSymbol)}&limit=5`,
    );
    if (res.ok) {
      const json = (await res.json()) as any;
      const bids = json?.data?.bids || [];
      const asks = json?.data?.asks || [];
      if (bids.length > 0 && asks.length > 0) {
        const bestBid = parseFloat(bids[0][0]);
        const bestAsk = parseFloat(asks[0][0]);
        if (bestBid > 0 && bestAsk > 0) {
          const midPrice = (bestBid + bestAsk) / 2;
          return { symbol: normSymbol, lastPrice: midPrice };
        }
      }
    }
  } catch {}

  // 2. Fallback ke Binance Public Ticker jika endpoint Tokocrypto tidak tersedia
  try {
    const cleanBinance = normSymbol.replace(/_/g, "");
    const res = await customFetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(cleanBinance)}`,
    );
    if (res.ok) {
      const json = (await res.json()) as any;
      const price = parseFloat(json?.price || "0");
      if (price > 0) {
        return { symbol: normSymbol, lastPrice: price };
      }
    }
  } catch {}

  return { symbol: normSymbol, lastPrice: 0 };
}
