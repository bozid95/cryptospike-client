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
        "Tokocrypto is a Spot exchange supporting only BUY / LONG positions. SHORT signals are automatically skipped.",
    };
  }

  if (side !== "LONG" && side !== "BUY") {
    return {
      allowed: false,
      reason: `Signal side '${side}' is not valid for Tokocrypto spot market.`,
    };
  }

  return { allowed: true, reason: "Signal is valid for spot BUY/LONG." };
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
      reason: "Insufficient wallet balance (0).",
    };
  }

  if (currentPrice <= 0) {
    return {
      quantity: 0,
      notional: 0,
      isValid: false,
      reason: "Invalid coin market price (<= 0).",
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
        reason: `Capital allocation ($${targetAllocation.toFixed(2)}) is below exchange minimum notional requirement ($${minNotional.toFixed(2)}).`,
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
      reason: `Coin quantity after rounding (${quantity}) produces notional value ($${actualNotional.toFixed(2)}) below minimum requirement ($${minNotional.toFixed(2)}).`,
    };
  }

  return {
    quantity,
    notional: parseFloat(actualNotional.toFixed(4)),
    isValid: true,
  };
}

export interface TokocryptoTpPlan {
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  tp1Qty: number;
  tp2Qty: number;
  tp3Qty: number;
  slPrice: number;
  isMergedToSingle: boolean;
}

/**
 * Menghitung alokasi parsial TP1 (50%), TP2 (30%), TP3 (20%) dan Stop Loss untuk Tokocrypto Spot
 * dilengkapi proteksi FeeShield (min +2.5%) dan Smart Merge jika notional per tier < minNotional ($5).
 */
export function calculateTokocryptoTpPlan(params: {
  totalQty: number;
  entryPrice: number;
  tp1?: number | undefined;
  tp2?: number | undefined;
  tp3?: number | undefined;
  sl?: number | undefined;
  stepSize: number;
  minNotional: number;
  tpMode?: "MULTI_TP" | "TP1_ONLY" | "TP2_ONLY" | "CUSTOM_ROI" | undefined;
  customTpRoiPct?: number | undefined;
  slMode?: "SIGNAL_SL" | "FIXED_PCT" | "MAX_LOSS_ROI" | undefined;
  customSlValue?: number | undefined;
}): TokocryptoTpPlan {
  const {
    totalQty,
    entryPrice,
    tp1,
    tp2,
    tp3,
    sl,
    stepSize,
    minNotional,
    tpMode = "MULTI_TP",
    customTpRoiPct,
    slMode = "SIGNAL_SL",
    customSlValue,
  } = params;

  // ── FEE SHIELD: Target minimal kotor adalah +2.5% agar margin profit bersih tetap tebal di atas biaya bursa ──
  const minGainPct = 2.5;
  let targetTp1 = tp1 ? Number(tp1) : entryPrice * 1.03;
  const tp1GainPct = ((targetTp1 - entryPrice) / entryPrice) * 100;

  if (tp1GainPct < minGainPct) {
    if (tp2 && ((Number(tp2) - entryPrice) / entryPrice) * 100 >= minGainPct) {
      targetTp1 = Number(tp2);
    } else {
      targetTp1 = entryPrice * 1.03;
    }
  }

  const targetTp2 =
    tp2 && Number(tp2) > targetTp1 ? Number(tp2) : targetTp1 * 1.015;
  const targetTp3 =
    tp3 && Number(tp3) > targetTp2 ? Number(tp3) : targetTp2 * 1.02;
  let slPrice = sl ? Number(sl) : entryPrice * 0.975;
  if (slMode === "FIXED_PCT" || slMode === "MAX_LOSS_ROI") {
    const dropPct = Math.max(0.5, Number(customSlValue || 2.5)) / 100;
    slPrice = entryPrice * (1 - dropPct);
  }

  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const roundStepLocal = (val: number) => {
    const stepped = Math.floor((val + stepSize * 1e-6) / stepSize) * stepSize;
    return parseFloat(stepped.toFixed(precision));
  };

  let qty1 = 0;
  let qty2 = 0;
  let qty3 = 0;

  if (tpMode === "TP1_ONLY") {
    qty1 = totalQty;
    qty2 = 0;
    qty3 = 0;
  } else if (tpMode === "TP2_ONLY") {
    qty1 = roundStepLocal(totalQty * 0.5);
    qty2 = parseFloat((totalQty - qty1).toFixed(precision));
    qty3 = 0;
  } else if (tpMode === "CUSTOM_ROI") {
    const customGain = Math.max(minGainPct, Number(customTpRoiPct || 3.5));
    targetTp1 = entryPrice * (1 + customGain / 100);
    qty1 = totalQty;
    qty2 = 0;
    qty3 = 0;
  } else {
    qty1 = roundStepLocal(totalQty * 0.5);
    qty2 = roundStepLocal(totalQty * 0.3);
    qty3 = roundStepLocal(Math.max(0, totalQty - qty1 - qty2));

    // Smart TP Merge jika nilai notional < minNotional (standar $5 USDT di Tokocrypto)
    if (qty3 > 0 && qty3 * targetTp3 < minNotional) {
      qty2 = roundStepLocal(qty2 + qty3);
      qty3 = 0;
    }
    if (qty2 > 0 && qty2 * targetTp2 < minNotional) {
      qty1 = totalQty;
      qty2 = 0;
    } else if (qty3 === 0 && qty2 > 0) {
      qty2 = parseFloat((totalQty - qty1).toFixed(precision));
    } else if (qty3 > 0) {
      qty3 = parseFloat((totalQty - qty1 - qty2).toFixed(precision));
    }
  }

  const isMergedToSingle = qty2 === 0 && qty3 === 0;
  if (isMergedToSingle) {
    qty1 = totalQty;
  }

  return {
    tp1Price: targetTp1,
    tp2Price: targetTp2,
    tp3Price: targetTp3,
    tp1Qty: qty1,
    tp2Qty: qty2,
    tp3Qty: qty3,
    slPrice,
    isMergedToSingle,
  };
}

/**
 * Membulatkan kuantitas ke bawah (Math.floor) sesuai stepSize bursa,
 * dan menjamin hasil pembulatan tidak pernah melebihi nilai aktual (val).
 */
export function floorToStepSize(val: number, stepSize: number): number {
  if (!Number.isFinite(val) || val <= 0) return 0;
  if (!stepSize || stepSize <= 0) return val;

  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  let stepped = Math.floor(val / stepSize + 1e-9) * stepSize;
  let result = parseFloat(stepped.toFixed(precision));

  if (result > val + 1e-12) {
    stepped = Math.max(0, result - stepSize);
    result = parseFloat(stepped.toFixed(precision));
  }

  return Math.max(0, result);
}

/**
 * Mengambil kuantitas koin bersih (net quantity) setelah dikurangi potongan
 * komisi beli (commission) dari endpoint GET /open/v1/orders/trades dan saldo dompet.
 */
export async function getTokocryptoOrderNetQty(params: {
  apiKey: string;
  apiSecret: string;
  symbol: string;
  orderId: string;
  fallbackGrossQty: number;
  stepSize: number;
  baseUrl?: string;
  customFetch?: typeof fetch;
}): Promise<number> {
  const {
    apiKey,
    apiSecret,
    symbol,
    orderId,
    fallbackGrossQty,
    stepSize,
    baseUrl = TOKOCRYPTO_BASE_URL,
    customFetch = fetch,
  } = params;

  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();
  const formattedSymbol = normalizeTokocryptoSymbol(symbol);
  const baseAsset = (
    formattedSymbol.split("_")[0] || formattedSymbol
  ).toUpperCase();

  let netFromTrades = 0;

  // 1. Query GET /open/v1/orders/trades untuk menghitung qty - commission (jika commissionAsset === baseAsset)
  try {
    const serverTime = await getTokocryptoServerTime(baseUrl, customFetch);
    const queryString = buildTokocryptoSignedQuery(
      { symbol: formattedSymbol },
      cleanSecret,
      serverTime,
    );

    const res = await customFetch(
      `${baseUrl}/open/v1/orders/trades?${queryString}`,
      {
        method: "GET",
        headers: {
          "X-MBX-APIKEY": cleanKey,
        },
      },
    );

    if (res.ok) {
      const json = (await res.json()) as any;
      const list = Array.isArray(json?.data?.list)
        ? json.data.list
        : Array.isArray(json?.data)
          ? json.data
          : [];

      const matchingTrades = list.filter(
        (t: any) => String(t.orderId || "") === String(orderId),
      );

      if (matchingTrades.length > 0) {
        let totalFillQty = 0;
        let totalBaseCommission = 0;

        for (const t of matchingTrades) {
          const fillQty = parseFloat(t.qty || "0");
          const comm = parseFloat(t.commission || "0");
          const commAsset = String(t.commissionAsset || "").toUpperCase();

          if (fillQty > 0) {
            totalFillQty += fillQty;
          }
          if (comm > 0 && commAsset === baseAsset) {
            totalBaseCommission += comm;
          }
        }

        if (totalFillQty > 0) {
          netFromTrades = Math.max(0, totalFillQty - totalBaseCommission);
        }
      }
    }
  } catch {}

  // 2. Cek saldo aktual baseAsset di dompet (GET /open/v1/account/spot/asset) sebagai pengaman tambahan
  let walletFreeBalance = 0;
  try {
    const bal = await getTokocryptoBalance(
      cleanKey,
      cleanSecret,
      baseAsset,
      baseUrl,
      customFetch,
    );
    if (bal.free > 0) {
      walletFreeBalance = bal.free;
    }
  } catch {}

  let rawNetQty = fallbackGrossQty;
  if (netFromTrades > 0) {
    rawNetQty =
      walletFreeBalance > 0
        ? Math.min(netFromTrades, walletFreeBalance)
        : netFromTrades;
  } else if (walletFreeBalance > 0 && walletFreeBalance <= fallbackGrossQty) {
    rawNetQty = walletFreeBalance;
  }

  const flooredQty = floorToStepSize(rawNetQty, stepSize);
  return flooredQty > 0
    ? flooredQty
    : floorToStepSize(fallbackGrossQty, stepSize);
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
    throw new Error(`Tokocrypto Order Failed [${json.code}]: ${json.msg}`);
  }

  const data = json.data || {};
  const parsedExecutedQty = parseFloat(data.executedQty || "0");
  return {
    orderId: String(data.orderId || data.id || Date.now()),
    clientId: data.clientId || params.clientId,
    symbol,
    side: side === 0 ? "BUY" : "SELL",
    type: type === 1 ? "LIMIT" : "MARKET",
    status: data.status || "FILLED",
    executedQty:
      parsedExecutedQty > 0 ? parsedExecutedQty : Number(params.quantity || 0),
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
    tp2?: number;
    tp3?: number;
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
  tpPlan?: TokocryptoTpPlan;
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
      message: "Auto-trade is disabled in Tokocrypto configuration.",
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

  // ── FEE SHIELD: Perhitungan target Take Profit & Stop Loss ──
  // Biaya Tokocrypto round-trip adalah 0.8088% (Taker 0.15% + PPh 0.21% + ICEx 0.0444% x 2).
  // Target minimal kotor adalah +2.5% agar margin profit bersih tetap tebal di atas biaya bursa.
  const entryPrice = Number(signal.entryPrice);
  const minGainPct = 2.5;
  let targetTp = signal.tp1 ? Number(signal.tp1) : entryPrice * 1.05;

  if (signal.tp1) {
    const tp1GainPct = ((Number(signal.tp1) - entryPrice) / entryPrice) * 100;
    if (tp1GainPct < minGainPct) {
      if (
        signal.tp2 &&
        ((Number(signal.tp2) - entryPrice) / entryPrice) * 100 >= minGainPct
      ) {
        targetTp = Number(signal.tp2);
        const newGain = (((targetTp - entryPrice) / entryPrice) * 100).toFixed(
          2,
        );
        addAppLog(
          "INFO",
          "Tokocrypto",
          `[FeeShield] TP1 ${signal.symbol} (+${tp1GainPct.toFixed(2)}%) is too tight (<${minGainPct}%). Target diverted to TP2: $${targetTp} (+${newGain}%). Exchange fee protected.`,
        );
      } else {
        targetTp = entryPrice * 1.03; // Fallback pengaman minimal +3.0%
        addAppLog(
          "INFO",
          "Tokocrypto",
          `[FeeShield] TP1 ${signal.symbol} (+${tp1GainPct.toFixed(2)}%) is too tight. Adjusted to safe minimum target +3.0%: $${targetTp.toFixed(4)}.`,
        );
      }
    }
  }

  const tpPrice = targetTp;
  const slPrice = signal.sl ? Number(signal.sl) : entryPrice * 0.975;

  // 4. Mode Dry-Run (Simulasi)
  if (config.dryRun) {
    const simulatedMsg = `[SIMULATION] BUY order ${formattedSymbol} at $${entryPrice} succeeded. Target TP: $${tpPrice.toFixed(4)}, SL: $${slPrice.toFixed(4)}.`;
    addAppLog("SUCCESS", "Tokocrypto", simulatedMsg);

    // Kuantitas simulasi disesuaikan dengan nominal kas ($ / Rp) yang disetel
    const fixedAmount = Number(config.riskPerTradePct) || 5.0;
    const simNotional = fixedAmount;
    const rawQty = simNotional / entryPrice;
    const simQty = Number(rawQty.toFixed(rawQty < 1 ? 6 : 4));

    const tpPlan = calculateTokocryptoTpPlan({
      totalQty: simQty > 0 ? simQty : 1,
      entryPrice,
      tp1: signal.tp1,
      tp2: signal.tp2,
      tp3: signal.tp3,
      sl: signal.sl,
      stepSize: 0.0001,
      minNotional: 5.0,
      tpMode: config.tpMode,
      customTpRoiPct: config.customTpRoiPct,
      slMode: config.slMode,
      customSlValue: config.customSlValue,
    });

    return {
      success: true,
      message: simulatedMsg,
      simulated: true,
      tpPlan,
      tpPrice: tpPlan.tp1Price,
      slPrice: tpPlan.slPrice,
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
    const msg = "Tokocrypto API Key / Secret is not configured.";
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
      const msg = `Failed to calculate coin allocation for ${formattedSymbol}: ${qtyResult.reason}`;
      addAppLog("WARN", "Tokocrypto", msg);
      return { success: false, message: msg };
    }

    // Eksekusi order BUY Market ke Tokocrypto
    addAppLog(
      "INFO",
      "Tokocrypto",
      `Submitting MARKET BUY order for ${formattedSymbol} qty ${qtyResult.quantity} (~$${qtyResult.notional})...`,
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

    // Hitung kuantitas bersih (net quantity) setelah potongan komisi beli bursa
    const netExecutedQty = await getTokocryptoOrderNetQty({
      apiKey,
      apiSecret,
      symbol: formattedSymbol,
      orderId: orderResult.orderId,
      fallbackGrossQty: orderResult.executedQty || qtyResult.quantity,
      stepSize: rules.stepSize,
      baseUrl,
      customFetch,
    });
    orderResult.executedQty = netExecutedQty;

    const successMsg = `BUY order for ${formattedSymbol} executed successfully on Tokocrypto! OrderID: ${orderResult.orderId} (Net Qty: ${netExecutedQty})`;
    addAppLog("SUCCESS", "Tokocrypto", successMsg);

    const tpPlan = calculateTokocryptoTpPlan({
      totalQty: netExecutedQty,
      entryPrice,
      tp1: signal.tp1,
      tp2: signal.tp2,
      tp3: signal.tp3,
      sl: signal.sl,
      stepSize: rules.stepSize,
      minNotional: rules.minNotional,
      tpMode: config.tpMode,
      customTpRoiPct: config.customTpRoiPct,
      slMode: config.slMode,
      customSlValue: config.customSlValue,
    });

    if (tpPlan.isMergedToSingle) {
      addAppLog(
        "INFO",
        "Tokocrypto",
        `[SmartMerge] Allocation under $15. TP merged into single target: $${tpPlan.tp1Price.toFixed(4)} (100% qty: ${tpPlan.tp1Qty}).`,
      );
    } else {
      addAppLog(
        "INFO",
        "Tokocrypto",
        `[Multi-TP Plan] TP1: 50% (${tpPlan.tp1Qty}) @ $${tpPlan.tp1Price.toFixed(4)} | TP2: 30% (${tpPlan.tp2Qty}) @ $${tpPlan.tp2Price.toFixed(4)} | TP3: 20% (${tpPlan.tp3Qty}) @ $${tpPlan.tp3Price.toFixed(4)} | SL: $${tpPlan.slPrice.toFixed(4)}.`,
      );
    }

    return {
      success: true,
      message: successMsg,
      order: orderResult,
      tpPlan,
      tpPrice: tpPlan.tp1Price,
      slPrice: tpPlan.slPrice,
    };
  } catch (err: any) {
    const errorMsg = `Failed to execute Tokocrypto order for ${formattedSymbol}: ${err.message}`;
    addAppLog("ERROR", "Tokocrypto", errorMsg, err);
    return {
      success: false,
      message: errorMsg,
    };
  }
}
