import {
  TOKOCRYPTO_BASE_URL,
  getTokocryptoServerTime,
  buildTokocryptoSignedQuery,
} from "./client";
import {
  normalizeTokocryptoSymbol,
  getTokocryptoSymbolRules,
  getTokocryptoTicker,
} from "./market";
import { getTokocryptoBalance } from "./account";
import {
  TokocryptoOrderParams,
  TokocryptoOrderResult,
  TokocryptoExecutionConfig,
} from "./types";
import { evaluateCoinFilter } from "../../lib/coin-filter";
import { addAppLog } from "../../lib/logger";

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
/**
 * Menghitung kuantitas koin yang dapat dibeli di pasar Spot berdasarkan nominal kas tetap ($ / Rp)
 * atau persentase, pembulatan stepSize, dan validasi minNotional.
 */
export function calculateSpotOrderQuantity(params: {
  balance: number;
  riskPct?: number;
  fixedAmount?: number;
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
  const {
    balance,
    riskPct,
    fixedAmount,
    currentPrice,
    stepSize,
    minNotional,
    maxAllocationUsd,
  } = params;

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

  // Alokasi modal: Utamakan nominal kas tetap ($ / Rp) langsung (Opsi 1)
  let targetAllocation =
    fixedAmount && fixedAmount > 0
      ? fixedAmount
      : riskPct && riskPct > 0
        ? riskPct
        : minNotional;

  // Jika alokasi melebihi sisa saldo kas yang tersedia, sesuaikan ke saldo
  if (targetAllocation > balance) {
    targetAllocation = balance;
  }

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
  const side = params.side === 1 || params.side === "SELL" ? 1 : 0; // 0 = BUY, 1 = SELL
  const type = params.type === 1 || params.type === "LIMIT" ? 1 : 2; // 1 = LIMIT, 2 = MARKET

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
  const queryString = buildTokocryptoSignedQuery(
    payload,
    cleanSecret,
    serverTime,
  );

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

    // Kuantitas simulasi disesuaikan dengan nominal kas ($ / Rp) yang disetel
    const fixedAmount = Number(config.riskPerTradePct) || 5.0;
    const simNotional = fixedAmount;
    const rawQty = simNotional / entryPrice;
    const simQty = Number(rawQty.toFixed(rawQty < 1 ? 6 : 4));

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
        executedQty: simQty > 0 ? simQty : 1,
        cummulativeQuoteQty: simNotional,
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

    // Hitung alokasi lot size menggunakan nominal kas tetap ($ / Rp)
    const fixedAmount = Number(config.riskPerTradePct) || 5.0;
    const qtyResult = calculateSpotOrderQuantity({
      balance: balanceInfo.free,
      fixedAmount,
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
