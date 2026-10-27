import crypto from "crypto";
import { binanceFetch } from "./rate-guard";

export function getBaseUrl(isTestnet: boolean): string {
  return isTestnet
    ? "https://testnet.binancefuture.com"
    : "https://fapi.binance.com";
}

// Selisih jam lokal vs server Binance per base URL; sync ulang tiap 3 menit, bukan per request.
// Buffer -1 detik: timestamp di depan jam server ditolak (-1021), di belakang aman (recvWindow 60 detik).
const TIME_SYNC_TTL_MS = 3 * 60 * 1000;
const TIME_SAFETY_MS = 1000;
const timeOffsets = new Map<string, { offset: number; syncedAt: number }>();

export async function getBinanceServerTime(baseUrl: string): Promise<number> {
  const cached = timeOffsets.get(baseUrl);
  if (cached && Date.now() - cached.syncedAt < TIME_SYNC_TTL_MS) {
    return Date.now() + cached.offset - TIME_SAFETY_MS;
  }

  try {
    const t0 = Date.now();
    const res = await binanceFetch(`${baseUrl}/fapi/v1/time`);
    if (res.ok) {
      const data = (await res.json()) as { serverTime: number };
      const t1 = Date.now();
      timeOffsets.set(baseUrl, {
        offset: data.serverTime - Math.round((t0 + t1) / 2),
        syncedAt: t1,
      });
      return data.serverTime;
    }
  } catch {}
  return Date.now() + (cached?.offset ?? 0);
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
    const res = await binanceFetch(
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
