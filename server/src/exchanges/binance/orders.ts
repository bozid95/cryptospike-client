import { getBaseUrl, getBinanceServerTime, createSignature } from "./client";
import { getSymbolFilters, roundStep, roundTick } from "./market";
import { getAccountAndPositions, testBinanceConnection } from "./account";
import { BinanceExecutionConfig } from "./types";
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
  params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
    quantity?: number;
    price?: number;
    stopPrice?: number;
    reduceOnly?: boolean;
    closePosition?: boolean;
    timeInForce?: "GTC" | "IOC" | "FOK";
  },
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
  if (params.reduceOnly) queryObj.reduceOnly = "true";
  if (params.closePosition) queryObj.closePosition = "true";
  if (params.timeInForce) queryObj.timeInForce = params.timeInForce;

  const isAlgo =
    params.type === "STOP_MARKET" || params.type === "TAKE_PROFIT_MARKET";
  if (isAlgo) {
    queryObj.algoType = "CONDITIONAL";
    if (queryObj.stopPrice) {
      queryObj.triggerPrice = queryObj.stopPrice;
      delete queryObj.stopPrice;
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
 * Membatalkan semua pesanan terbuka pada suatu simbol
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

    const res = await fetch(
      `${baseUrl}/fapi/v1/allOpenOrders?${query}&signature=${signature}`,
      {
        method: "DELETE",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );
    return await res.json();
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
  return await placeOrder(
    apiKey,
    apiSecret,
    {
      symbol,
      side: exitSide,
      type: "MARKET",
      quantity: target.positionAmt,
      reduceOnly: true,
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

  // 3. Cek Kredensial API
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

    if (walletBalance < 10) {
      addAppLog(
        "WARN",
        "Executor",
        `Insufficient Binance margin balance ($${walletBalance.toFixed(2)}). Minimum $10 required.`,
      );
      return;
    }

    // 6. Hitung ukuran posisi (Margin & Quantity)
    const filters = await getSymbolFilters(symbol, isTestnet);
    const riskPct = config.riskPerTradePct || 2.0;
    const marginToRisk = (walletBalance * riskPct) / 100;
    const leverage = config.leverage || 10;
    const notionalValue = marginToRisk * leverage;

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

    // Pasang TP3
    if (targetTp3 && qtyTP3 > 0) {
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

    // Pasang Stop Loss
    const targetSlPrice = sl
      ? roundTick(sl, filters.tickSize)
      : roundTick(
          entryPrice * (side === "LONG" ? 0.98 : 1.02),
          filters.tickSize,
        );

    try {
      await placeOrder(
        apiKey,
        apiSecret,
        {
          symbol,
          side: exitSide,
          type: "STOP_MARKET",
          stopPrice: targetSlPrice,
          closePosition: true,
        },
        isTestnet,
      );

      const slType = sl ? "SIGNAL SL" : "FALLBACK SL (2%)";
      addAppLog(
        "INFO",
        "Executor",
        `[${slType} PLACED] ${symbol} Stop Loss set at ${targetSlPrice}`,
      );
    } catch (err: any) {
      if (
        err.message?.includes("closePosition in the direction is existing") ||
        err.message?.includes("-4130")
      ) {
        // Fallback: pasang SL dengan reduceOnly & kuantitas spesifik jika closePosition bentrok
        try {
          await placeOrder(
            apiKey,
            apiSecret,
            {
              symbol,
              side: exitSide,
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
            `[${slType} PLACED] ${symbol} Stop Loss set at ${targetSlPrice} (qty: ${quantity}, reduceOnly)`,
          );
        } catch (retryErr: any) {
          addAppLog(
            "INFO",
            "Executor",
            `[SL ACTIVE] Position ${symbol} already protected by active stop order on Binance.`,
          );
        }
      } else {
        addAppLog(
          "WARN",
          "Executor",
          `Failed to place Stop Loss for ${symbol}: ${err.message}`,
        );
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
