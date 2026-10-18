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
    const errorMsg =
      data.msg ||
      `Failed to create listenKey (HTTP ${res.status}): ${JSON.stringify(data)}`;
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
 * Kelas pengelola stream Binance Futures per environment (Testnet vs Live)
 */
class BinanceEnvironmentStream {
  public readonly environment: "TESTNET" | "LIVE";
  public readonly isTestnet: boolean;
  private readonly logTag: string;

  private wsClient: WebSocket | null = null;
  private marketWsClient: WebSocket | null = null;
  private currentListenKey: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private marketReconnectTimer: NodeJS.Timeout | null = null;
  private resyncTimer: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private bannedUntilTimestamp = 0;
  private isWsConnected = false;

  private readonly livePositions = new Map<string, PositionRiskItem>();
  private liveAccount: AccountOverview = {
    totalWalletBalance: 0,
    totalUnrealizedProfit: 0,
    openPositionsCount: 0,
    totalExposureUsd: 0,
    quoteAsset: "USDT",
  };
  private lastCacheUpdate = 0;
  private readonly monitoredWsPositions = new Map<
    string,
    MonitoredWsPosition
  >();

  constructor(environment: "TESTNET" | "LIVE") {
    this.environment = environment;
    this.isTestnet = environment === "TESTNET";
    this.logTag = `BinanceWS[${environment}]`;
  }

  public isConnected(): boolean {
    return this.isWsConnected && this.wsClient?.readyState === WebSocket.OPEN;
  }

  public getPositions(): PositionRiskItem[] {
    return Array.from(this.livePositions.values());
  }

  public getAccount(): AccountOverview {
    return {
      ...this.liveAccount,
      openPositionsCount: this.livePositions.size,
    };
  }

  public getLastUpdated(): number {
    return this.lastCacheUpdate;
  }

  public registerPosition(params: {
    symbol: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    quantity: number;
  }): void {
    this.monitoredWsPositions.set(params.symbol, {
      symbol: params.symbol,
      side: params.side,
      entryPrice: params.entryPrice,
      initialQty: params.quantity,
      bepMoved: false,
      openedAt: Date.now(),
    });
  }

  /**
   * Menghubungkan ke Public Mark Price Stream (!markPrice@arr@1s)
   */
  public connectMarketWs(): void {
    if (this.marketWsClient) {
      if (
        this.marketWsClient.readyState === WebSocket.OPEN ||
        this.marketWsClient.readyState === WebSocket.CONNECTING
      ) {
        return;
      }
      try {
        this.marketWsClient.close();
      } catch {}
      this.marketWsClient = null;
    }
    if (this.marketReconnectTimer) {
      clearTimeout(this.marketReconnectTimer);
      this.marketReconnectTimer = null;
    }

    const baseWs = getWsBaseUrl(this.isTestnet);
    const marketUrl = `${baseWs}!markPrice@arr@1s`;

    try {
      this.marketWsClient = new WebSocket(marketUrl);

      this.marketWsClient.on("open", () => {
        console.log(
          `[${new Date().toLocaleTimeString()}] ℹ️ [${this.logTag}] Public Mark Price stream connected (${this.environment}). Real-time pricing active.`,
        );
      });

      this.marketWsClient.on("message", (data: WebSocket.RawData) => {
        try {
          const rawStr = data.toString();
          const items = JSON.parse(rawStr);
          if (Array.isArray(items) && this.livePositions.size > 0) {
            let hasUpdated = false;
            for (const item of items) {
              if (item && item.s && item.p && this.livePositions.has(item.s)) {
                const pos = this.livePositions.get(item.s);
                if (pos) {
                  const markPrice = parseFloat(item.p);
                  pos.markPrice = markPrice;
                  const isLong = pos.side === "LONG";
                  const pnl = isLong
                    ? (markPrice - pos.entryPrice) * pos.positionAmt
                    : (pos.entryPrice - markPrice) * pos.positionAmt;
                  pos.unRealizedProfit = pnl;
                  const initialMargin =
                    (pos.entryPrice * pos.positionAmt) / (pos.leverage || 1);
                  pos.roiPct =
                    initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
                  pos.notionalValue = pos.positionAmt * markPrice;
                  hasUpdated = true;
                }
              }
            }
            if (hasUpdated) {
              let totalUpnl = 0;
              for (const p of this.livePositions.values()) {
                totalUpnl += p.unRealizedProfit || 0;
              }
              this.liveAccount.totalUnrealizedProfit = totalUpnl;
              this.lastCacheUpdate = Date.now();
            }
          }
        } catch {}
      });

      this.marketWsClient.on("error", (err: Error) => {
        console.error(
          `[${new Date().toLocaleTimeString()}] ⚠️ [${this.logTag}] Public Mark Price stream error: ${err?.message || "Unknown error"}`,
        );
      });

      this.marketWsClient.on("close", () => {
        if (!this.marketReconnectTimer) {
          this.marketReconnectTimer = setTimeout(() => {
            this.marketReconnectTimer = null;
            this.connectMarketWs();
          }, 10000);
        }
      });
    } catch {}
  }

  /**
   * Menghubungkan WebSocket ke User Data Stream
   */
  public async connect(): Promise<void> {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    try {
      const now = Date.now();
      if (this.bannedUntilTimestamp > now) {
        const waitMinutes = Math.ceil(
          (this.bannedUntilTimestamp - now) / 60000,
        );
        addAppLog(
          "WARN",
          this.logTag,
          `[Rate-Limit Pause] IP banned on ${this.environment} until ${new Date(
            this.bannedUntilTimestamp,
          ).toLocaleTimeString()} (~${waitMinutes} min). WS paused.`,
        );

        if (!this.reconnectTimer) {
          const delayMs = this.bannedUntilTimestamp - now + 5000;
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.bannedUntilTimestamp = 0;
            this.connect();
          }, delayMs);
        }
        this.isReconnecting = false;
        return;
      }

      const config = await prisma.binanceConfig.findUnique({
        where: { id: 1 },
      });

      // Tentukan kredensial berdasarkan environment
      const apiKey = this.isTestnet
        ? config?.testnetApiKey ||
          (config?.environment === "TESTNET" ? config?.apiKey : null)
        : config?.liveApiKey ||
          (config?.environment === "LIVE" ? config?.apiKey : null);

      const apiSecret = this.isTestnet
        ? config?.testnetApiSecret ||
          (config?.environment === "TESTNET" ? config?.apiSecret : null)
        : config?.liveApiSecret ||
          (config?.environment === "LIVE" ? config?.apiSecret : null);

      if (!apiKey || !apiSecret) {
        this.isReconnecting = false;
        // Buka market stream agar data harga tetap tersedia meski belum ada kredensial user
        this.connectMarketWs();
        return;
      }

      const trimmedKey = apiKey.trim();
      const trimmedSecret = apiSecret.trim();

      // Minta listenKey baru
      const listenKey = await createListenKey(trimmedKey, this.isTestnet);
      this.currentListenKey = listenKey;

      // Inisialisasi snapshot akun via REST
      try {
        const snapshot = await getAccountAndPositions(
          trimmedKey,
          trimmedSecret,
          this.environment,
        );
        this.liveAccount = snapshot.account;
        this.livePositions.clear();
        for (const p of snapshot.positions) {
          this.livePositions.set(p.symbol, p);
        }
        this.lastCacheUpdate = Date.now();
      } catch {}

      // Buka koneksi WebSocket Stream
      const wsUrl = `${getWsBaseUrl(this.isTestnet)}${listenKey}`;
      this.wsClient = new WebSocket(wsUrl);

      this.wsClient.on("open", () => {
        this.isWsConnected = true;
        addAppLog(
          "SUCCESS",
          this.logTag,
          `Connected to Binance Futures User Data Stream (${this.environment})! Zero-polling active.`,
        );

        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(
          () => {
            if (this.currentListenKey) {
              keepAliveListenKey(
                trimmedKey,
                this.isTestnet,
                this.currentListenKey,
              );
            }
          },
          30 * 60 * 1000,
        );

        // Buka Public Mark Price Stream
        this.connectMarketWs();

        // Inisialisasi background reconciliation setiap 20 detik
        if (this.resyncTimer) clearInterval(this.resyncTimer);
        this.resyncTimer = setInterval(async () => {
          try {
            const snapshot = await getAccountAndPositions(
              trimmedKey,
              trimmedSecret,
              this.environment,
            );
            this.liveAccount = snapshot.account;
            const activeSymbols = new Set<string>();
            for (const p of snapshot.positions) {
              activeSymbols.add(p.symbol);
              this.livePositions.set(p.symbol, p);
            }
            for (const sym of Array.from(this.livePositions.keys())) {
              if (!activeSymbols.has(sym)) {
                this.livePositions.delete(sym);
              }
            }
            this.lastCacheUpdate = Date.now();
          } catch {}
        }, 20000);
      });

      this.wsClient.on("message", (data: WebSocket.RawData) => {
        const dataStr = data.toString();
        this.handleWsMessage(dataStr, trimmedKey, trimmedSecret);
      });

      this.wsClient.on("error", (err: Error) => {
        this.isWsConnected = false;
        addAppLog(
          "WARN",
          this.logTag,
          `WebSocket error: ${err.message || "Connection error"}`,
        );
      });

      this.wsClient.on("close", () => {
        this.isWsConnected = false;
        addAppLog(
          "WARN",
          this.logTag,
          `WebSocket disconnected. Reconnecting in 15 seconds...`,
        );

        if (this.keepAliveTimer) {
          clearInterval(this.keepAliveTimer);
          this.keepAliveTimer = null;
        }

        if (this.resyncTimer) {
          clearInterval(this.resyncTimer);
          this.resyncTimer = null;
        }

        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 15000);
        }
      });
    } catch (err: any) {
      this.isWsConnected = false;
      const msg = err.message || "";
      const banMatch = msg.match(/banned until (\d+)/i);
      if (banMatch && banMatch[1]) {
        this.bannedUntilTimestamp = parseInt(banMatch[1], 10);
        const waitMinutes = Math.ceil(
          (this.bannedUntilTimestamp - Date.now()) / 60000,
        );
        addAppLog(
          "WARN",
          this.logTag,
          `[Rate-Limit Guard] IP ban active until ${new Date(
            this.bannedUntilTimestamp,
          ).toLocaleTimeString()} (~${waitMinutes} min). Will auto-resume.`,
        );

        if (!this.reconnectTimer) {
          const delayMs = Math.max(
            5000,
            this.bannedUntilTimestamp - Date.now() + 5000,
          );
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.bannedUntilTimestamp = 0;
            this.connect();
          }, delayMs);
        }
      } else {
        addAppLog(
          "WARN",
          this.logTag,
          `Failed to establish WebSocket: ${msg}. Retrying in 30s...`,
        );
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 30000);
        }
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Handler event real-time dari Binance WebSocket
   */
  public handleWsMessage(
    rawMessage: string,
    apiKey: string,
    apiSecret: string,
  ): void {
    try {
      const event = JSON.parse(rawMessage);
      const eventType = event.e;

      // 1. ACCOUNT_UPDATE
      if (eventType === "ACCOUNT_UPDATE") {
        const updateData = event.a;

        if (Array.isArray(updateData?.B)) {
          for (const bal of updateData.B) {
            if (bal.a === "USDT") {
              this.liveAccount.totalWalletBalance = parseFloat(bal.wb || "0");
            }
          }
        }

        if (Array.isArray(updateData?.P)) {
          for (const p of updateData.P) {
            const symbol = p.s;
            const posAmt = parseFloat(p.pa || "0");
            const absAmt = Math.abs(posAmt);
            const entryPrice = parseFloat(p.ep || "0");
            const unRealizedProfit = parseFloat(p.up || "0");

            if (absAmt > 0) {
              const side: "LONG" | "SHORT" = posAmt > 0 ? "LONG" : "SHORT";
              const existing = this.livePositions.get(symbol);
              const markPrice = existing?.markPrice || entryPrice;
              const leverage = existing?.leverage || 10;
              const notional = absAmt * markPrice;
              const initialMargin = (entryPrice * absAmt) / leverage;
              const roiPct =
                initialMargin > 0
                  ? (unRealizedProfit / initialMargin) * 100
                  : 0;

              this.livePositions.set(symbol, {
                symbol,
                side,
                entryPrice,
                markPrice,
                positionAmt: absAmt,
                leverage,
                unRealizedProfit,
                liquidationPrice: existing?.liquidationPrice || 0,
                isolatedMargin: existing?.isolatedMargin || 0,
                notionalValue: notional,
                roiPct,
                distanceToLiqPct: existing?.distanceToLiqPct || 0,
                marginType: (
                  p.mt ||
                  existing?.marginType ||
                  "ISOLATED"
                ).toUpperCase(),
              });

              if (!this.monitoredWsPositions.has(symbol)) {
                this.monitoredWsPositions.set(symbol, {
                  symbol,
                  side,
                  entryPrice,
                  initialQty: absAmt,
                  bepMoved: false,
                  openedAt: Date.now(),
                });
              }
            } else {
              // Posisi CLOSED (hanya hapus jika sisi yang 0 sesuai dengan sisi posisi yang aktif di memori)
              const existing = this.livePositions.get(symbol);
              const pSide =
                p.ps === "LONG" ? "LONG" : p.ps === "SHORT" ? "SHORT" : "BOTH";
              if (existing && (pSide === "BOTH" || pSide === existing.side)) {
                this.livePositions.delete(symbol);

                const tracked = this.monitoredWsPositions.get(symbol);
                if (tracked) {
                  addAppLog(
                    "INFO",
                    this.logTag,
                    `[Realtime Cleanup] Position ${symbol} is now CLOSED. Cancelling leftover orders...`,
                  );
                  this.monitoredWsPositions.delete(symbol);

                  cancelAllOpenOrders(
                    apiKey,
                    apiSecret,
                    symbol,
                    this.isTestnet,
                  ).catch((err) => {
                    addAppLog(
                      "WARN",
                      this.logTag,
                      `Cleanup failed for ${symbol}: ${err.message}`,
                    );
                  });
                }
              }
            }
          }
        }

        this.lastCacheUpdate = Date.now();
      }

      // 2. ORDER_TRADE_UPDATE
      if (eventType === "ORDER_TRADE_UPDATE") {
        const o = event.o;
        const symbol = o.s;
        const orderStatus = o.X;
        const isReduceOnly = Boolean(o.R);
        const isExitOrder =
          isReduceOnly || o.ot === "TAKE_PROFIT_MARKET" || o.ot === "LIMIT";

        if (orderStatus === "FILLED" && isExitOrder) {
          const tracked = this.monitoredWsPositions.get(symbol);
          const autoBepEnabled = process.env.BINANCE_AUTO_BEP !== "false";
          const bepBufferPct = parseFloat(
            process.env.BINANCE_BEP_BUFFER_PCT || "0.2",
          );

          if (tracked && !tracked.bepMoved && autoBepEnabled) {
            addAppLog(
              "INFO",
              this.logTag,
              `[Realtime Auto-BEP] Exit order filled for ${symbol}. Moving SL to Break-Even immediately...`,
            );

            tracked.bepMoved = true;
            moveSlToBreakEven(
              apiKey,
              apiSecret,
              symbol,
              tracked.side,
              tracked.entryPrice,
              this.isTestnet,
              bepBufferPct,
            ).catch((err) => {
              addAppLog(
                "WARN",
                this.logTag,
                `Auto-BEP move failed for ${symbol}: ${err.message}`,
              );
            });
          }
        }
      }

      // 3. listenKeyExpired
      if (eventType === "listenKeyExpired") {
        addAppLog("WARN", this.logTag, "listenKey expired. Reconnecting...");
        this.restart();
      }
    } catch (err: any) {
      addAppLog(
        "WARN",
        this.logTag,
        `Error parsing WS message: ${err.message}`,
      );
    }
  }

  public restart(): void {
    if (this.wsClient) {
      try {
        this.wsClient.close();
      } catch {}
      this.wsClient = null;
    }
    if (this.marketWsClient) {
      try {
        this.marketWsClient.close();
      } catch {}
      this.marketWsClient = null;
    }
    this.isWsConnected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.marketReconnectTimer) {
      clearTimeout(this.marketReconnectTimer);
      this.marketReconnectTimer = null;
    }
    this.connect();
  }

  public async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.marketReconnectTimer) {
      clearTimeout(this.marketReconnectTimer);
      this.marketReconnectTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.resyncTimer) {
      clearInterval(this.resyncTimer);
      this.resyncTimer = null;
    }

    if (this.wsClient) {
      try {
        this.wsClient.close();
      } catch {}
      this.wsClient = null;
    }
    if (this.marketWsClient) {
      try {
        this.marketWsClient.close();
      } catch {}
      this.marketWsClient = null;
    }
    this.isWsConnected = false;

    if (this.currentListenKey) {
      try {
        const config = await prisma.binanceConfig.findUnique({
          where: { id: 1 },
        });
        const apiKey = this.isTestnet
          ? config?.testnetApiKey ||
            (config?.environment === "TESTNET" ? config?.apiKey : null)
          : config?.liveApiKey ||
            (config?.environment === "LIVE" ? config?.apiKey : null);

        if (apiKey) {
          await closeListenKey(
            apiKey.trim(),
            this.isTestnet,
            this.currentListenKey,
          );
        }
      } catch {}
      this.currentListenKey = null;
    }

    addAppLog("INFO", this.logTag, `WebSocket stream stopped.`);
  }
}

// ── INSTANCE MANAGER GANDA (TESTNET & LIVE) ─────────────────────────
const testnetStream = new BinanceEnvironmentStream("TESTNET");
const liveStream = new BinanceEnvironmentStream("LIVE");

export function isBinanceWsConnected(env?: "TESTNET" | "LIVE"): boolean {
  if (env === "TESTNET") return testnetStream.isConnected();
  if (env === "LIVE") return liveStream.isConnected();
  return testnetStream.isConnected() || liveStream.isConnected();
}

export function getLiveBinancePositions(
  env: "TESTNET" | "LIVE" = "LIVE",
): PositionRiskItem[] {
  return env === "TESTNET"
    ? testnetStream.getPositions()
    : liveStream.getPositions();
}

export function getLiveBinanceAccount(
  env: "TESTNET" | "LIVE" = "LIVE",
): AccountOverview {
  return env === "TESTNET"
    ? testnetStream.getAccount()
    : liveStream.getAccount();
}

export function getLiveCacheLastUpdated(
  env: "TESTNET" | "LIVE" = "LIVE",
): number {
  return env === "TESTNET"
    ? testnetStream.getLastUpdated()
    : liveStream.getLastUpdated();
}

export function registerPositionForWsMonitoring(
  params: {
    symbol: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    quantity: number;
  },
  env: "TESTNET" | "LIVE" = "LIVE",
): void {
  if (env === "TESTNET") {
    testnetStream.registerPosition(params);
  } else {
    liveStream.registerPosition(params);
  }
}

export function startBinanceWsService(): void {
  testnetStream.connect();
  liveStream.connect();
}

export function restartBinanceWsService(): void {
  testnetStream.restart();
  liveStream.restart();
}

export async function stopBinanceWsService(): Promise<void> {
  await Promise.all([testnetStream.stop(), liveStream.stop()]);
}
