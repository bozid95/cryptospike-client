/**
 * Routing URL & aturan kesehatan WebSocket Binance Futures (tanpa dependency DB agar mudah diuji).
 *
 * Sejak 2026-04-23 Binance LIVE memensiunkan URL tanpa jalur (wss://fstream.binance.com/ws/...):
 * koneksi tetap terbuka tetapi data market/user TIDAK dikirim. LIVE wajib memakai jalur:
 *  - /market  → stream market biasa (markPrice, ticker, kline)
 *  - /private → user data stream (listenKey)
 * TESTNET (stream.binancefuture.com) masih melayani URL lama.
 */
export const LIVE_MARKET_WS_BASE = "wss://fstream.binance.com/market/ws/";
export const LIVE_PRIVATE_WS_BASE = "wss://fstream.binance.com/private/ws/";
export const TESTNET_WS_BASE = "wss://stream.binancefuture.com/ws/";

/** Stream market tersambung tapi diam selama ini → dianggap putus / jalur salah. */
export const MARKET_STALE_MS = 30_000;
/** Saat WebSocket sehat, monitor REST tetap jalan sebagai jaring pengaman dengan jeda ini. */
export const MONITOR_SAFETY_INTERVAL_MS = 60_000;

export function getMarketWsUrl(isTestnet: boolean): string {
  return `${isTestnet ? TESTNET_WS_BASE : LIVE_MARKET_WS_BASE}!markPrice@arr@1s`;
}

export function getUserDataWsUrl(isTestnet: boolean, listenKey: string): string {
  return `${isTestnet ? TESTNET_WS_BASE : LIVE_PRIVATE_WS_BASE}${listenKey}`;
}

/** True jika stream market terbuka sejak `connectedAt` tapi tidak menerima data selama MARKET_STALE_MS. */
export function isMarketStreamStale(
  connectedAt: number,
  lastDataAt: number,
  now: number,
): boolean {
  if (connectedAt <= 0) return false;
  return now - Math.max(connectedAt, lastDataAt) >= MARKET_STALE_MS;
}

/**
 * Stream dianggap sehat hanya jika user data stream terbuka DAN stream market benar-benar mengirim data.
 * "Tersambung" saja tidak cukup: URL yang salah tetap bisa terbuka tanpa pernah mengirim event.
 */
export function isStreamHealthy(
  userStreamOpen: boolean,
  marketLastDataAt: number,
  now: number,
): boolean {
  return (
    userStreamOpen &&
    marketLastDataAt > 0 &&
    now - marketLastDataAt < MARKET_STALE_MS
  );
}

/** Monitor REST: selalu jalan saat stream tidak sehat; saat sehat, hanya tiap MONITOR_SAFETY_INTERVAL_MS. */
export function shouldRunMonitorCycle(
  streamHealthy: boolean,
  lastRunAt: number,
  now: number,
): boolean {
  if (!streamHealthy) return true;
  return now - lastRunAt >= MONITOR_SAFETY_INTERVAL_MS;
}
