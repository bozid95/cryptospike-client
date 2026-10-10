import crypto from "crypto";
import { addAppLog } from "./logger";
import { evaluateCoinFilter } from "./coin-filter";

export const TOKOCRYPTO_BASE_URL = "https://www.tokocrypto.com";

export interface TokocryptoSymbolRules {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minQty: number;
  maxQty: number;
  stepSize: number;
  minNotional: number;
  tickSize: number;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface TokocryptoOrderParams {
  symbol: string;
  side: 0 | 1 | "BUY" | "SELL"; // 0: BUY, 1: SELL
  type: 1 | 2 | "LIMIT" | "MARKET"; // 1: LIMIT, 2: MARKET
  quantity?: number;
  quoteOrderQty?: number;
  price?: number;
  clientId?: string;
}

export interface TokocryptoOrderResult {
  orderId: string;
  clientId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  status: string;
  executedQty: number;
  cummulativeQuoteQty: number;
  price?: number;
  raw?: any;
}

export interface TokocryptoExecutionConfig {
  autoExecute: boolean;
  dryRun?: boolean;
  tokocryptoApiKey?: string | null;
  tokocryptoApiSecret?: string | null;
  tokocryptoQuoteAsset?: "USDT" | "BIDR";
  riskPerTradePct?: number;
  maxOpenPositions?: number;
  coinFilterMode?: string;
  targetCoins?: string | null;
}

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
  let clean = symbol.trim().toUpperCase().replace(/[\/\-\s]/g, "");

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

/**
 * Membuat HMAC-SHA256 signature sesuai standar Binance / Tokocrypto Open API
 */
export function createTokocryptoSignature(
  queryString: string,
  apiSecret: string,
): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

/**
 * Menyusun query string berurut dengan timestamp, recvWindow, dan signature
 */
export function buildTokocryptoSignedQuery(
  params: Record<string, any>,
  apiSecret: string,
  serverTimestamp?: number,
): string {
  const queryObj: Record<string, any> = {
    ...params,
    recvWindow: params.recvWindow || 5000,
    timestamp: serverTimestamp || Date.now(),
  };

  const queryString = Object.keys(queryObj)
    .sort()
    .filter((key) => queryObj[key] !== undefined && queryObj[key] !== null)
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(queryObj[key]))}`,
    )
    .join("&");

  const signature = createTokocryptoSignature(queryString, apiSecret);
  return `${queryString}&signature=${signature}`;
}

/**
 * Mengambil waktu server Tokocrypto untuk sinkronisasi timestamp
 */
export async function getTokocryptoServerTime(
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<number> {
  try {
    const res = await customFetch(`${baseUrl}/open/v1/common/time`);
    if (res.ok) {
      const json = (await res.json()) as any;
      if (json && (json.data || json.timestamp)) {
        return Number(json.data || json.timestamp);
      }
    }
  } catch {}
  return Date.now();
}

/**
 * Validasi apakah sinyal layak dieksekusi di Tokocrypto Spot.
 * Tokocrypto Spot HANYA mendukung posisi BUY / LONG.
 */
export function validateTokocryptoSignal(signal: {
  symbol?: string;
  side?: string;
  entryPrice?: number;
}): { allowed: boolean; reason: string } {
  const side = (signal.side || "").trim().toUpperCase();

  if (side === "SHORT" || side === "SELL") {
    return {
      allowed: false,
      reason:
        "Tokocrypto adalah bursa Spot yang hanya mendukung posisi BUY / LONG. Sinyal SHORT otomatis dilewati.",
    };
  }

  if (side !== "LONG" && side !== "BUY") {
    return {
      allowed: false,
      reason: `Arah sinyal '${side}' tidak valid untuk pasar spot Tokocrypto.`,
    };
  }

  return { allowed: true, reason: "Sinyal valid untuk spot BUY/LONG." };
}

/**
 * Cache aturan simbol Tokocrypto agar tidak melakukan pemanggilan API berulang-ulang
 */
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
            match.minNotional || match.minNominal || match.minTradeAmount || "5.0",
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
    baseAsset: formattedSymbol.split("_")[0],
    quoteAsset: formattedSymbol.split("_")[1],
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
      const price = parseFloat(json?.data?.price || json?.data?.lastPrice || "0");
      if (price > 0) {
        return { symbol: normSymbol, lastPrice: price };
      }
    }
  } catch {}
  return { symbol: normSymbol, lastPrice: 0 };
}

/**
 * Mengambil saldo aset kas (USDT atau BIDR) dari Tokocrypto
 */
export async function getTokocryptoBalance(
  apiKey: string,
  apiSecret: string,
  asset: string = "USDT",
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<{ asset: string; free: number; locked: number }> {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();

  if (!cleanKey || !cleanSecret) {
    throw new Error("API Key dan API Secret Tokocrypto tidak boleh kosong.");
  }

  const serverTime = await getTokocryptoServerTime(baseUrl, customFetch);
  const queryString = buildTokocryptoSignedQuery(
    { asset: asset.toUpperCase() },
    cleanSecret,
    serverTime,
  );

  const res = await customFetch(
    `${baseUrl}/open/v1/account/spot/asset?${queryString}`,
    {
      method: "GET",
      headers: {
        "X-MBX-APIKEY": cleanKey,
      },
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Tokocrypto HTTP ${res.status}: ${errorText}`);
  }

  const json = (await res.json()) as any;
  if (json.code !== undefined && json.code !== 0 && json.code !== 200) {
    throw new Error(
      `Tokocrypto Error [${json.code}]: ${json.msg || "Gagal mengambil saldo"}`,
    );
  }

  const data = json.data;
  let free = 0;
  let locked = 0;

  if (Array.isArray(data)) {
    const found = data.find(
      (a: any) => (a.asset || "").toUpperCase() === asset.toUpperCase(),
    );
    if (found) {
      free = parseFloat(found.free || "0");
      locked = parseFloat(found.locked || "0");
    }
  } else if (data && typeof data === "object") {
    free = parseFloat(data.free || "0");
    locked = parseFloat(data.locked || "0");
  }

  return {
    asset: asset.toUpperCase(),
    free,
    locked,
  };
}

/**
 * Mengetes koneksi API Tokocrypto dan memeriksa validitas kredensial
 */
export async function testTokocryptoConnection(
  apiKey: string,
  apiSecret: string,
  quoteAsset: "USDT" | "BIDR" = "USDT",
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<{
  success: boolean;
  message: string;
  balance?: number;
  serverTime?: number;
}> {
  try {
    const cleanKey = apiKey.trim();
    const cleanSecret = apiSecret.trim();

    if (!cleanKey || !cleanSecret) {
      return {
        success: false,
        message: "API Key dan Secret Tokocrypto wajib diisi.",
      };
    }

    const serverTime = await getTokocryptoServerTime(baseUrl, customFetch);
    const balance = await getTokocryptoBalance(
      cleanKey,
      cleanSecret,
      quoteAsset,
      baseUrl,
      customFetch,
    );

    return {
      success: true,
      message: `Koneksi Tokocrypto berhasil! Saldo ${quoteAsset}: ${balance.free.toFixed(2)}`,
      balance: balance.free,
      serverTime,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal verifikasi Tokocrypto: ${err.message}`,
    };
  }
}

/**
 * Menghitung kuantitas koin yang dapat dibeli di pasar Spot berdasarkan saldo,
 * persentase risiko, pembulatan stepSize, dan validasi minNotional.
 */
export function calculateSpotOrderQuantity(params: {
  balance: number;
  riskPct: number;
  currentPrice: number;
  stepSize: number;
  minNotional: number;
  maxAllocationUsd?: number;
}): {
  quantity: number;
  notional: number;
  isValid: boolean;
  reason?: string;
} {
  const { balance, riskPct, currentPrice, stepSize, minNotional, maxAllocationUsd } =
    params;

  if (balance <= 0) {
    return {
      quantity: 0,
      notional: 0,
      isValid: false,
      reason: "Saldo dompet tidak mencukupi (0).",
    };
  }

  if (currentPrice <= 0) {
    return {
      quantity: 0,
      notional: 0,
      isValid: false,
      reason: "Harga pasar koin tidak valid (<= 0).",
    };
  }

  // Hitung alokasi dana modal yang digunakan untuk transaksi ini
  const rawAllocation = (balance * Math.max(0.1, riskPct)) / 100;
  let targetAllocation = rawAllocation;

  if (maxAllocationUsd && maxAllocationUsd > 0) {
    targetAllocation = Math.min(targetAllocation, maxAllocationUsd);
  }

  // Cek apakah alokasi memenuhi minNotional
  if (targetAllocation < minNotional) {
    // Jika saldo total mencukupi minNotional, sesuaikan ke minNotional agar order tidak ditolak
    if (balance >= minNotional) {
      targetAllocation = minNotional;
    } else {
      return {
        quantity: 0,
        notional: targetAllocation,
        isValid: false,
        reason: `Alokasi modal ($${targetAllocation.toFixed(2)}) di bawah batas minimum transaksi bursa ($${minNotional.toFixed(2)}).`,
      };
    }
  }

  // Hitung kuantitas koin
  const rawQty = targetAllocation / currentPrice;

  // Lakukan pembulatan sesuai stepSize
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const stepped = Math.floor(rawQty / stepSize) * stepSize;
  const quantity = parseFloat(stepped.toFixed(precision));

  const actualNotional = quantity * currentPrice;

  if (quantity <= 0 || actualNotional < minNotional) {
    return {
      quantity: 0,
      notional: actualNotional,
      isValid: false,
      reason: `Kuantitas koin setelah pembulatan (${quantity}) menghasilkan nominal ($${actualNotional.toFixed(2)}) di bawah batas minimum ($${minNotional.toFixed(2)}).`,
    };
  }

  return {
    quantity,
    notional: parseFloat(actualNotional.toFixed(4)),
    isValid: true,
  };
}

/**
 * Mengirim order BUY atau SELL ke Tokocrypto Spot
 */
export async function placeTokocryptoOrder(
  apiKey: string,
  apiSecret: string,
  params: TokocryptoOrderParams,
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<TokocryptoOrderResult> {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();

  const symbol = normalizeTokocryptoSymbol(params.symbol);
  const side =
    params.side === 1 || params.side === "SELL" ? 1 : 0; // 0 = BUY, 1 = SELL
  const type =
    params.type === 1 || params.type === "LIMIT" ? 1 : 2; // 1 = LIMIT, 2 = MARKET

  const payload: Record<string, any> = {
    symbol,
    side,
    type,
  };

  if (params.quantity) payload.quantity = params.quantity;
  if (params.quoteOrderQty) payload.quoteOrderQty = params.quoteOrderQty;
  if (params.price && type === 1) payload.price = params.price;
  if (params.clientId) payload.clientId = params.clientId;

  const serverTime = await getTokocryptoServerTime(baseUrl, customFetch);
  const queryString = buildTokocryptoSignedQuery(payload, cleanSecret, serverTime);

  const res = await customFetch(`${baseUrl}/open/v1/orders?${queryString}`, {
    method: "POST",
    headers: {
      "X-MBX-APIKEY": cleanKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tokocrypto Order HTTP ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as any;
  if (json.code !== undefined && json.code !== 0 && json.code !== 200) {
    throw new Error(`Tokocrypto Order Gagal [${json.code}]: ${json.msg}`);
  }

  const data = json.data || {};
  return {
    orderId: String(data.orderId || data.id || Date.now()),
    clientId: data.clientId || params.clientId,
    symbol,
    side: side === 0 ? "BUY" : "SELL",
    type: type === 1 ? "LIMIT" : "MARKET",
    status: data.status || "FILLED",
    executedQty: parseFloat(data.executedQty || params.quantity || "0"),
    cummulativeQuoteQty: parseFloat(
      data.cummulativeQuoteQty || params.quoteOrderQty || "0",
    ),
    price: parseFloat(data.price || params.price || "0"),
    raw: data,
  };
}

/**
 * Handler utama eksekusi sinyal trading ke Tokocrypto Spot
 */
export async function executeTokocryptoSignalOrder(
  signal: {
    symbol: string;
    side: string;
    entryPrice: number;
    tp1?: number;
    sl?: number;
    score?: number;
    [key: string]: any;
  },
  config: TokocryptoExecutionConfig,
  options?: {
    customFetch?: typeof fetch;
    baseUrl?: string;
  },
): Promise<{
  success: boolean;
  message: string;
  order?: TokocryptoOrderResult;
  tpPrice?: number;
  slPrice?: number;
  simulated?: boolean;
}> {
  const baseUrl = options?.baseUrl || TOKOCRYPTO_BASE_URL;
  const customFetch = options?.customFetch || fetch;

  // 1. Cek Auto Execute
  if (!config.autoExecute) {
    return {
      success: false,
      message: "Auto-trade nonaktif di konfigurasi Tokocrypto.",
    };
  }

  // 2. Validasi Sinyal (Tokocrypto Spot hanya bisa LONG)
  const validation = validateTokocryptoSignal(signal);
  if (!validation.allowed) {
    addAppLog("WARN", "Tokocrypto", validation.reason);
    return {
      success: false,
      message: validation.reason,
    };
  }

  // 3. Evaluasi Filter Koin (Whitelist / Blacklist)
  const filterEval = evaluateCoinFilter(
    signal.symbol,
    config.coinFilterMode || "ALL",
    config.targetCoins || "",
  );
  if (!filterEval.allowed) {
    addAppLog("INFO", "Tokocrypto", filterEval.reason);
    return {
      success: false,
      message: filterEval.reason,
    };
  }

  const quoteAsset = config.tokocryptoQuoteAsset || "USDT";
  const formattedSymbol = normalizeTokocryptoSymbol(signal.symbol, quoteAsset);

  // Perhitungan target Take Profit (+5% atau dari sinyal) dan Stop Loss (-2.5% atau dari sinyal)
  const entryPrice = Number(signal.entryPrice);
  const tpPrice = signal.tp1 ? Number(signal.tp1) : entryPrice * 1.05;
  const slPrice = signal.sl ? Number(signal.sl) : entryPrice * 0.975;

  // 4. Mode Dry-Run (Simulasi)
  if (config.dryRun) {
    const simulatedMsg = `[SIMULASI] Order BUY ${formattedSymbol} pada harga $${entryPrice} berhasil. Target TP1: $${tpPrice.toFixed(4)}, SL: $${slPrice.toFixed(4)}.`;
    addAppLog("SUCCESS", "Tokocrypto", simulatedMsg);
    return {
      success: true,
      message: simulatedMsg,
      simulated: true,
      tpPrice,
      slPrice,
      order: {
        orderId: `SIM-${Date.now()}`,
        symbol: formattedSymbol,
        side: "BUY",
        type: "MARKET",
        status: "SIMULATED_FILLED",
        executedQty: 10,
        cummulativeQuoteQty: entryPrice * 10,
        price: entryPrice,
      },
    };
  }

  // 5. Cek Kredensial Nyata
  const apiKey = (config.tokocryptoApiKey || "").trim();
  const apiSecret = (config.tokocryptoApiSecret || "").trim();

  if (!apiKey || !apiSecret) {
    const msg = "API Key / Secret Tokocrypto belum dikonfigurasi.";
    addAppLog("ERROR", "Tokocrypto", msg);
    return { success: false, message: msg };
  }

  try {
    // Ambil saldo dompet
    const balanceInfo = await getTokocryptoBalance(
      apiKey,
      apiSecret,
      quoteAsset,
      baseUrl,
      customFetch,
    );

    // Ambil aturan simbol
    const rules = await getTokocryptoSymbolRules(
      formattedSymbol,
      baseUrl,
      customFetch,
    );

    // Ambil harga terkini (gunakan entryPrice sinyal jika ticker 0)
    let currentPrice = entryPrice;
    const ticker = await getTokocryptoTicker(
      formattedSymbol,
      baseUrl,
      customFetch,
    );
    if (ticker.lastPrice > 0) {
      currentPrice = ticker.lastPrice;
    }

    // Hitung alokasi lot size
    const riskPct = config.riskPerTradePct || 2.0;
    const qtyResult = calculateSpotOrderQuantity({
      balance: balanceInfo.free,
      riskPct,
      currentPrice,
      stepSize: rules.stepSize,
      minNotional: rules.minNotional,
    });

    if (!qtyResult.isValid) {
      const msg = `Gagal menghitung alokasi koin ${formattedSymbol}: ${qtyResult.reason}`;
      addAppLog("WARN", "Tokocrypto", msg);
      return { success: false, message: msg };
    }

    // Eksekusi order BUY Market ke Tokocrypto
    addAppLog(
      "INFO",
      "Tokocrypto",
      `Menembakkan BUY Market ${formattedSymbol} sebanyak ${qtyResult.quantity} (~$${qtyResult.notional})...`,
    );

    const orderResult = await placeTokocryptoOrder(
      apiKey,
      apiSecret,
      {
        symbol: formattedSymbol,
        side: "BUY",
        type: "MARKET",
        quantity: qtyResult.quantity,
      },
      baseUrl,
      customFetch,
    );

    const successMsg = `Order BUY ${formattedSymbol} berhasil dieksekusi di Tokocrypto! OrderID: ${orderResult.orderId}`;
    addAppLog("SUCCESS", "Tokocrypto", successMsg);

    return {
      success: true,
      message: successMsg,
      order: orderResult,
      tpPrice,
      slPrice,
    };
  } catch (err: any) {
    const errorMsg = `Gagal eksekusi order Tokocrypto untuk ${formattedSymbol}: ${err.message}`;
    addAppLog("ERROR", "Tokocrypto", errorMsg, err);
    return {
      success: false,
      message: errorMsg,
    };
  }
}
