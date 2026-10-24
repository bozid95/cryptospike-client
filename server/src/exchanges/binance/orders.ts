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

    const res = await fetch(
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

    const res = await fetch(
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

  const res = await fetch(
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
    await fetch(
      `${baseUrl}/fapi/v1/allOpenOrders?${query}&signature=${signature}`,
      {
        method: "DELETE",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );

    // 2. Batalkan semua open algo orders (SL, TP, Trailing Stop)
    try {
      const algoRes = await fetch(
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
            await fetch(
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

    // 9. Pasang Take Profit Parsial (TP1: 50%, TP2: 30%, TP3: 20%) & Stop Loss
    const exitSide = side === "LONG" ? "SELL" : "BUY";
    const targetTp1 = tp1;
    const targetTp2 =
      tp2 ||
      (side === "LONG"
        ? targetTp1
          ? targetTp1 * 1.015
          : entryPrice * 1.03
        : targetTp1
          ? targetTp1 * 0.985
          : entryPrice * 0.97);
    const targetTp3 =
      tp3 || (side === "LONG" ? targetTp2 * 1.02 : targetTp2 * 0.98);

    let qtyTP1 = roundStep(quantity * 0.5, filters.stepSize);
    let qtyTP2 = roundStep(quantity * 0.3, filters.stepSize);
    let qtyTP3 = roundStep(
      Math.max(0, quantity - qtyTP1 - qtyTP2),
      filters.stepSize,
    );

    // Smart TP merge jika < minNotional
    if (qtyTP3 > 0 && qtyTP3 * targetTp3 < filters.minNotional) {
      qtyTP2 = roundStep(qtyTP2 + qtyTP3, filters.stepSize);
      qtyTP3 = 0;
    }
    if (qtyTP2 > 0 && qtyTP2 * targetTp2 < filters.minNotional) {
      qtyTP1 = roundStep(qtyTP1 + qtyTP2, filters.stepSize);
      qtyTP2 = 0;
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

    // Pasang Stop Loss (Guaranteed Double-Layer Protection)
    const targetSlPrice = sl
      ? roundTick(sl, filters.tickSize)
      : roundTick(
          entryPrice * (side === "LONG" ? 0.98 : 1.02),
          filters.tickSize,
        );

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

    const res = await fetch(
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
 * Memindahkan Stop Loss ke Break-Even (Harga Entry + Buffer Fee)
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
  try {
    const filters = await getSymbolFilters(symbol, isTestnet);
    const exitSide = side === "LONG" ? "SELL" : "BUY";
    const multiplier =
      side === "LONG" ? 1 + bufferPct / 100 : 1 - bufferPct / 100;
    const bepPrice = roundTick(entryPrice * multiplier, filters.tickSize);

    // 1. Ambil order terbuka dan batalkan STOP_MARKET lama
    const openOrders = await getOpenOrders(
      apiKey,
      apiSecret,
      symbol,
      isTestnet,
    );
    const baseUrl = getBaseUrl(isTestnet);

    for (const ord of openOrders) {
      if (ord.type === "STOP_MARKET" || ord.origType === "STOP_MARKET") {
        try {
          const timestamp = await getBinanceServerTime(baseUrl);
          const delQuery = `symbol=${symbol}&orderId=${ord.orderId}&timestamp=${timestamp}&recvWindow=60000`;
          const delSig = createSignature(delQuery, apiSecret);
          await fetch(
            `${baseUrl}/fapi/v1/order?${delQuery}&signature=${delSig}`,
            {
              method: "DELETE",
              headers: { "X-MBX-APIKEY": apiKey },
            },
          );
          addAppLog(
            "INFO",
            "AutoBEP",
            `[Auto-BEP] Canceled old regular SL (${ord.orderId}) for ${symbol}`,
          );
        } catch {}
      }
    }

    // 1b. Batalkan STOP_MARKET lama di openAlgoOrders
    try {
      const timestamp = await getBinanceServerTime(baseUrl);
      const query = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=60000`;
      const sig = createSignature(query, apiSecret);
      const algoRes = await fetch(
        `${baseUrl}/fapi/v1/openAlgoOrders?${query}&signature=${sig}`,
        { headers: { "X-MBX-APIKEY": apiKey } },
      );
      if (algoRes.ok) {
        const algoData = (await algoRes.json()) as any;
        const algoOrders = Array.isArray(algoData?.orders)
          ? algoData.orders
          : Array.isArray(algoData)
            ? algoData
            : [];
        for (const algo of algoOrders) {
          if (
            (algo.orderType === "STOP_MARKET" ||
              algo.algoType === "CONDITIONAL") &&
            algo.closePosition === true &&
            algo.algoId
          ) {
            const delTs = await getBinanceServerTime(baseUrl);
            const delQ = `symbol=${symbol}&algoId=${algo.algoId}&timestamp=${delTs}&recvWindow=60000`;
            const delSig = createSignature(delQ, apiSecret);
            await fetch(
              `${baseUrl}/fapi/v1/algoOrder?${delQ}&signature=${delSig}`,
              { method: "DELETE", headers: { "X-MBX-APIKEY": apiKey } },
            );
            addAppLog(
              "INFO",
              "AutoBEP",
              `[Auto-BEP] Canceled old algo SL (${algo.algoId}) for ${symbol}`,
            );
          }
        }
      }
    } catch {}

    // 2. Pasang SL baru di harga BEP
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
      },
      isTestnet,
    );

    addAppLog(
      "SUCCESS",
      "AutoBEP",
      `[Auto-BEP] Stop Loss moved to Break-Even for ${symbol} @ ${bepPrice} (+${bufferPct}% fee buffer). Position is now RISK-FREE!`,
    );
    return true;
  } catch (err: any) {
    addAppLog(
      "WARN",
      "AutoBEP",
      `[Auto-BEP] Failed to move SL to Break-Even for ${symbol}: ${err.message}`,
    );
    return false;
  }
}
