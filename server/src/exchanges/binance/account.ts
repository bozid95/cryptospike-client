import { getBaseUrl, getBinanceServerTime, createSignature } from "./client";
import { PositionRiskItem } from "./types";
import { AccountOverview } from "../types";

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
      message: `Connected to Binance Futures (${mode})! Wallet Balance: ${totalWalletBalance.toLocaleString()} USDT`,
      balance: totalWalletBalance,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to connect to Binance server.",
    };
  }
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
    throw new Error(accData.msg || "Failed to retrieve Binance account data.");
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
    quoteAsset: "USDT",
  };

  return { account, positions };
}
