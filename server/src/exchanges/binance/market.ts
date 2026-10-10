import { getBaseUrl } from "./client";
import { SymbolFilters } from "./types";
import { addAppLog } from "../../lib/logger";

export function roundStep(value: number, stepSize: number): number {
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const stepped = Math.floor(value / stepSize) * stepSize;
  return parseFloat(stepped.toFixed(precision));
}

export function roundTick(price: number, tickSize: number): number {
  const precision = Math.max(0, Math.round(-Math.log10(tickSize)));
  const ticked = Math.round(price / tickSize) * tickSize;
  return parseFloat(ticked.toFixed(precision));
}

// Memory Cache untuk Symbol Filters agar tidak request exchangeInfo berulang kali
const symbolFilterCache = new Map<string, SymbolFilters>();

export async function getSymbolFilters(
  symbol: string,
  isTestnet: boolean,
): Promise<SymbolFilters> {
  if (symbolFilterCache.has(symbol)) {
    return symbolFilterCache.get(symbol)!;
  }

  try {
    const baseUrl = getBaseUrl(isTestnet);
    const res = await fetch(`${baseUrl}/fapi/v1/exchangeInfo`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const symInfo = data.symbols?.find((s: any) => s.symbol === symbol);

    if (!symInfo) {
      return {
        tickSize: 0.0001,
        stepSize: 0.001,
        minNotional: 5,
        pricePrecision: 4,
        quantityPrecision: 3,
      };
    }

    let tickSize = 0.0001;
    let stepSize = 0.001;
    let minNotional = 5;

    for (const f of symInfo.filters || []) {
      if (f.filterType === "PRICE_FILTER") {
        tickSize = parseFloat(f.tickSize);
      } else if (f.filterType === "LOT_SIZE") {
        stepSize = parseFloat(f.stepSize);
      } else if (f.filterType === "MIN_NOTIONAL") {
        minNotional = parseFloat(f.notional || "5");
      }
    }

    const filters: SymbolFilters = {
      tickSize,
      stepSize,
      minNotional,
      pricePrecision: symInfo.pricePrecision ?? 4,
      quantityPrecision: symInfo.quantityPrecision ?? 3,
    };

    symbolFilterCache.set(symbol, filters);
    return filters;
  } catch (err: any) {
    addAppLog(
      "WARN",
      "Binance",
      `Failed to load filters for ${symbol}: ${err.message}`,
    );
    return {
      tickSize: 0.0001,
      stepSize: 0.001,
      minNotional: 5,
      pricePrecision: 4,
      quantityPrecision: 3,
    };
  }
}
