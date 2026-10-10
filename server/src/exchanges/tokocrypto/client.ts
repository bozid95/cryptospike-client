import crypto from "crypto";

export const TOKOCRYPTO_BASE_URL = "https://www.tokocrypto.com";

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
