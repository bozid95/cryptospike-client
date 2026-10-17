import crypto from "crypto";

export function getBaseUrl(isTestnet: boolean): string {
  return isTestnet
    ? "https://testnet.binancefuture.com"
    : "https://fapi.binance.com";
}

export async function getBinanceServerTime(baseUrl: string): Promise<number> {
  try {
    const res = await fetch(`${baseUrl}/fapi/v1/time`);
    if (res.ok) {
      const data = (await res.json()) as { serverTime: number };
      return data.serverTime;
    }
  } catch {}
  return Date.now();
}

export function createSignature(query: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
}

const dualSideCache = new Map<string, { isDual: boolean; expires: number }>();

/**
 * Memeriksa apakah akun Binance Futures dalam Hedge Mode (dualSidePosition: true) atau One-way Mode
 */
export async function getPositionSideDual(
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean,
): Promise<boolean> {
  const cacheKey = `${isTestnet ? "TESTNET" : "LIVE"}_${apiKey.slice(-8)}`;
  const cached = dualSideCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.isDual;
  }

  try {
    const baseUrl = getBaseUrl(isTestnet);
    const ts = await getBinanceServerTime(baseUrl);
    const q = `timestamp=${ts}&recvWindow=60000`;
    const sig = createSignature(q, apiSecret);
    const res = await fetch(
      `${baseUrl}/fapi/v1/positionSide/dual?${q}&signature=${sig}`,
      {
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      const isDual = Boolean(data.dualSidePosition);
      dualSideCache.set(cacheKey, { isDual, expires: Date.now() + 60000 });
      return isDual;
    }
  } catch {}
  return false;
}
