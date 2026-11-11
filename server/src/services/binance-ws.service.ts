import WebSocket from "ws";
import { addAppLog } from "../lib/logger";
import { binanceFetch } from "../exchanges/binance/rate-guard";
import {
  getBaseUrl,
  cancelAllOpenOrders,
  moveSlToBreakEven,
  getAccountAndPositions,
  clearBreakEvenState,
} from "../lib/binance";
import { PositionRiskItem } from "../exchanges/binance/types";
import { loadBinanceCredentials } from "../lib/binance-credentials";
import {
  getOwnedPosition,
  isOwnedPosition,
  releaseOwnedPosition,
} from "../lib/owned-positions";
import { AccountOverview } from "../exchanges/types";
import {
  getMarketWsUrl,
  getUserDataWsUrl,
  isMarketStreamStale,
  isStreamHealthy,
} from "./binance-stream-health";

interface MonitoredWsPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  initialQty: number;
  bepMoved: boolean;
  openedAt: number;
  bepInProgress?: boolean;
  bepAttempts?: number;
}

const BEP_MAX_ATTEMPTS = 3;
const BEP_RETRY_DELAY_MS = 3000;

/**
 * Mengambil listenKey baru dari Binance Futures
 */
async function createListenKey(
  apiKey: string,
  isTestnet: boolean,
): Promise<string> {
  const baseUrl = getBaseUrl(isTestnet);
  const res = await binanceFetch(`${baseUrl}/fapi/v1/listenKey`, {
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
    const res = await binanceFetch(
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
    await binanceFetch(
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
export class BinanceEnvironmentStream {
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
  /** Naik setiap connect/restart/stop; handler dengan generasi lama tidak melakukan apa pun. */
  private generation = 0;
  /** API key yang dipakai koneksi user data stream saat ini (null = tidak tersambung). */
  private connectedApiKey: string | null = null;
  private bannedUntilTimestamp = 0;
  private isWsConnected = false;
  private marketConnectedAt = 0;
  private marketLastDataAt = 0;
  private marketWatchdog: NodeJS.Timeout | null = null;

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

  /** Tersambung DAN stream market benar-benar mengirim data (URL salah tetap bisa "tersambung"). */
  public isHealthy(now: number = Date.now()): boolean {
    return isStreamHealthy(this.isConnected(), this.marketLastDataAt, now);
  }

  /** Watchdog: stream market terbuka tapi diam → putuskan agar close handler reconnect. */
  private checkMarketStale(): void {
    const ws = this.marketWsClient;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (!isMarketStreamStale(this.marketConnectedAt, this.marketLastDataAt, now)) {
      return;
    }
    addAppLog(
      "WARN",
      this.logTag,
      `Mark price stream connected but silent for ${Math.round((now - Math.max(this.marketConnectedAt, this.marketLastDataAt)) / 1000)}s. Reconnecting (REST monitor covers Auto-BEP meanwhile)...`,
    );
    this.marketConnectedAt = 0;
    ws.terminate();
  }

  private stopMarketWatchdog(): void {
    if (this.marketWatchdog) {
      clearInterval(this.marketWatchdog);
      this.marketWatchdog = null;
    }
    this.marketConnectedAt = 0;
    this.marketLastDataAt = 0;
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

    const marketUrl = getMarketWsUrl(this.isTestnet);
    let gotData = false;

    if (!this.marketWatchdog) {
      this.marketWatchdog = setInterval(() => this.checkMarketStale(), 10_000);
      this.marketWatchdog.unref();
    }

    try {
      this.marketWsClient = new WebSocket(marketUrl);

      this.marketWsClient.on("open", () => {
        this.marketConnectedAt = Date.now();
        this.marketLastDataAt = 0;
        console.log(
          `[${new Date().toLocaleTimeString()}] ℹ️ [${this.logTag}] Public Mark Price stream connected (${this.environment}): ${marketUrl}`,
        );
      });

      this.marketWsClient.on("message", (data: WebSocket.RawData) => {
        try {
          const rawStr = data.toString();
          const parsed = JSON.parse(rawStr);
          // /ws/<stream> → array mentah; /stream?streams= → { stream, data }
          const items = Array.isArray(parsed) ? parsed : parsed?.data;
          if (Array.isArray(items) && items.length > 0) {
            this.marketLastDataAt = Date.now();
            if (!gotData) {
              gotData = true;
              addAppLog(
                "SUCCESS",
                this.logTag,
                `Mark price stream receiving data (${this.environment}). Real-time pricing active.`,
              );
            }
          }
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
        this.marketConnectedAt = 0;
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
    // Generasi koneksi: event/close/timer dari koneksi lama diabaikan, sehingga tidak ada socket "yatim"
    // yang terus bertindak memakai API key lama setelah konfigurasi disimpan.
    const gen = ++this.generation;

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

      // Kredensial dibaca ulang dari database setiap kali tersambung (aturan sama dengan eksekusi sinyal)
      const creds = await loadBinanceCredentials(this.environment);
      if (gen !== this.generation) return;

      if (!creds) {
        // Key dihapus/dikosongkan: putuskan stream akun lama, market stream tetap untuk data harga
        this.detachUserSocket();
        this.connectMarketWs();
        return;
      }

      const trimmedKey = creds.apiKey;
      const trimmedSecret = creds.apiSecret;

      // Minta listenKey baru
      const listenKey = await createListenKey(trimmedKey, this.isTestnet);
      if (gen !== this.generation) return;

      // Inisialisasi snapshot akun via REST
      try {
        const snapshot = await getAccountAndPositions(
          trimmedKey,
          trimmedSecret,
          this.environment,
        );
        if (gen !== this.generation) return;
        this.liveAccount = snapshot.account;
        this.livePositions.clear();
        for (const p of snapshot.positions) {
          this.livePositions.set(p.symbol, p);
        }
        this.lastCacheUpdate = Date.now();
      } catch {}
      if (gen !== this.generation) return;

      // Pastikan tidak ada socket lama yang tertinggal sebelum membuka yang baru
      this.detachUserSocket();
      this.currentListenKey = listenKey;
      this.connectedApiKey = trimmedKey;

      // Buka koneksi WebSocket Stream
      const wsUrl = getUserDataWsUrl(this.isTestnet, listenKey);
      const ws = new WebSocket(wsUrl);
      this.wsClient = ws;

      ws.on("open", () => {
        if (gen !== this.generation) return;
        this.isWsConnected = true;
        addAppLog(
          "SUCCESS",
          this.logTag,
          `Connected to Binance Futures User Data Stream (${this.environment})! Zero-polling active.`,
        );

        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(
          () => {
            if (gen === this.generation && this.currentListenKey) {
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

        // Background reconciliation setiap 60 detik (update real-time sudah via User Data Stream)
        if (this.resyncTimer) clearInterval(this.resyncTimer);
        this.resyncTimer = setInterval(async () => {
          if (gen !== this.generation) return;
          try {
            const snapshot = await getAccountAndPositions(
              trimmedKey,
              trimmedSecret,
              this.environment,
              "normal",
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
        }, 60000);
      });

      ws.on("message", (data: WebSocket.RawData) => {
        if (gen !== this.generation) return;
        const dataStr = data.toString();
        this.handleWsMessage(dataStr, trimmedKey, trimmedSecret);
      });

      ws.on("error", (err: Error) => {
        if (gen !== this.generation) return;
        this.isWsConnected = false;
        addAppLog(
          "WARN",
          this.logTag,
          `WebSocket error: ${err.message || "Connection error"}`,
        );
      });

      ws.on("close", () => {
        // Socket generasi lama (sudah diganti/di-restart) tidak boleh menjadwalkan reconnect
        if (gen !== this.generation) return;
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
      if (gen !== this.generation) return;
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
      if (gen === this.generation) this.isReconnecting = false;
    }
  }

  /** Lepas & matikan socket user data stream saat ini beserta timer-nya (tanpa memicu reconnect). */
  private detachUserSocket(): void {
    const ws = this.wsClient;
    this.wsClient = null;
    this.isWsConnected = false;
    this.connectedApiKey = null;
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.resyncTimer) {
      clearInterval(this.resyncTimer);
      this.resyncTimer = null;
    }
    if (ws) {
      ws.removeAllListeners();
      // Socket tanpa listener tetap butuh handler error agar tidak melempar exception tak tertangani
      ws.on("error", () => {});
      try {
        ws.terminate();
      } catch {}
    }
  }

  /**
   * Kredensial TERBARU untuk aksi otomatis. Null (aksi dibatalkan) bila key sudah dihapus atau berbeda dari key
   * yang dipakai koneksi ini — perubahan konfigurasi langsung menghentikan aksi dengan key lama.
   */
  private async currentCredentialsFor(
    connectionKey: string,
  ): Promise<{ apiKey: string; apiSecret: string } | null> {
    try {
      const creds = await loadBinanceCredentials(this.environment);
      if (creds && creds.apiKey === connectionKey) return creds;
    } catch {}
    addAppLog(
      "WARN",
      this.logTag,
      "API key changed or removed in configuration. Ignoring event from the old connection and reconnecting...",
    );
    this.restart();
    return null;
  }

  /** Posisi milik Client dari daftar persisten → objek pantauan (dipakai saat posisi muncul / TP terisi). */
  private trackOwned(symbol: string): MonitoredWsPosition | null {
    const owned = getOwnedPosition(this.environment, symbol);
    if (!owned) return null;
    let tracked = this.monitoredWsPositions.get(symbol);
    if (!tracked) {
      tracked = {
        symbol,
        side: owned.side,
        entryPrice: owned.entryPrice,
        initialQty: owned.quantity,
        bepMoved: false,
        openedAt: owned.openedAt,
      };
      this.monitoredWsPositions.set(symbol, tracked);
    }
    return tracked;
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

              // Hanya posisi yang dibuka Client yang dipantau (Auto-BEP/cleanup). Posisi manual pengguna diabaikan.
              this.trackOwned(symbol);
            } else {
              // Posisi CLOSED (hanya hapus jika sisi yang 0 sesuai dengan sisi posisi yang aktif di memori)
              const existing = this.livePositions.get(symbol);
              const pSide =
                p.ps === "LONG" ? "LONG" : p.ps === "SHORT" ? "SHORT" : "BOTH";
              if (existing && (pSide === "BOTH" || pSide === existing.side)) {
                this.livePositions.delete(symbol);

                const tracked = this.monitoredWsPositions.get(symbol);
                if (tracked || isOwnedPosition(this.environment, symbol)) {
                  this.monitoredWsPositions.delete(symbol);
                  clearBreakEvenState(this.environment, symbol);
                  releaseOwnedPosition(this.environment, symbol);

                  void this.currentCredentialsFor(apiKey).then((creds) => {
                    if (!creds) return;
                    addAppLog(
                      "INFO",
                      this.logTag,
                      `[Realtime Cleanup] Position ${symbol} is now CLOSED. Cancelling leftover orders...`,
                    );
                    return cancelAllOpenOrders(
                      creds.apiKey,
                      creds.apiSecret,
                      symbol,
                      this.isTestnet,
                    ).catch((err) => {
                      addAppLog(
                        "WARN",
                        this.logTag,
                        `Cleanup failed for ${symbol}: ${err.message}`,
                      );
                    });
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
          // Hanya posisi milik Client; order manual di posisi manual tidak memicu Auto-BEP
          const tracked =
            this.monitoredWsPositions.get(symbol) || this.trackOwned(symbol);
          const autoBepEnabled = process.env.BINANCE_AUTO_BEP !== "false";
          const bepBufferPct = parseFloat(
            process.env.BINANCE_BEP_BUFFER_PCT || "0.2",
          );

          if (
            tracked &&
            !tracked.bepMoved &&
            !tracked.bepInProgress &&
            autoBepEnabled
          ) {
            tracked.bepInProgress = true;
            void this.currentCredentialsFor(apiKey).then((creds) => {
              tracked.bepInProgress = false;
              if (!creds) return;
              addAppLog(
                "INFO",
                this.logTag,
                `[Realtime Auto-BEP] Exit order filled for ${symbol}. Moving SL to Break-Even immediately...`,
              );
              this.runAutoBep(tracked, creds.apiKey, creds.apiSecret, bepBufferPct);
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

  /**
   * Menjalankan Auto-BEP dengan guard in-flight & retry terbatas.
   * bepMoved hanya diset true jika moveSlToBreakEven berhasil (posisi aman).
   */
  private runAutoBep(
    tracked: MonitoredWsPosition,
    apiKey: string,
    apiSecret: string,
    bepBufferPct: number,
  ): void {
    tracked.bepInProgress = true;
    tracked.bepAttempts = (tracked.bepAttempts || 0) + 1;
    const attempt = tracked.bepAttempts;

    moveSlToBreakEven(
      apiKey,
      apiSecret,
      tracked.symbol,
      tracked.side,
      tracked.entryPrice,
      this.isTestnet,
      bepBufferPct,
    )
      .then((ok) => {
        if (ok) {
          tracked.bepMoved = true;
          return;
        }
        if (attempt < BEP_MAX_ATTEMPTS) {
          addAppLog(
            "WARN",
            this.logTag,
            `[Realtime Auto-BEP] Attempt ${attempt}/${BEP_MAX_ATTEMPTS} failed for ${tracked.symbol}. Retrying in ${BEP_RETRY_DELAY_MS / 1000}s (old SL still active)...`,
          );
          setTimeout(() => {
            if (
              !tracked.bepMoved &&
              this.monitoredWsPositions.get(tracked.symbol) === tracked
            ) {
              this.runAutoBep(tracked, apiKey, apiSecret, bepBufferPct);
            }
          }, BEP_RETRY_DELAY_MS);
        } else {
          addAppLog(
            "ERROR",
            this.logTag,
            `[Realtime Auto-BEP] Gave up after ${BEP_MAX_ATTEMPTS} attempts for ${tracked.symbol}. Original SL remains active — please review manually.`,
          );
        }
      })
      .catch((err) => {
        addAppLog(
          "WARN",
          this.logTag,
          `Auto-BEP move failed for ${tracked.symbol}: ${err.message}`,
        );
      })
      .finally(() => {
        tracked.bepInProgress = false;
      });
  }

  public restart(): void {
    // Batalkan connect yang sedang berjalan & matikan socket lama: tidak boleh ada yang tetap memakai key lama
    this.generation++;
    this.detachUserSocket();
    this.isReconnecting = false;
    if (this.marketWsClient) {
      try {
        this.marketWsClient.close();
      } catch {}
      this.marketWsClient = null;
    }
    this.isWsConnected = false;
    this.stopMarketWatchdog();
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
    this.generation++;
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.marketReconnectTimer) {
      clearTimeout(this.marketReconnectTimer);
      this.marketReconnectTimer = null;
    }
    this.detachUserSocket();
    if (this.marketWsClient) {
      try {
        this.marketWsClient.close();
      } catch {}
      this.marketWsClient = null;
    }
    this.stopMarketWatchdog();

    if (this.currentListenKey) {
      try {
        const creds = await loadBinanceCredentials(this.environment);
        if (creds) {
          await closeListenKey(
            creds.apiKey,
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

/** True jika stream environment tsb tersambung DAN menerima data (dipakai monitor REST). */
export function isBinanceWsHealthy(env: "TESTNET" | "LIVE"): boolean {
  return env === "TESTNET" ? testnetStream.isHealthy() : liveStream.isHealthy();
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
