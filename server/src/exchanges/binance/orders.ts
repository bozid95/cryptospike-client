import {
  getBaseUrl,
  getBinanceServerTime,
  createSignature,
  getPositionSideDual,
} from "./client";
import { getSymbolFilters, roundStep, roundTick } from "./market";
import { getAccountAndPositions, testBinanceConnection } from "./account";
import { BinanceExecutionConfig, PlaceOrderParams } from "./types";
import { SignalPayload } from "../types";
import { evaluateCoinFilter } from "../../lib/coin-filter";
import { addAppLog } from "../../lib/logger";
import { binanceFetch } from "./rate-guard";

/**
 * Atur Leverage di Binance Futures
 */
export async function setLeverage(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number,
  isTestnet: boolean,
) {
  try {
    const baseUrl = getBaseUrl(isTestnet);
    const timestamp = await getBinanceServerTime(baseUrl);
    const query = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}&recvWindow=60000`;
    const signature = createSignature(query, apiSecret);

    const res = await binanceFetch(
      `${baseUrl}/fapi/v1/leverage?${query}&signature=${signature}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );
    return await res.json();
  } catch (err: any) {
    addAppLog(
      "WARN",
      "Binance",
      `Failed to set leverage ${leverage}x for ${symbol}: ${err.message}`,
    );
  }
}

/**
 * Atur Margin Type (ISOLATED / CROSSED) di Binance Futures
 */
export async function setMarginType(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  marginType: "ISOLATED" | "CROSSED",
  isTestnet: boolean,
) {
  try {
    const baseUrl = getBaseUrl(isTestnet);
    const timestamp = await getBinanceServerTime(baseUrl);
    const query = `symbol=${symbol}&marginType=${marginType}&timestamp=${timestamp}&recvWindow=60000`;
    const signature = createSignature(query, apiSecret);

    const res = await binanceFetch(
      `${baseUrl}/fapi/v1/marginType?${query}&signature=${signature}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );
    return await res.json();
  } catch (err: any) {
    // Error code -4046 = margin type sudah diset sama
  }
}

/**
 * Mengirim Order ke Binance Futures
 */
export async function placeOrder(
  apiKey: string,
  apiSecret: string,
  params: PlaceOrderParams,
  isTestnet: boolean,
) {
  const baseUrl = getBaseUrl(isTestnet);
  const timestamp = await getBinanceServerTime(baseUrl);

  const queryObj: Record<string, any> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    timestamp,
    recvWindow: 60000,
  };

  if (params.quantity !== undefined) queryObj.quantity = params.quantity;
  if (params.price !== undefined) queryObj.price = params.price;
  if (params.stopPrice !== undefined) queryObj.stopPrice = params.stopPrice;
  if (params.callbackRate !== undefined)
    queryObj.callbackRate = params.callbackRate;
  if (params.activationPrice !== undefined)
    queryObj.activationPrice = params.activationPrice;
  if (params.reduceOnly) queryObj.reduceOnly = "true";
  if (params.closePosition) queryObj.closePosition = "true";
  if (params.timeInForce) queryObj.timeInForce = params.timeInForce;
  if (params.workingType) queryObj.workingType = params.workingType;

  // Deteksi Hedge Mode vs One-Way Mode otomatis
  const isDual = await getPositionSideDual(apiKey, apiSecret, isTestnet);
  if (isDual) {
    if (params.positionSide) {
      queryObj.positionSide = params.positionSide;
    } else if (params.reduceOnly || params.closePosition) {
      queryObj.positionSide = params.side === "BUY" ? "SHORT" : "LONG";
    } else {
      queryObj.positionSide = params.side === "BUY" ? "LONG" : "SHORT";
    }
    // Di Hedge Mode Binance Futures, parameter 'reduceOnly' dilarang pada semua order (Error -1106)
    delete queryObj.reduceOnly;
  } else {
    delete queryObj.positionSide;
  }

  const isAlgo =
    params.type === "STOP_MARKET" ||
    params.type === "TAKE_PROFIT_MARKET" ||
    params.type === "TRAILING_STOP_MARKET";
  if (isAlgo) {
    queryObj.algoType = "CONDITIONAL";
    if (queryObj.stopPrice) {
      queryObj.triggerPrice = queryObj.stopPrice;
      delete queryObj.stopPrice;
    }
    if (queryObj.activationPrice) {
      queryObj.activatePrice = queryObj.activationPrice;
      delete queryObj.activationPrice;
    }
  }

  const query = Object.entries(queryObj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const signature = createSignature(query, apiSecret);

  const endpoint = isAlgo ? "/fapi/v1/algoOrder" : "/fapi/v1/order";

  const res = await binanceFetch(
    `${baseUrl}${endpoint}?${query}&signature=${signature}`,
    {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    },
  );

  const data = (await res.json()) as any;
  if (!res.ok || data.code !== undefined) {
    throw new Error(data.msg || `Binance Error (HTTP ${res.status})`);
  }
  return data;
}

/**
 * Membatalkan semua pesanan terbuka pada suatu simbol (Regular Orders + Algo Orders)
 */
export async function cancelAllOpenOrders(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  isTestnet: boolean,
) {
  try {
    const baseUrl = getBaseUrl(isTestnet);
    const timestamp = await getBinanceServerTime(baseUrl);
    const query = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=60000`;
    const signature = createSignature(query, apiSecret);

    // 1. Batalkan semua regular orders
    await binanceFetch(
      `${baseUrl}/fapi/v1/allOpenOrders?${query}&signature=${signature}`,
      {
        method: "DELETE",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );

    // 2. Batalkan semua open algo orders (SL, TP, Trailing Stop)
    try {
      const algoRes = await binanceFetch(
        `${baseUrl}/fapi/v1/openAlgoOrders?${query}&signature=${signature}`,
        {
          headers: { "X-MBX-APIKEY": apiKey },
        },
      );
      if (algoRes.ok) {
        const algoData = (await algoRes.json()) as any;
        const algoOrders = Array.isArray(algoData?.orders)
          ? algoData.orders
          : Array.isArray(algoData)
            ? algoData
            : [];
        for (const algo of algoOrders) {
          if (algo.algoId) {
            const delTs = await getBinanceServerTime(baseUrl);
            const delQuery = `symbol=${symbol}&algoId=${algo.algoId}&timestamp=${delTs}&recvWindow=60000`;
            const delSig = createSignature(delQuery, apiSecret);
            await binanceFetch(
              `${baseUrl}/fapi/v1/algoOrder?${delQuery}&signature=${delSig}`,
              {
                method: "DELETE",
                headers: { "X-MBX-APIKEY": apiKey },
              },
            );
          }
        }
      }
    } catch {}

    return { success: true };
  } catch (err: any) {
    addAppLog(
      "WARN",
      "Binance",
      `Failed to cancel all orders for ${symbol}: ${err.message}`,
    );
  }
}

/**
 * Menutup Posisi Aktif Secara Manual
 */
export async function closePositionDirect(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  isTestnet: boolean,
) {
  const { positions } = await getAccountAndPositions(
    apiKey,
    apiSecret,
    isTestnet ? "TESTNET" : "LIVE",
  );
  const target = positions.find((p) => p.symbol === symbol);
  if (!target) {
    throw new Error(`Tidak ditemukan posisi aktif untuk simbol ${symbol}`);
  }

  // Cancel semua open orders
  await cancelAllOpenOrders(apiKey, apiSecret, symbol, isTestnet);

  const exitSide = target.side === "LONG" ? "SELL" : "BUY";
  const isHedge = await getPositionSideDual(apiKey, apiSecret, isTestnet);
  const posSide = isHedge ? target.side : undefined;
  return await placeOrder(
    apiKey,
    apiSecret,
    {
      symbol,
      side: exitSide,
      positionSide: posSide,
      type: "MARKET",
      quantity: target.positionAmt,
      reduceOnly: !isHedge,
    },
    isTestnet,
  );
}

/**
 * Eksekutor Sinyal Lengkap (Entry Market + TP Parsial + Catastrophe Hard SL)
 */
export async function executeSignalOrder(
  signal: SignalPayload,
  config: BinanceExecutionConfig,
) {
  const { symbol, side, entryPrice, tp1, tp2, tp3, sl, strategy } = signal;

  const tpStr = [tp1, tp2, tp3].filter(Boolean).join("/");
  const slStr = sl ? sl.toString() : "None";

  addAppLog(
    "INFO",
    "SignalEngine",
    `Received signal [${strategy || "AUTO"}] ${symbol} ${side} @ ${entryPrice} (TP: ${tpStr || "None"} | SL: ${slStr})`,
  );

  // 1. Cek autoExecute
  if (!config.autoExecute) {
    addAppLog(
      "WARN",
      "Executor",
      `AutoExecute is disabled in configuration. Signal ${symbol} skipped.`,
    );
    return;
  }

  // 2. Cek Filter Koin (Trading Scope: WHITELIST / BLACKLIST)
  const filterEval = evaluateCoinFilter(
    (
      signal?.symbol ||
      signal?.pair ||
      signal?.coin ||
      signal?.data?.symbol ||
      symbol ||
      ""
    ).toString(),
    config.coinFilterMode || "ALL",
    config.targetCoins || "",
  );

  if (!filterEval.allowed) {
    addAppLog("WARN", "CoinFilter", filterEval.reason);
    return;
  }

  if ((config.coinFilterMode || "ALL").toUpperCase() !== "ALL") {
    addAppLog("INFO", "CoinFilter", filterEval.reason);
  }

  // 3. Cek Filter Arah Posisi (Trade Direction: BOTH / LONG_ONLY / SHORT_ONLY)
  const allowedDirection = (
    config.tradeDirection ||
    process.env.BINANCE_ALLOWED_SIDE ||
    "BOTH"
  ).toUpperCase();
  const rawSide = (side || "").toString().trim().toUpperCase();
  const normalizedSignalSide =
    rawSide === "BUY" ? "LONG" : rawSide === "SELL" ? "SHORT" : rawSide;

  if (normalizedSignalSide !== "LONG" && normalizedSignalSide !== "SHORT") {
    addAppLog(
      "WARN",
      "DirectionFilter",
      `Signal ${symbol} skipped: Invalid side '${side}'. Must be LONG or SHORT.`,
    );
    return;
  }

  if (allowedDirection === "LONG_ONLY" && normalizedSignalSide !== "LONG") {
    addAppLog(
      "WARN",
      "DirectionFilter",
      `Signal ${symbol} ${side} skipped: Binance bot is configured for LONG_ONLY.`,
    );
    return;
  }

  if (allowedDirection === "SHORT_ONLY" && normalizedSignalSide !== "SHORT") {
    addAppLog(
      "WARN",
      "DirectionFilter",
      `Signal ${symbol} ${side} skipped: Binance bot is configured for SHORT_ONLY.`,
    );
    return;
  }

  // 4. Cek Filter Skor Minimum (Minimum Signal Score)
  const minScore = Number(config.minScore ?? 0);
  const rawScore = signal?.score ?? signal?.data?.score;
  const signalScore =
    rawScore !== undefined && rawScore !== null ? Number(rawScore) : 0;
  if (minScore > 0) {
    if (isNaN(signalScore) || signalScore < minScore) {
      addAppLog(
        "WARN",
        "ScoreFilter",
        `Signal ${symbol} skipped: Score (${signalScore}) is below minimum threshold (${minScore}).`,
      );
      return;
    }
  }

  // 5. Cek Filter Tren Makro BTC (Block LONG on BTC Bearish/Choppy)
  const shouldBlockBtc = config.blockLongOnBtcBearish ?? true;
  if (shouldBlockBtc && normalizedSignalSide === "LONG") {
    const rawBtcBias = (
      signal?.analytics?.btcTrendBias ||
      signal?.analytics?.extraData?.btcMtf?.h4?.trend ||
      signal?.analytics?.extraData?.trendBias ||
      signal?.btcTrendBias ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    if (rawBtcBias === "bearish" || rawBtcBias === "choppy") {
      addAppLog(
        "WARN",
        "BtcFilter",
        `Signal ${symbol} LONG skipped: BTC macro trend is ${rawBtcBias.toUpperCase()} (Block LONG protection active).`,
      );
      return;
    }
  }

  // 6. Cek Kredensial API
  if (!config.binanceApiKey || !config.binanceApiSecret) {
    addAppLog(
      "ERROR",
      "Executor",
      `Binance API Key / Secret is not configured. Execution for ${symbol} aborted.`,
    );
    return;
  }

  const isTestnet = config.environment === "TESTNET";
  const apiKey = config.binanceApiKey.trim();
  const apiSecret = config.binanceApiSecret.trim();

  try {
    // 4. Cek posisi yang sedang terbuka di Binance
    const { positions } = await getAccountAndPositions(
      apiKey,
      apiSecret,
      config.environment,
    );

    if (positions.length >= (config.maxOpenPositions || 3)) {
      addAppLog(
        "WARN",
        "Executor",
        `Max open positions limit reached (${positions.length}/${config.maxOpenPositions}). Signal ${symbol} skipped.`,
      );
      return;
    }

    const existing = positions.find((p) => p.symbol === symbol);
    if (existing) {
      addAppLog(
        "WARN",
        "Executor",
        `Position for ${symbol} is already open on Binance (${existing.side} ${existing.positionAmt}). Execution skipped.`,
      );
      return;
    }

    // 5. Ambil saldo akun Binance
    const conn = await testBinanceConnection(
      apiKey,
      apiSecret,
      config.environment,
    );
    const walletBalance = conn.balance || 0;

    if (walletBalance < 5) {
      addAppLog(
        "WARN",
        "Executor",
        `Insufficient Binance margin balance ($${walletBalance.toFixed(2)}). Minimum $5 required.`,
      );
      return;
    }

    // 6. Hitung ukuran posisi (Margin & Quantity)
    const filters = await getSymbolFilters(symbol, isTestnet);
    const riskMode = (config.riskMode || "PERCENTAGE").toUpperCase();
    let marginToRisk: number;

    if (riskMode === "FIXED_USD") {
      marginToRisk = Math.max(0.1, Number(config.riskAmountUsd || 10.0));
    } else {
      const riskPct = config.riskPerTradePct || 2.0;
      marginToRisk = (walletBalance * riskPct) / 100;
    }

    if (marginToRisk > walletBalance) {
      addAppLog(
        "WARN",
        "Executor",
        `Required margin ($${marginToRisk.toFixed(2)}) exceeds available wallet balance ($${walletBalance.toFixed(2)}). Execution for ${symbol} skipped.`,
      );
      return;
    }

    const leverage = config.leverage || 10;
    let notionalValue = marginToRisk * leverage;

    // Auto-adjust margin jika notional di bawah minNotional Binance tetapi saldo mencukupi
    if (notionalValue < filters.minNotional) {
      const minMarginNeeded = filters.minNotional / leverage;
      if (walletBalance >= minMarginNeeded) {
        addAppLog(
          "INFO",
          "Executor",
          `Adjusted margin from $${marginToRisk.toFixed(2)} to $${minMarginNeeded.toFixed(2)} (${leverage}x) to meet Binance MIN_NOTIONAL ($${filters.minNotional}).`,
        );
        marginToRisk = minMarginNeeded;
        notionalValue = marginToRisk * leverage;
      }
    }

    if (notionalValue < filters.minNotional) {
      addAppLog(
        "WARN",
        "Executor",
        `Notional value ($${notionalValue.toFixed(2)}) is below Binance minimum limit ($${filters.minNotional}). Execution for ${symbol} skipped.`,
      );
      return;
    }

    const rawQty = notionalValue / entryPrice;
    const quantity = roundStep(rawQty, filters.stepSize);

    if (quantity <= 0) {
      addAppLog(
        "WARN",
        "Executor",
        `Quantity rounded down to 0 with stepSize (${filters.stepSize}) for ${symbol}.`,
      );
      return;
    }

    // 7. Set Leverage & Margin Type
    await setMarginType(
      apiKey,
      apiSecret,
      symbol,
      (config.marginType as "ISOLATED" | "CROSSED") || "ISOLATED",
      isTestnet,
    );
    await setLeverage(apiKey, apiSecret, symbol, leverage, isTestnet);

    // 8. Eksekusi Market Entry Order
    const orderSide = side === "LONG" ? "BUY" : "SELL";
    addAppLog(
      "INFO",
      "Executor",
      `Submitting MARKET ${orderSide} order ${quantity} ${symbol} (Margin: ~$${marginToRisk.toFixed(2)}, Lev: ${leverage}x)...`,
    );

    const entryOrder = await placeOrder(
      apiKey,
      apiSecret,
      {
        symbol,
        side: orderSide,
        type: "MARKET",
        quantity,
      },
      isTestnet,
    );

    addAppLog(
      "SUCCESS",
      "Executor",
      `Entry Order Succeeded! ID: ${entryOrder.orderId} | ${symbol} ${side} ${quantity}`,
    );

    // 9. Pasang Take Profit sesuai Target Mode & Stop Loss
    const exitSide = side === "LONG" ? "SELL" : "BUY";
    const tpMode = (config.tpMode || "MULTI_TP").toUpperCase();

    let targetTp1 = tp1;
    let targetTp2 =
      tp2 ||
      (side === "LONG"
        ? targetTp1
          ? targetTp1 * 1.015
          : entryPrice * 1.03
        : targetTp1
          ? targetTp1 * 0.985
          : entryPrice * 0.97);
    let targetTp3 =
      tp3 || (side === "LONG" ? targetTp2 * 1.02 : targetTp2 * 0.98);

    let qtyTP1 = 0;
    let qtyTP2 = 0;
    let qtyTP3 = 0;

    if (tpMode === "TP1_ONLY") {
      targetTp1 = tp1 || (side === "LONG" ? entryPrice * 1.015 : entryPrice * 0.985);
      qtyTP1 = quantity;
      qtyTP2 = 0;
      qtyTP3 = 0;
      addAppLog(
        "INFO",
        "Executor",
        `[TP1_ONLY MODE] 100% position targeted to close at TP1 (${targetTp1}) for ${symbol}`,
      );
    } else if (tpMode === "TP2_ONLY") {
      qtyTP1 = roundStep(quantity * 0.5, filters.stepSize);
      qtyTP2 = roundStep(Math.max(0, quantity - qtyTP1), filters.stepSize);
      qtyTP3 = 0;
      addAppLog(
        "INFO",
        "Executor",
        `[TP2_ONLY MODE] 50% at TP1 (${targetTp1}) & 50% at TP2 (${targetTp2}) for ${symbol}`,
      );
    } else if (tpMode === "CUSTOM_ROI") {
      const targetRoi = Math.max(1.0, Number(config.customTpRoiPct || 15.0));
      const priceDeltaPct = (targetRoi / leverage) / 100;
      const customTpPrice =
        side === "LONG"
          ? entryPrice * (1 + priceDeltaPct)
          : entryPrice * (1 - priceDeltaPct);

      targetTp1 = customTpPrice;
      qtyTP1 = quantity;
      qtyTP2 = 0;
      qtyTP3 = 0;
      addAppLog(
        "INFO",
        "Executor",
        `[CUSTOM_ROI MODE] 100% position targeted at +${targetRoi}% ROI (${customTpPrice.toFixed(4)}) for ${symbol}`,
      );
    } else if (tpMode === "CUSTOM_SPLIT") {
      const splitRatio = Math.max(10, Math.min(95, Number(config.customTpSplitRatio || 70)));
      const targetRoi = Math.max(1.0, Number(config.customTpRoiPct || 10.0));
      const priceDeltaPct = (targetRoi / leverage) / 100;
      const splitTp1Price =
        side === "LONG"
          ? entryPrice * (1 + priceDeltaPct)
          : entryPrice * (1 - priceDeltaPct);

      targetTp1 = splitTp1Price;
      targetTp2 =
        tp2 ||
        (side === "LONG"
          ? splitTp1Price * 1.02
          : splitTp1Price * 0.98);

      qtyTP1 = roundStep(quantity * (splitRatio / 100), filters.stepSize);
      qtyTP2 = roundStep(Math.max(0, quantity - qtyTP1), filters.stepSize);
      qtyTP3 = 0;

      addAppLog(
        "INFO",
        "Executor",
        `[CUSTOM_SPLIT MODE] ${splitRatio}% (${qtyTP1}) targeted at +${targetRoi}% ROI (${splitTp1Price.toFixed(4)}) & remaining ${100 - splitRatio}% (${qtyTP2}) at TP2 (${targetTp2.toFixed(4)}) for ${symbol}`,
      );
    } else {
      qtyTP1 = roundStep(quantity * 0.5, filters.stepSize);
      qtyTP2 = roundStep(quantity * 0.3, filters.stepSize);
      qtyTP3 = roundStep(
        Math.max(0, quantity - qtyTP1 - qtyTP2),
        filters.stepSize,
      );

      if (qtyTP3 > 0 && qtyTP3 * targetTp3 < filters.minNotional) {
        qtyTP2 = roundStep(qtyTP2 + qtyTP3, filters.stepSize);
        qtyTP3 = 0;
      }
      if (qtyTP2 > 0 && qtyTP2 * targetTp2 < filters.minNotional) {
        qtyTP1 = roundStep(qtyTP1 + qtyTP2, filters.stepSize);
        qtyTP2 = 0;
      }
    }

    // Pasang TP1
    if (targetTp1 && qtyTP1 > 0) {
      const p1 = roundTick(targetTp1, filters.tickSize);
      try {
        await placeOrder(
          apiKey,
          apiSecret,
          {
            symbol,
            side: exitSide,
            type: "LIMIT",
            price: p1,
            quantity: qtyTP1,
            timeInForce: "GTC",
            reduceOnly: true,
          },
          isTestnet,
        );
        addAppLog(
          "INFO",
          "Executor",
          `[TP1 PLACED] ${symbol} Qty: ${qtyTP1} @ ${p1}`,
        );
      } catch (err: any) {
        addAppLog(
          "WARN",
          "Executor",
          `Failed to place TP1 for ${symbol}: ${err.message}`,
        );
      }
    }

    // Pasang TP2
    if (targetTp2 && qtyTP2 > 0) {
      const p2 = roundTick(targetTp2, filters.tickSize);
      try {
        await placeOrder(
          apiKey,
          apiSecret,
          {
            symbol,
            side: exitSide,
            type: "LIMIT",
            price: p2,
            quantity: qtyTP2,
            timeInForce: "GTC",
            reduceOnly: true,
          },
          isTestnet,
        );
        addAppLog(
          "INFO",
          "Executor",
          `[TP2 PLACED] ${symbol} Qty: ${qtyTP2} @ ${p2}`,
        );
      } catch (err: any) {
        addAppLog(
          "WARN",
          "Executor",
          `Failed to place TP2 for ${symbol}: ${err.message}`,
        );
      }
    }

    // Pasang TP3 (Hybrid Runner: Trailing Stop 20% Moonbag)
    const isTrailingEnabled =
      config.trailingStopEnabled ??
      process.env.BINANCE_TRAILING_STOP !== "false";
    const rawCallback =
      config.trailingCallbackRate ??
      parseFloat(process.env.BINANCE_TRAILING_CALLBACK || "2.5");
    const trailingCallback = isNaN(rawCallback)
      ? 2.5
      : Number(Math.min(5.0, Math.max(0.1, rawCallback)).toFixed(1));
    const trailingActivationMode = (
      config.trailingActivation ||
      process.env.BINANCE_TRAILING_ACTIVATION ||
      "TP1"
    ).toUpperCase();

    if (qtyTP3 > 0) {
      if (isTrailingEnabled) {
        // Tentukan Activation Price (Default TP1 agar mulai melacak saat profit pertama tercapai)
        const activationBase =
          trailingActivationMode === "TP2" && targetTp2
            ? targetTp2
            : targetTp1 ||
              (side === "LONG" ? entryPrice * 1.015 : entryPrice * 0.985);
        const activationPrice = roundTick(activationBase, filters.tickSize);

        try {
          await placeOrder(
            apiKey,
            apiSecret,
            {
              symbol,
              side: exitSide,
              positionSide: side as "LONG" | "SHORT",
              type: "TRAILING_STOP_MARKET",
              quantity: qtyTP3,
              callbackRate: trailingCallback,
              activationPrice,
              reduceOnly: true,
            },
            isTestnet,
          );
          addAppLog(
            "INFO",
            "Executor",
            `[HYBRID RUNNER] ${symbol} Trailing Stop placed (20% Qty: ${qtyTP3}) | Callback: ${trailingCallback}% | Activation: ${activationPrice}`,
          );
        } catch (err: any) {
          addAppLog(
            "WARN",
            "Executor",
            `Failed to place Trailing Stop for ${symbol}: ${err.message}. Fallback to static TP3 Limit Order...`,
          );
          if (targetTp3) {
            const p3 = roundTick(targetTp3, filters.tickSize);
            try {
              await placeOrder(
                apiKey,
                apiSecret,
                {
                  symbol,
                  side: exitSide,
                  type: "LIMIT",
                  price: p3,
                  quantity: qtyTP3,
                  timeInForce: "GTC",
                  reduceOnly: true,
                },
                isTestnet,
              );
              addAppLog(
                "INFO",
                "Executor",
                `[TP3 FALLBACK PLACED] ${symbol} Qty: ${qtyTP3} @ ${p3}`,
              );
            } catch (fallbackErr: any) {
              addAppLog(
                "WARN",
                "Executor",
                `Failed to place fallback TP3 for ${symbol}: ${fallbackErr.message}`,
              );
            }
          }
        }
      } else if (targetTp3) {
        const p3 = roundTick(targetTp3, filters.tickSize);
        try {
          await placeOrder(
            apiKey,
            apiSecret,
            {
              symbol,
              side: exitSide,
              type: "LIMIT",
              price: p3,
              quantity: qtyTP3,
              timeInForce: "GTC",
              reduceOnly: true,
            },
            isTestnet,
          );
          addAppLog(
            "INFO",
            "Executor",
            `[TP3 PLACED] ${symbol} Qty: ${qtyTP3} @ ${p3}`,
          );
        } catch (err: any) {
          addAppLog(
            "WARN",
            "Executor",
            `Failed to place TP3 for ${symbol}: ${err.message}`,
          );
        }
      }
    }

    // Pasang Stop Loss (Guaranteed Double-Layer Protection with Custom SL Mode)
    const slMode = (config.slMode || "SIGNAL_SL").toUpperCase();
    let calculatedSlPrice: number;

    if (slMode === "FIXED_PCT") {
      const dropPct = Math.max(0.1, Number(config.customSlValue || 1.5)) / 100;
      calculatedSlPrice =
        side === "LONG"
          ? entryPrice * (1 - dropPct)
          : entryPrice * (1 + dropPct);
      addAppLog(
        "INFO",
        "Executor",
        `[FIXED_PCT SL] Stop Loss set at ${calculatedSlPrice.toFixed(4)} (-${(dropPct * 100).toFixed(2)}% price change) for ${symbol}`,
      );
    } else if (slMode === "MAX_LOSS_ROI") {
      const maxRoi = Math.max(1.0, Number(config.customSlValue || 15.0));
      const priceDeltaPct = (maxRoi / leverage) / 100;
      calculatedSlPrice =
        side === "LONG"
          ? entryPrice * (1 - priceDeltaPct)
          : entryPrice * (1 + priceDeltaPct);
      addAppLog(
        "INFO",
        "Executor",
        `[MAX_LOSS_ROI SL] Stop Loss set at ${calculatedSlPrice.toFixed(4)} (-${maxRoi}% ROI max loss / -${(priceDeltaPct * 100).toFixed(2)}% price change) for ${symbol}`,
      );
    } else {
      calculatedSlPrice = sl ? sl : entryPrice * (side === "LONG" ? 0.98 : 1.02);
    }

    const targetSlPrice = roundTick(calculatedSlPrice, filters.tickSize);

    // Buffer jeda 250ms untuk memastikan settlement posisi market entry di matching engine Binance selesai
    await new Promise((resolve) => setTimeout(resolve, 250));

    let slSuccess = false;

    // Layer 1: Coba pasang Stop Loss standar dengan closePosition: true
    try {
      await placeOrder(
        apiKey,
        apiSecret,
        {
          symbol,
          side: exitSide,
          positionSide: side as "LONG" | "SHORT",
          type: "STOP_MARKET",
          stopPrice: targetSlPrice,
          closePosition: true,
        },
        isTestnet,
      );

      slSuccess = true;
      const slType = sl ? "SIGNAL SL" : "FALLBACK SL (2%)";
      addAppLog(
        "INFO",
        "Executor",
        `[${slType} PLACED] ${symbol} Stop Loss set at ${targetSlPrice}`,
      );
    } catch (err: any) {
      addAppLog(
        "WARN",
        "Executor",
        `Primary closePosition Stop Loss for ${symbol} rejected (${err.message}). Retrying with explicit quantity fallback...`,
      );
    }

    // Layer 2: Fallback jika Layer 1 ditolak (TIF GTE / -4509, race condition, -4130, dll)
    if (!slSuccess) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await placeOrder(
          apiKey,
          apiSecret,
          {
            symbol,
            side: exitSide,
            positionSide: side as "LONG" | "SHORT",
            type: "STOP_MARKET",
            stopPrice: targetSlPrice,
            quantity,
            reduceOnly: true,
          },
          isTestnet,
        );
        const slType = sl ? "SIGNAL SL" : "FALLBACK SL (2%)";
        addAppLog(
          "INFO",
          "Executor",
          `[${slType} PLACED] ${symbol} Stop Loss set at ${targetSlPrice} (qty: ${quantity}, fallback active)`,
        );
      } catch (retryErr: any) {
        if (
          retryErr.message?.includes("already protected") ||
          retryErr.message?.includes("existing") ||
          retryErr.message?.includes("-4130")
        ) {
          addAppLog(
            "INFO",
            "Executor",
            `[SL ACTIVE] Position ${symbol} already protected by active stop order on Binance.`,
          );
        } else {
          addAppLog(
            "ERROR",
            "Executor",
            `CRITICAL: Failed to place fallback Stop Loss for ${symbol}: ${retryErr.message}`,
          );
        }
      }
    }
  } catch (err: any) {
    addAppLog(
      "ERROR",
      "Executor",
      `Signal execution failed for ${symbol}: ${err.message}`,
      err,
    );
  }
}

/**
 * Mengambil daftar order terbuka untuk simbol tertentu di Binance Futures
 */
export async function getOpenOrders(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  isTestnet: boolean,
): Promise<any[]> {
  try {
    const baseUrl = getBaseUrl(isTestnet);
    const timestamp = await getBinanceServerTime(baseUrl);
    const query = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=60000`;
    const signature = createSignature(query, apiSecret);

    const res = await binanceFetch(
      `${baseUrl}/fapi/v1/openOrders?${query}&signature=${signature}`,
      {
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as any[];
  } catch {
    return [];
  }
}

/**
 * Membulatkan harga ke tick dengan arah tertentu (floor / ceil).
 * Dipakai Auto-BEP agar pembulatan selalu ke arah yang lebih aman (menutup fee),
 * terutama pada koin dengan tickSize kasar (mis. CELOUSDT tick 0.0001 @ ~0.077).
 */
function roundTickDirectional(
  price: number,
  tickSize: number,
  mode: "floor" | "ceil",
): number {
  const precision = Math.max(0, Math.round(-Math.log10(tickSize)));
  const epsilon = tickSize * 1e-6;
  const steps =
    mode === "floor"
      ? Math.floor((price + epsilon) / tickSize)
      : Math.ceil((price - epsilon) / tickSize);
  return parseFloat((steps * tickSize).toFixed(precision));
}

interface ExistingStopOrder {
  kind: "regular" | "algo";
  id: string;
  triggerPrice: number;
}

/**
 * Mengambil semua STOP_MARKET penutup posisi (regular + algo) untuk arah exit tertentu.
 * Termasuk SL berbasis quantity (Layer 2 fallback), bukan hanya closePosition.
 */
async function listExitStopOrders(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  exitSide: "BUY" | "SELL",
  positionSide: "LONG" | "SHORT",
  isTestnet: boolean,
): Promise<ExistingStopOrder[]> {
  const result: ExistingStopOrder[] = [];
  const baseUrl = getBaseUrl(isTestnet);

  const matchesPositionSide = (ps?: string) =>
    !ps || ps === "BOTH" || ps === positionSide;

  // Regular orders
  const openOrders = await getOpenOrders(apiKey, apiSecret, symbol, isTestnet);
  for (const ord of openOrders) {
    const type = ord.origType || ord.type;
    if (
      type === "STOP_MARKET" &&
      ord.side === exitSide &&
      matchesPositionSide(ord.positionSide)
    ) {
      result.push({
        kind: "regular",
        id: String(ord.orderId),
        triggerPrice: parseFloat(ord.stopPrice || "0"),
      });
    }
  }

  // Algo orders
  try {
    const timestamp = await getBinanceServerTime(baseUrl);
    const query = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=60000`;
    const sig = createSignature(query, apiSecret);
    const res = await binanceFetch(
      `${baseUrl}/fapi/v1/openAlgoOrders?${query}&signature=${sig}`,
      { headers: { "X-MBX-APIKEY": apiKey } },
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      const algos = Array.isArray(data?.orders)
        ? data.orders
        : Array.isArray(data)
          ? data
          : [];
      for (const algo of algos) {
        if (
          algo.orderType === "STOP_MARKET" &&
          algo.side === exitSide &&
          matchesPositionSide(algo.positionSide) &&
          algo.algoId
        ) {
          result.push({
            kind: "algo",
            id: String(algo.algoId),
            triggerPrice: parseFloat(algo.triggerPrice || "0"),
          });
        }
      }
    }
  } catch {}

  return result;
}

/**
 * Membatalkan satu STOP order (regular atau algo). Return true jika berhasil.
 */
async function cancelStopOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  order: ExistingStopOrder,
  isTestnet: boolean,
): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl(isTestnet);
    const timestamp = await getBinanceServerTime(baseUrl);
    const idParam =
      order.kind === "algo" ? `algoId=${order.id}` : `orderId=${order.id}`;
    const query = `symbol=${symbol}&${idParam}&timestamp=${timestamp}&recvWindow=60000`;
    const sig = createSignature(query, apiSecret);
    const endpoint =
      order.kind === "algo" ? "/fapi/v1/algoOrder" : "/fapi/v1/order";
    const res = await binanceFetch(`${baseUrl}${endpoint}?${query}&signature=${sig}`, {
      method: "DELETE",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const data = (await res.json().catch(() => ({}))) as any;
    return (
      res.ok &&
      (data?.code === undefined ||
        String(data?.code) === "200" ||
        data?.msg === "success")
    );
  } catch {
    return false;
  }
}

function isImmediateTriggerError(err: any): boolean {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("immediately trigger") || msg.includes("-2021");
}

/**
 * Memindahkan Stop Loss ke Break-Even (Harga Entry + Buffer Fee) secara FAIL-SAFE.
 *
 * Prinsip: "Pasang dulu, baru batalkan" — posisi tidak pernah dibiarkan tanpa SL.
 *  1. Ambil posisi segar (sisa qty + mark price). Jika posisi sudah tutup → selesai.
 *  2. Hitung harga BEP dengan pembulatan ke arah aman & validasi jarak ≥ 2 tick dari mark price.
 *  3. Jika harga sudah melewati BEP → tutup sisa posisi via MARKET reduceOnly.
 *  4. Pasang SL BEP berbasis quantity + reduceOnly (bisa berdampingan dengan SL lama, tanpa -4130).
 *  5. Setelah SL BEP terkonfirmasi → batalkan SL lama.
 *  6. Upgrade SL BEP ke closePosition (tahan partial fill TP2); jika gagal, SL quantity tetap aktif.
 *
 * Return true jika posisi aman (SL BEP aktif / posisi sudah ditutup / posisi tidak ada).
 * Return false jika gagal — SL lama TIDAK disentuh sehingga posisi tetap terproteksi.
 */
export async function moveSlToBreakEven(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: "LONG" | "SHORT",
  entryPrice: number,
  isTestnet: boolean,
  bufferPct: number = 0.2,
): Promise<boolean> {
  const exitSide: "BUY" | "SELL" = side === "LONG" ? "SELL" : "BUY";
  const environment = isTestnet ? "TESTNET" : "LIVE";

  try {
    const filters = await getSymbolFilters(symbol, isTestnet);

    // 1. Ambil posisi segar
    const { positions } = await getAccountAndPositions(
      apiKey,
      apiSecret,
      environment,
    );
    const pos = positions.find((p) => p.symbol === symbol && p.side === side);
    if (!pos || pos.positionAmt <= 0) {
      addAppLog(
        "INFO",
        "AutoBEP",
        `[Auto-BEP] ${symbol} ${side} position already closed. Nothing to move.`,
      );
      return true;
    }

    const remainingQty = roundStep(pos.positionAmt, filters.stepSize);
    const markPrice = pos.markPrice;
    const effectiveEntry = entryPrice > 0 ? entryPrice : pos.entryPrice;

    // 2. Harga BEP dengan pembulatan ke arah aman
    const rawBep =
      side === "LONG"
        ? effectiveEntry * (1 + bufferPct / 100)
        : effectiveEntry * (1 - bufferPct / 100);
    const bepPrice = roundTickDirectional(
      rawBep,
      filters.tickSize,
      side === "LONG" ? "ceil" : "floor",
    );
    const minGap = filters.tickSize * 2;
    const epsilon = filters.tickSize * 1e-4;
    const bepValid =
      side === "LONG"
        ? bepPrice <= markPrice - minGap + epsilon
        : bepPrice >= markPrice + minGap - epsilon;

    // Snapshot SL lama SEBELUM memasang SL baru (agar SL baru tidak ikut terbatalkan)
    const oldStops = await listExitStopOrders(
      apiKey,
      apiSecret,
      symbol,
      exitSide,
      side,
      isTestnet,
    );

    const closeRemainingAtMarket = async (reason: string): Promise<boolean> => {
      addAppLog(
        "WARN",
        "AutoBEP",
        `[Auto-BEP] ${symbol} ${reason} (BEP: ${bepPrice}, Mark: ${markPrice}). Closing remaining ${remainingQty} at MARKET to lock break-even...`,
      );
      try {
        await placeOrder(
          apiKey,
          apiSecret,
          {
            symbol,
            side: exitSide,
            positionSide: side,
            type: "MARKET",
            quantity: remainingQty,
            reduceOnly: true,
          },
          isTestnet,
        );
        await cancelAllOpenOrders(apiKey, apiSecret, symbol, isTestnet);
        addAppLog(
          "SUCCESS",
          "AutoBEP",
          `[Auto-BEP] ${symbol} remaining position closed at MARKET. Leftover orders cleaned up.`,
        );
        return true;
      } catch (closeErr: any) {
        addAppLog(
          "ERROR",
          "AutoBEP",
          `[Auto-BEP] CRITICAL: Market close failed for ${symbol}: ${closeErr.message}. Old SL kept untouched (${oldStops.length} active).`,
        );
        return false;
      }
    };

    // 3. Harga sudah melewati BEP → tutup sisa posisi
    if (!bepValid) {
      return await closeRemainingAtMarket("price already beyond BEP");
    }

    // 4. Pasang SL BEP berbasis quantity (berdampingan dengan SL lama)
    let qtySl: ExistingStopOrder | null = null;
    try {
      const r = await placeOrder(
        apiKey,
        apiSecret,
        {
          symbol,
          side: exitSide,
          positionSide: side,
          type: "STOP_MARKET",
          stopPrice: bepPrice,
          quantity: remainingQty,
          reduceOnly: true,
          workingType: "MARK_PRICE",
        },
        isTestnet,
      );
      qtySl = {
        kind: r?.algoId ? "algo" : "regular",
        id: String(r?.algoId || r?.orderId),
        triggerPrice: bepPrice,
      };
    } catch (placeErr: any) {
      if (isImmediateTriggerError(placeErr)) {
        return await closeRemainingAtMarket(
          "price moved beyond BEP during placement",
        );
      }
      addAppLog(
        "ERROR",
        "AutoBEP",
        `[Auto-BEP] Failed to place BEP SL for ${symbol}: ${placeErr.message}. Old SL kept untouched (${oldStops.length} active).`,
      );
      return false;
    }

    // 5. SL BEP aktif → batalkan SL lama
    for (const old of oldStops) {
      const ok = await cancelStopOrder(
        apiKey,
        apiSecret,
        symbol,
        old,
        isTestnet,
      );
      addAppLog(
        ok ? "INFO" : "WARN",
        "AutoBEP",
        ok
          ? `[Auto-BEP] Canceled old SL (${old.kind} ${old.id} @ ${old.triggerPrice}) for ${symbol}`
          : `[Auto-BEP] Could not cancel old SL (${old.kind} ${old.id}) for ${symbol}. It is reduceOnly and will be cleaned up on close.`,
      );
    }

    // 6. Upgrade ke closePosition agar tahan terhadap partial fill TP2
    try {
      await placeOrder(
        apiKey,
        apiSecret,
        {
          symbol,
          side: exitSide,
          positionSide: side,
          type: "STOP_MARKET",
          stopPrice: bepPrice,
          closePosition: true,
          workingType: "MARK_PRICE",
        },
        isTestnet,
      );
      if (qtySl) {
        await cancelStopOrder(apiKey, apiSecret, symbol, qtySl, isTestnet);
      }
    } catch {
      // closePosition gagal (mis. -4130 / -4509) → SL BEP berbasis quantity tetap aktif. Aman.
    }

    addAppLog(
      "SUCCESS",
      "AutoBEP",
      `[Auto-BEP] Stop Loss moved to Break-Even for ${symbol} @ ${bepPrice} (+${bufferPct}% fee buffer, mark ${markPrice}). Position is now RISK-FREE!`,
    );
    return true;
  } catch (err: any) {
    addAppLog(
      "ERROR",
      "AutoBEP",
      `[Auto-BEP] Failed to move SL to Break-Even for ${symbol}: ${err.message}. Old SL kept untouched.`,
    );
    return false;
  }
}
