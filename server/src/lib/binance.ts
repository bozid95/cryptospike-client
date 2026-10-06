import crypto from "crypto";
import { addAppLog } from "./logger";

export interface SymbolFilters {
  tickSize: number;
  stepSize: number;
  minNotional: number;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface PositionRiskItem {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  positionAmt: number;
  leverage: number;
  unRealizedProfit: number;
  liquidationPrice: number;
  isolatedMargin: number;
}

export interface SignalPayload {
  symbol: string;
  side: "LONG" | "SHORT" | string;
  entryPrice: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  sl?: number;
  strategy?: string;
  score?: number;
  strength?: string;
  [key: string]: any;
}

function getBaseUrl(isTestnet: boolean): string {
  return isTestnet
    ? "https://testnet.binancefuture.com"
    : "https://fapi.binance.com";
}

async function getBinanceServerTime(baseUrl: string): Promise<number> {
  try {
    const res = await fetch(`${baseUrl}/fapi/v1/time`);
    if (res.ok) {
      const data = (await res.json()) as { serverTime: number };
      return data.serverTime;
    }
  } catch {}
  return Date.now();
}

function createSignature(query: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
}

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
      `Gagal membaca filters untuk ${symbol}: ${err.message}`,
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

/**
 * Menguji validitas kredensial Binance Futures API Key & Secret
 */
export async function testBinanceConnection(
  apiKey: string,
  apiSecret: string,
  environment: "TESTNET" | "LIVE" | string,
): Promise<{ success: boolean; message: string; balance?: number }> {
  try {
    const isTestnet = environment === "TESTNET";
    const baseUrl = getBaseUrl(isTestnet);
    const timestamp = await getBinanceServerTime(baseUrl);

    const query = `timestamp=${timestamp}&recvWindow=60000`;
    const signature = createSignature(query, apiSecret);

    const response = await fetch(
      `${baseUrl}/fapi/v2/account?${query}&signature=${signature}`,
      {
        method: "GET",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );

    const data = (await response.json()) as any;

    if (!response.ok || data.code !== undefined) {
      return {
        success: false,
        message: data.msg || `Binance Error (HTTP ${response.status})`,
      };
    }

    const totalWalletBalance = parseFloat(data.totalWalletBalance || "0");
    const mode = isTestnet ? "Testnet" : "Live";

    return {
      success: true,
      message: `Terhubung ke Binance Futures (${mode})! Saldo: ${totalWalletBalance.toLocaleString()} USDT`,
      balance: totalWalletBalance,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Gagal menghubungi server Binance.",
    };
  }
}

export interface AccountOverview {
  totalWalletBalance: number;
  totalUnrealizedProfit: number;
  totalMarginBalance: number;
  availableBalance: number;
  totalMaintMargin: number;
  marginRatioPct: number;
  openPositionsCount: number;
  totalExposureUsd: number;
}

export interface PositionRiskItem {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  positionAmt: number;
  leverage: number;
  unRealizedProfit: number;
  liquidationPrice: number;
  isolatedMargin: number;
  notionalValue: number;
  roiPct: number;
  distanceToLiqPct: number;
  marginType: "ISOLATED" | "CROSSED";
}

/**
 * Mengambil detail akun lengkap, saldo, & posisi aktif di Binance Futures
 */
export async function getAccountAndPositions(
  apiKey: string,
  apiSecret: string,
  environment: string,
): Promise<{ account: AccountOverview; positions: PositionRiskItem[] }> {
  const isTestnet = environment === "TESTNET";
  const baseUrl = getBaseUrl(isTestnet);
  const timestamp = await getBinanceServerTime(baseUrl);

  const query = `timestamp=${timestamp}&recvWindow=60000`;
  const signature = createSignature(query, apiSecret);

  // 1. Ambil data ringkasan akun (/fapi/v2/account)
  const accRes = await fetch(
    `${baseUrl}/fapi/v2/account?${query}&signature=${signature}`,
    {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
    },
  );
  const accData = (await accRes.json()) as any;

  if (!accRes.ok || accData.code !== undefined) {
    throw new Error(accData.msg || "Gagal mengambil data akun Binance.");
  }

  // 2. Ambil data posisi aktif (/fapi/v2/positionRisk)
  const posRes = await fetch(
    `${baseUrl}/fapi/v2/positionRisk?${query}&signature=${signature}`,
    {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
    },
  );
  const posData = (await posRes.json()) as any;

  let totalExposureUsd = 0;
  const positions: PositionRiskItem[] = (Array.isArray(posData) ? posData : [])
    .filter((p: any) => parseFloat(p.positionAmt) !== 0)
    .map((p: any) => {
      const amt = parseFloat(p.positionAmt);
      const isLong = amt > 0;
      const entryPrice = parseFloat(p.entryPrice);
      const markPrice = parseFloat(p.markPrice);
      const leverage = parseInt(p.leverage) || 10;
      const unRealizedProfit = parseFloat(p.unRealizedProfit);
      const liquidationPrice = parseFloat(p.liquidationPrice);
      const positionAmt = Math.abs(amt);
      const notional = positionAmt * markPrice;
      totalExposureUsd += notional;

      // Hitung ROI %
      const priceDiffPct =
        entryPrice > 0
          ? isLong
            ? ((markPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - markPrice) / entryPrice) * 100
          : 0;
      const roiPct = priceDiffPct * leverage;

      // Hitung persentase jarak ke harga likuidasi
      let distanceToLiqPct = 0;
      if (liquidationPrice > 0 && markPrice > 0) {
        distanceToLiqPct = isLong
          ? ((markPrice - liquidationPrice) / markPrice) * 100
          : ((liquidationPrice - markPrice) / markPrice) * 100;
      }

      const isIsolated =
        (p.marginType || "").toLowerCase() === "isolated" ||
        p.isolated === true ||
        p.isolated === "true";
      const marginType: "ISOLATED" | "CROSSED" = isIsolated
        ? "ISOLATED"
        : "CROSSED";

      return {
        symbol: p.symbol,
        side: isLong ? "LONG" : "SHORT",
        entryPrice,
        markPrice,
        positionAmt,
        leverage,
        unRealizedProfit,
        liquidationPrice,
        isolatedMargin: parseFloat(p.isolatedMargin || "0"),
        notionalValue: notional,
        roiPct,
        distanceToLiqPct,
        marginType,
      };
    });

  const totalWalletBalance = parseFloat(accData.totalWalletBalance || "0");
  const totalUnrealizedProfit = parseFloat(
    accData.totalUnrealizedProfit || "0",
  );
  const totalMarginBalance = parseFloat(accData.totalMarginBalance || "0");
  const availableBalance = parseFloat(accData.availableBalance || "0");
  const totalMaintMargin = parseFloat(accData.totalMaintMargin || "0");

  const marginRatioPct =
    totalMarginBalance > 0 ? (totalMaintMargin / totalMarginBalance) * 100 : 0;

  const account: AccountOverview = {
    totalWalletBalance,
    totalUnrealizedProfit,
    totalMarginBalance,
    availableBalance,
    totalMaintMargin,
    marginRatioPct,
    openPositionsCount: positions.length,
    totalExposureUsd,
  };

  return { account, positions };
}

/**
 * Atur Leverage di Binance
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
      `Set leverage ${leverage}x untuk ${symbol} gagal: ${err.message}`,
    );
  }
}

/**
 * Atur Margin Type (ISOLATED) di Binance
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
    // Error code -4046 = sudah di set margin type yang sama
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
    type: "MARKET" | "LIMIT" | "STOP_MARKET";
    quantity?: number;
    price?: number;
    stopPrice?: number;
    reduceOnly?: boolean;
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
  if (params.timeInForce) queryObj.timeInForce = params.timeInForce;

  const query = Object.entries(queryObj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const signature = createSignature(query, apiSecret);

  const res = await fetch(
    `${baseUrl}/fapi/v1/order?${query}&signature=${signature}`,
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
      `Cancel all orders ${symbol} gagal: ${err.message}`,
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
  config: {
    autoExecute: boolean;
    binanceApiKey: string | null;
    binanceApiSecret: string | null;
    environment: string;
    marginType: string;
    leverage: number;
    riskPerTradePct: number;
    maxOpenPositions: number;
  },
) {
  const { symbol, side, entryPrice, tp1, tp2, tp3, sl, strategy } = signal;

  addAppLog(
    "INFO",
    "SignalEngine",
    `Menerima sinyal [${strategy || "AUTO"}] ${symbol} ${side} @ ${entryPrice}`,
  );

  // 1. Cek autoExecute
  if (!config.autoExecute) {
    addAppLog(
      "WARN",
      "Executor",
      `AutoExecute dinonaktifkan di konfigurasi. Sinyal ${symbol} dilewati.`,
    );
    return;
  }

  // 2. Cek Kredensial API
  if (!config.binanceApiKey || !config.binanceApiSecret) {
    addAppLog(
      "ERROR",
      "Executor",
      `API Key / Secret Binance belum dikonfigurasi. Eksekusi ${symbol} dibatalkan.`,
    );
    return;
  }

  const isTestnet = config.environment === "TESTNET";
  const apiKey = config.binanceApiKey.trim();
  const apiSecret = config.binanceApiSecret.trim();

  try {
    // 3. Cek posisi yang sedang terbuka di Binance
    const { positions } = await getAccountAndPositions(
      apiKey,
      apiSecret,
      config.environment,
    );

    if (positions.length >= (config.maxOpenPositions || 3)) {
      addAppLog(
        "WARN",
        "Executor",
        `Batas maksimal posisi tercapai (${positions.length}/${config.maxOpenPositions}). Sinyal ${symbol} dilewati.`,
      );
      return;
    }

    const existing = positions.find((p) => p.symbol === symbol);
    if (existing) {
      addAppLog(
        "WARN",
        "Executor",
        `Posisi untuk ${symbol} sudah berjalan di Binance (${existing.side} ${existing.positionAmt}). Eksekusi dilewati.`,
      );
      return;
    }

    // 4. Ambil saldo akun Binance
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
        `Saldo margin Binance kurang ($${walletBalance.toFixed(2)}). Minimal $10 diperlukan.`,
      );
      return;
    }

    // 5. Hitung ukuran posisi (Margin & Quantity)
    const filters = await getSymbolFilters(symbol, isTestnet);
    const riskPct = config.riskPerTradePct || 2.0;
    const marginToRisk = (walletBalance * riskPct) / 100;
    const leverage = config.leverage || 10;
    const notionalValue = marginToRisk * leverage;

    if (notionalValue < filters.minNotional) {
      addAppLog(
        "WARN",
        "Executor",
        `Nilai notional ($${notionalValue.toFixed(2)}) di bawah batas minimum Binance ($${filters.minNotional}). Eksekusi ${symbol} dilewati.`,
      );
      return;
    }

    const rawQty = notionalValue / entryPrice;
    const quantity = roundStep(rawQty, filters.stepSize);

    if (quantity <= 0) {
      addAppLog(
        "WARN",
        "Executor",
        `Quantity 0 setelah pembulatan stepSize (${filters.stepSize}) untuk ${symbol}.`,
      );
      return;
    }

    // 6. Set Leverage & Margin Type
    await setMarginType(
      apiKey,
      apiSecret,
      symbol,
      (config.marginType as "ISOLATED" | "CROSSED") || "ISOLATED",
      isTestnet,
    );
    await setLeverage(apiKey, apiSecret, symbol, leverage, isTestnet);

    // 7. Eksekusi Market Entry Order
    const orderSide = side === "LONG" ? "BUY" : "SELL";
    addAppLog(
      "INFO",
      "Executor",
      `Membuka order MARKET ${orderSide} ${quantity} ${symbol} (Margin: ~$${marginToRisk.toFixed(2)}, Lev: ${leverage}x)...`,
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
      `Order Entry Berhasil! ID: ${entryOrder.orderId} | ${symbol} ${side} ${quantity}`,
    );

    // 8. Pasang Take Profit Parsial (TP1: 50%, TP2: 30%, TP3: 20%) & Stop Loss
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
          `Gagal pasang TP1 ${symbol}: ${err.message}`,
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
          `Gagal pasang TP2 ${symbol}: ${err.message}`,
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
          `Gagal pasang TP3 ${symbol}: ${err.message}`,
        );
      }
    }

    // Pasang Hard Catastrophe Stop Loss (10% dari entry)
    const catastropheDist = side === "LONG" ? 0.9 : 1.1;
    const hardSL = roundTick(entryPrice * catastropheDist, filters.tickSize);
    try {
      await placeOrder(
        apiKey,
        apiSecret,
        {
          symbol,
          side: exitSide,
          type: "STOP_MARKET",
          stopPrice: hardSL,
          reduceOnly: true,
        },
        isTestnet,
      );
      addAppLog(
        "INFO",
        "Executor",
        `[HARD SL PLACED] ${symbol} Stop set di ${hardSL} (Proteksi Keamanan Crash)`,
      );
    } catch (err: any) {
      addAppLog(
        "WARN",
        "Executor",
        `Gagal pasang Hard SL ${symbol}: ${err.message}`,
      );
    }
  } catch (err: any) {
    addAppLog(
      "ERROR",
      "Executor",
      `Eksekusi sinyal ${symbol} gagal: ${err.message}`,
      err,
    );
  }
}
