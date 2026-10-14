import WebSocket from "ws";
import { prisma } from "../lib/db";
import { addAppLog } from "../lib/logger";
import {
  getBaseUrl,
  cancelAllOpenOrders,
  moveSlToBreakEven,
  getAccountAndPositions,
} from "../lib/binance";
import { PositionRiskItem } from "../exchanges/binance/types";
import { AccountOverview } from "../exchanges/types";

interface MonitoredWsPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  initialQty: number;
  bepMoved: boolean;
  openedAt: number;
}

// State Internal WebSocket
let wsClient: WebSocket | null = null;
let currentListenKey: string | null = null;
let keepAliveTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isReconnecting = false;
let bannedUntilTimestamp: number = 0;
let isWsConnected = false;

// In-Memory Live State (untuk akses instan tanpa request ke bursa)
const livePositions = new Map<string, PositionRiskItem>();
let liveAccount: AccountOverview = {
  totalWalletBalance: 0,
  totalUnrealizedProfit: 0,
  openPositionsCount: 0,
  totalExposureUsd: 0,
  quoteAsset: "USDT",
};
let lastCacheUpdate = 0;

// Posisi yang sedang dipantau untuk siklus Auto-BEP & Clean-up
const monitoredWsPositions = new Map<string, MonitoredWsPosition>();

export function isBinanceWsConnected(): boolean {
  return isWsConnected && wsClient?.readyState === WebSocket.OPEN;
}

export function getLiveBinancePositions(): PositionRiskItem[] {
  return Array.from(livePositions.values());
}

export function getLiveBinanceAccount(): AccountOverview {
  return {
    ...liveAccount,
    openPositionsCount: livePositions.size,
  };
}

export function getLiveCacheLastUpdated(): number {
  return lastCacheUpdate;
}

/**
 * Mendaftarkan posisi yang baru dibuka agar dipantau Auto-BEP & Cleanup-nya oleh WebSocket
 */
export function registerPositionForWsMonitoring(params: {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
}): void {
  monitoredWsPositions.set(params.symbol, {
    symbol: params.symbol,
    side: params.side,
    entryPrice: params.entryPrice,
    initialQty: params.quantity,
    bepMoved: false,
    openedAt: Date.now(),
  });
}

function getWsBaseUrl(isTestnet: boolean): string {
  return isTestnet
    ? "wss://stream.binancefuture.com/ws/"
    : "wss://fstream.binance.com/ws/";
}

/**
 * Mengambil listenKey baru dari Binance Futures
 */
async function createListenKey(
  apiKey: string,
  isTestnet: boolean,
): Promise<string> {
  const baseUrl = getBaseUrl(isTestnet);
  const res = await fetch(`${baseUrl}/fapi/v1/listenKey`, {
    method: "POST",
    headers: {
      "X-MBX-APIKEY": apiKey,
    },
  });

  const data = (await res.json()) as any;

  if (!res.ok || !data.listenKey) {
    const errorMsg = data.msg || `HTTP ${res.status}`;
    // Deteksi jika IP sedang di-ban
    const banMatch = errorMsg.match(/banned until (\d+)/i);
    if (banMatch && banMatch[1]) {
      bannedUntilTimestamp = parseInt(banMatch[1], 10);
    }
    throw new Error(errorMsg);
  }

  return data.listenKey;
}

/**
 * Menjaga listenKey tetap aktif (keepalive setiap 30 menit)
 */
async function keepAliveListenKey(
  apiKey: string,
  isTestnet: boolean,
  listenKey: string,
): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl(isTestnet);
    const res = await fetch(
      `${baseUrl}/fapi/v1/listenKey?listenKey=${encodeURIComponent(listenKey)}`,
      {
        method: "PUT",
        headers: {
          "X-MBX-APIKEY": apiKey,
        },
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Menutup listenKey saat disconnect
 */
async function closeListenKey(
  apiKey: string,
  isTestnet: boolean,
  listenKey: string,
): Promise<void> {
  try {
    const baseUrl = getBaseUrl(isTestnet);
    await fetch(
      `${baseUrl}/fapi/v1/listenKey?listenKey=${encodeURIComponent(listenKey)}`,
      {
        method: "DELETE",
        headers: {
          "X-MBX-APIKEY": apiKey,
        },
      },
    );
  } catch {}
}

/**
 * Handler parsing event real-time dari Binance WebSocket
 */
export async function handleBinanceWsMessage(
  rawMessage: string,
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean,
): Promise<void> {
  try {
    const event = JSON.parse(rawMessage);
    const eventType = event.e;

    // ── 1. EVENT: ACCOUNT_UPDATE ───────────────────────────────────────
    if (eventType === "ACCOUNT_UPDATE") {
      const updateData = event.a;

      // Update Saldo
      if (Array.isArray(updateData?.B)) {
        for (const bal of updateData.B) {
          if (bal.a === "USDT") {
            liveAccount.totalWalletBalance = parseFloat(bal.wb || "0");
          }
        }
      }

      // Update Posisi
      if (Array.isArray(updateData?.P)) {
        for (const p of updateData.P) {
          const symbol = p.s;
          const posAmt = parseFloat(p.pa || "0");
          const absAmt = Math.abs(posAmt);
          const entryPrice = parseFloat(p.ep || "0");
          const unRealizedProfit = parseFloat(p.up || "0");

          if (absAmt > 0) {
            // Posisi Terbuka / Berubah
            const side: "LONG" | "SHORT" = posAmt > 0 ? "LONG" : "SHORT";
            livePositions.set(symbol, {
              symbol,
              side,
              entryPrice,
              markPrice: entryPrice, // akan diupdate secara dinamis
              positionAmt: absAmt,
              leverage: 10,
              unRealizedProfit,
              liquidationPrice: 0,
              isolatedMargin: 0,
              notionalValue: absAmt * entryPrice,
              roiPct: 0,
              distanceToLiqPct: 0,
              marginType: (p.mt || "ISOLATED").toUpperCase(),
            });

            // Sinkronkan ke monitoredWsPositions jika belum ada
            if (!monitoredWsPositions.has(symbol)) {
              monitoredWsPositions.set(symbol, {
                symbol,
                side,
                entryPrice,
                initialQty: absAmt,
                bepMoved: false,
                openedAt: Date.now(),
              });
            }
          } else {
            // Posisi Menjadi 0 (CLOSED / LIKUIDASI / SELESAI)
            livePositions.delete(symbol);

            const tracked = monitoredWsPositions.get(symbol);
            if (tracked) {
              addAppLog(
                "INFO",
                "BinanceWS",
                `[Realtime Cleanup] Position ${symbol} is now CLOSED (pa: 0). Cancelling leftover orders immediately...`,
              );
              monitoredWsPositions.delete(symbol);

              // ⚡ Eksekusi pembatalan massal order sisa seketika!
              cancelAllOpenOrders(apiKey, apiSecret, symbol, isTestnet).catch(
                (err) => {
                  addAppLog(
                    "WARN",
                    "BinanceWS",
                    `Cleanup failed for ${symbol}: ${err.message}`,
                  );
                },
              );
            }
          }
        }
      }

      lastCacheUpdate = Date.now();
    }

    // ── 2. EVENT: ORDER_TRADE_UPDATE ───────────────────────────────────
    if (eventType === "ORDER_TRADE_UPDATE") {
      const o = event.o;
      const symbol = o.s;
      const orderStatus = o.X; // FILLED, NEW, CANCELED, etc.
      const isReduceOnly = Boolean(o.R);
      const isExitOrder =
        isReduceOnly || o.ot === "TAKE_PROFIT_MARKET" || o.ot === "LIMIT";

      // Jika ada order exit yang berstatus FILLED (misal TP1 terpenuhi)
      if (orderStatus === "FILLED" && isExitOrder) {
        const tracked = monitoredWsPositions.get(symbol);
        const autoBepEnabled = process.env.BINANCE_AUTO_BEP !== "false";
        const bepBufferPct = parseFloat(
          process.env.BINANCE_BEP_BUFFER_PCT || "0.2",
        );

        if (tracked && !tracked.bepMoved && autoBepEnabled) {
          addAppLog(
            "INFO",
            "BinanceWS",
            `[Realtime Auto-BEP] Exit order filled for ${symbol}. Moving SL to Break-Even immediately...`,
          );

          tracked.bepMoved = true;
          moveSlToBreakEven(
            apiKey,
            apiSecret,
            symbol,
            tracked.side,
            tracked.entryPrice,
            isTestnet,
            bepBufferPct,
          ).catch((err) => {
            addAppLog(
              "WARN",
              "BinanceWS",
              `Auto-BEP move failed for ${symbol}: ${err.message}`,
            );
          });
        }
      }
    }

    // ── 3. EVENT: listenKeyExpired ─────────────────────────────────────
    if (eventType === "listenKeyExpired") {
      addAppLog(
        "WARN",
        "BinanceWS",
        "Binance listenKey expired. Reconnecting...",
      );
      restartBinanceWsService();
    }
  } catch (err: any) {
    addAppLog("WARN", "BinanceWS", `Error parsing WS message: ${err.message}`);
  }
}

/**
 * Menghubungkan WebSocket ke Binance Futures User Data Stream
 */
export async function connectBinanceWs(): Promise<void> {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    // 1. Cek apakah IP sedang di-ban oleh Binance
    const now = Date.now();
    if (bannedUntilTimestamp > now) {
      const waitMinutes = Math.ceil((bannedUntilTimestamp - now) / 60000);
      addAppLog(
        "WARN",
        "BinanceWS",
        `[Rate-Limit Pause] IP is banned by Binance until ${new Date(
          bannedUntilTimestamp,
        ).toLocaleTimeString()} (~${waitMinutes} min). WS connection paused to prevent ban extension.`,
      );

      // Jadwalkan reconnect otomatis setelah ban berakhir
      if (!reconnectTimer) {
        const delayMs = bannedUntilTimestamp - now + 5000;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          bannedUntilTimestamp = 0;
          connectBinanceWs();
        }, delayMs);
      }
      isReconnecting = false;
      return;
    }

    // 2. Ambil kredensial dari database
    const config = await prisma.binanceConfig.findUnique({
      where: { id: 1 },
    });

    if (!config?.apiKey || !config?.apiSecret) {
      isReconnecting = false;
      return;
    }

    const apiKey = config.apiKey.trim();
    const apiSecret = config.apiSecret.trim();
    const isTestnet = config.environment === "TESTNET";

    // 3. Minta listenKey baru
    const listenKey = await createListenKey(apiKey, isTestnet);
    currentListenKey = listenKey;

    // Inisialisasi snapshot akun sekali di awal via REST
    try {
      const snapshot = await getAccountAndPositions(
        apiKey,
        apiSecret,
        config.environment || "TESTNET",
      );
      liveAccount = snapshot.account;
      livePositions.clear();
      for (const p of snapshot.positions) {
        livePositions.set(p.symbol, p);
      }
      lastCacheUpdate = Date.now();
    } catch {}

    // 4. Buka koneksi WebSocket Stream
    const wsUrl = `${getWsBaseUrl(isTestnet)}${listenKey}`;
    wsClient = new WebSocket(wsUrl);

    wsClient.on("open", () => {
      isWsConnected = true;
      addAppLog(
        "SUCCESS",
        "BinanceWS",
        `Connected to Binance Futures User Data Stream (WebSocket: ${
          isTestnet ? "Testnet" : "Live"
        })! Zero-polling active.`,
      );

      // Mulai Keep-Alive Timer tiap 30 menit
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      keepAliveTimer = setInterval(
        () => {
          if (currentListenKey) {
            keepAliveListenKey(apiKey, isTestnet, currentListenKey);
          }
        },
        30 * 60 * 1000,
      );
    });

    wsClient.on("message", (data: WebSocket.RawData) => {
      const dataStr = data.toString();
      handleBinanceWsMessage(dataStr, apiKey, apiSecret, isTestnet);
    });

    wsClient.on("error", (err: Error) => {
      isWsConnected = false;
      addAppLog(
        "WARN",
        "BinanceWS",
        `WebSocket error: ${err.message || "Connection error"}`,
      );
    });

    wsClient.on("close", () => {
      isWsConnected = false;
      addAppLog(
        "WARN",
        "BinanceWS",
        "WebSocket disconnected. Reconnecting in 15 seconds...",
      );

      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }

      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectBinanceWs();
        }, 15000);
      }
    });
  } catch (err: any) {
    isWsConnected = false;
    const msg = err.message || "";
    const banMatch = msg.match(/banned until (\d+)/i);
    if (banMatch && banMatch[1]) {
      bannedUntilTimestamp = parseInt(banMatch[1], 10);
      const waitMinutes = Math.ceil(
        (bannedUntilTimestamp - Date.now()) / 60000,
      );
      addAppLog(
        "WARN",
        "BinanceWS",
        `[Rate-Limit Guard] Binance IP ban active until ${new Date(
          bannedUntilTimestamp,
        ).toLocaleTimeString()} (~${waitMinutes} min). Will auto-resume when unbanned.`,
      );

      if (!reconnectTimer) {
        const delayMs = Math.max(
          5000,
          bannedUntilTimestamp - Date.now() + 5000,
        );
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          bannedUntilTimestamp = 0;
          connectBinanceWs();
        }, delayMs);
      }
    } else {
      addAppLog(
        "WARN",
        "BinanceWS",
        `Failed to establish Binance WebSocket: ${msg}. Retrying in 30s...`,
      );
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectBinanceWs();
        }, 30000);
      }
    }
  } finally {
    isReconnecting = false;
  }
}

/**
 * Memulai layanan Binance WebSocket Stream
 */
export function startBinanceWsService(): void {
  connectBinanceWs();
}

/**
 * Restart koneksi WebSocket (misal saat konfigurasi berganti)
 */
export function restartBinanceWsService(): void {
  if (wsClient) {
    try {
      wsClient.close();
    } catch {}
    wsClient = null;
  }
  isWsConnected = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  connectBinanceWs();
}

/**
 * Menghentikan layanan WebSocket secara total
 */
export async function stopBinanceWsService(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }

  if (wsClient) {
    try {
      wsClient.close();
    } catch {}
    wsClient = null;
  }
  isWsConnected = false;

  if (currentListenKey) {
    try {
      const config = await prisma.binanceConfig.findUnique({
        where: { id: 1 },
      });
      if (config?.apiKey) {
        const isTestnet = config.environment === "TESTNET";
        await closeListenKey(config.apiKey.trim(), isTestnet, currentListenKey);
      }
    } catch {}
    currentListenKey = null;
  }

  addAppLog("INFO", "BinanceWS", "Binance WebSocket Stream stopped.");
}
