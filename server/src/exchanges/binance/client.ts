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
