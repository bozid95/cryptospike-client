import { io as Client } from "socket.io-client";
import { prisma } from "../lib/db";
import { executeSignalOrder } from "../lib/binance";
import { executeTokocryptoSignalOrder } from "../lib/tokocrypto";
import { addAppLog } from "../lib/logger";
import { getTpConfig } from "../lib/tp-config";
import { signalIdOf } from "../exchanges/binance/signal-execution-guard";

const SERVER_URL = process.env.SERVER_URL || "https://signal.forlearning.my.id";

type SignalSocket = ReturnType<typeof Client>;
type SocketFactory = (url: string, opts: Parameters<typeof Client>[1]) => SignalSocket;

let createSocket: SocketFactory = (url, opts) => Client(url, opts);
let socket: SignalSocket | null = null;
let socketToken: string | null = null;
let connectSeq = 0;

/** Hanya untuk tes: ganti pembuat socket (default socket.io-client). */
export function setSocketFactoryForTests(factory: SocketFactory | null): void {
  createSocket = factory ?? ((url, opts) => Client(url, opts));
}
let heartbeatTimer: NodeJS.Timeout | null = null;

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit("ping");
    }
  }, 20000); // Active keep-alive ping every 20s for Cloudflare / Traefik
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function isSocketConnected(): boolean {
  return socket ? socket.connected : false;
}

export function getSocketServerUrl(): string {
  return SERVER_URL;
}

export function disconnectSocket(): void {
  stopHeartbeat();
  connectSeq++; // batalkan connect yang masih menunggu DB
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socketToken = null;
}

export async function connectToNestJS(tokenOverride?: string): Promise<void> {
  // Panggilan terbaru menang: panggilan lama yang masih menunggu DB tidak boleh membuat socket kedua
  const seq = ++connectSeq;
  let activeToken = tokenOverride;

  if (!activeToken) {
    try {
      const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
      activeToken =
        config?.clientToken || process.env.CLIENT_TOKEN || undefined;
    } catch (err) {
      console.error("[Bot] Failed to read token from database:", err);
    }
    if (seq !== connectSeq) return;
  }

  if (!activeToken) {
    addAppLog(
      "WARN",
      "SignalClient",
      "No Client Token installed. Please input your Client Token in Web Dashboard (Config menu).",
    );
    return;
  }

  // Token sama & socket masih aktif (tersambung / sedang auto-reconnect) → pertahankan sesi.
  // Socket baru memutus koneksi; sinyal yang di-broadcast di sela itu tidak ikut dipulihkan server.
  if (socket && socket.active && socketToken === activeToken) {
    return;
  }

  if (socket) {
    addAppLog(
      "INFO",
      "SignalClient",
      "Updating WebSocket session with new token...",
    );
    // Lepas handler dulu agar socket lama tidak pernah memproses sinyal lagi (cegah eksekusi dobel)
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  addAppLog(
    "INFO",
    "SignalClient",
    `Connecting to Signal Server (${SERVER_URL})...`,
  );

  const s = createSocket(SERVER_URL, {
    transports: ["websocket", "polling"],
    auth: { token: activeToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
  });
  socket = s;
  socketToken = activeToken;

  s.on("connect", () => {
    startHeartbeat();
    addAppLog(
      "SUCCESS",
      "SignalClient",
      s.recovered
        ? `Reconnected to Signal Server (${SERVER_URL}); session recovered, missed signals replayed.`
        : `Connected to Signal Server (${SERVER_URL})!`,
    );
  });

  s.on("disconnect", (reason) => {
    stopHeartbeat();
    addAppLog(
      "WARN",
      "SignalClient",
      `Disconnected from Signal Server (${reason})`,
    );
  });

  s.on("connect_error", (err) => {
    addAppLog(
      "WARN",
      "SignalClient",
      `Failed to connect to Signal Server (${err.message})`,
    );
  });

  s.on("new_signal", async (data) => {
    addAppLog(
      "INFO",
      "SignalClient",
      `⚡ Broadcast signal received: ${data?.symbol} (${data?.side}) [${data?.strategy}] Score: ${data?.score}`,
    );
    sendSignalAck({ signalId: signalIdOf(data), stage: "RECEIVED" });
    await handleIncomingSignal(data);
  });
}

type AckOutcome = {
  status: "EXECUTED" | "SKIPPED" | "FAILED" | "DISABLED";
  reason?: string;
};

/**
 * Konfirmasi ke Signal Server (status pengiriman per client). Hanya status & alasan — tanpa saldo/ukuran posisi.
 * Matikan dengan SIGNAL_ACK_ENABLED=false. Saat terputus, socket.io-client menahan emit sampai tersambung lagi.
 */
export function sendSignalAck(payload: {
  signalId: string | null;
  stage: "RECEIVED" | "RESULT";
  environment?: "TESTNET" | "LIVE";
  status?: AckOutcome["status"];
  reason?: string;
}): boolean {
  if (process.env.SIGNAL_ACK_ENABLED === "false") return false;
  if (!socket || !payload.signalId) return false;
  const { reason, ...rest } = payload;
  socket.emit("signal_ack", {
    ...rest,
    ...(reason ? { reason: reason.slice(0, 300) } : {}),
  });
  return true;
}

function sendSignalResultAck(
  data: any,
  environment: "TESTNET" | "LIVE",
  outcome: AckOutcome,
): void {
  sendSignalAck({
    signalId: signalIdOf(data),
    stage: "RESULT",
    environment,
    status: outcome.status,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
  });
}

export async function handleIncomingSignal(data: any): Promise<void> {
  try {
    const [appConfig, binanceConfig, tokocryptoConfig] = await Promise.all([
      prisma.appConfig.findUnique({ where: { id: 1 } }),
      prisma.binanceConfig.findUnique({ where: { id: 1 } }),
      prisma.tokocryptoConfig.findUnique({ where: { id: 1 } }),
    ]);
    if (!appConfig) {
      addAppLog(
        "WARN",
        "SignalEngine",
        "Bot configuration is not saved in the database.",
      );
      return;
    }

    const targetExchange = (
      appConfig.targetExchange || "BINANCE"
    ).toUpperCase();
    const shouldExecuteTokocrypto =
      targetExchange === "TOKOCRYPTO" || targetExchange === "BOTH";
    const shouldExecuteBinance =
      targetExchange === "BINANCE" || targetExchange === "BOTH";

    // 1. Eksekusi Tokocrypto Spot jika target TOKOCRYPTO atau BOTH
    if (shouldExecuteTokocrypto && tokocryptoConfig) {
      try {
        const openSpotCount = await prisma.spotTrade.count({
          where: { status: "OPEN" },
        });

        const maxPos = tokocryptoConfig.maxOpenPositions ?? 5;
        if (openSpotCount >= maxPos) {
          addAppLog(
            "WARN",
            "Tokocrypto",
            `Max open positions limit reached (${openSpotCount}/${maxPos}). Signal ${data?.symbol} skipped.`,
          );
        } else {
          const tpPrefs = getTpConfig();
          const result = await executeTokocryptoSignalOrder(data, {
            autoExecute: Boolean(tokocryptoConfig.autoExecute),
            dryRun: Boolean(tokocryptoConfig.dryRun),
            tokocryptoApiKey: tokocryptoConfig.apiKey,
            tokocryptoApiSecret: tokocryptoConfig.apiSecret,
            tokocryptoQuoteAsset:
              (tokocryptoConfig.quoteAsset as "USDT" | "BIDR") || "USDT",
            riskPerTradePct: tokocryptoConfig.riskPerTradePct ?? 10.0,
            maxOpenPositions: maxPos,
            coinFilterMode: tokocryptoConfig.coinFilterMode || "ALL",
            targetCoins: tokocryptoConfig.targetCoins || "",
            tpMode: tpPrefs.tokocryptoTpMode,
            customTpRoiPct: tpPrefs.tokocryptoCustomTpRoiPct,
            customTpSplitRatio: tpPrefs.tokocryptoCustomTpSplitRatio,
            slMode: tpPrefs.tokocryptoSlMode,
            customSlValue: tpPrefs.tokocryptoCustomSlValue,
          });

          // Jika order berhasil atau simulasi sukses, catat ke tabel SpotTrade
          if (result.success && result.order) {
            const plan = result.tpPlan;
            const executedQty = result.order.executedQty;
            await prisma.spotTrade.create({
              data: {
                exchange: "TOKOCRYPTO",
                symbol: result.order.symbol,
                buyOrderId: result.order.orderId,
                entryPrice: Number(data.entryPrice),
                quantity: executedQty,
                remainingQty: executedQty,
                tp1Price:
                  plan?.tp1Price ||
                  result.tpPrice ||
                  Number(data.entryPrice) * 1.05,
                tp2Price: plan?.tp2Price ?? null,
                tp3Price: plan?.tp3Price ?? null,
                tp1Qty: plan?.tp1Qty ?? executedQty,
                tp2Qty: plan?.tp2Qty ?? 0,
                tp3Qty: plan?.tp3Qty ?? 0,
                tpStage: 0,
                realizedPnl: 0,
                tpPrice:
                  plan?.tp1Price ||
                  result.tpPrice ||
                  Number(data.entryPrice) * 1.05,
                slPrice:
                  plan?.slPrice ||
                  result.slPrice ||
                  Number(data.entryPrice) * 0.975,
                status: "OPEN",
              },
            });
          }
        }
      } catch (tokoErr: any) {
        addAppLog(
          "ERROR",
          "Tokocrypto",
          `Failed to execute Tokocrypto signal: ${tokoErr.message}`,
          tokoErr,
        );
      }
    }

    // 2. Eksekusi Binance Futures (Dual Runner: Testnet & Live Mandiri)
    if (shouldExecuteBinance && binanceConfig) {
      // 🧪 Jalur A: Binance Futures Testnet (Demo)
      const testnetKey =
        binanceConfig.testnetApiKey ||
        (binanceConfig.environment === "TESTNET" ? binanceConfig.apiKey : null);
      const testnetSecret =
        binanceConfig.testnetApiSecret ||
        (binanceConfig.environment === "TESTNET"
          ? binanceConfig.apiSecret
          : null);
      const isTestnetAuto = Boolean(
        binanceConfig.testnetAutoExecute ||
        (binanceConfig.environment === "TESTNET" && binanceConfig.autoExecute),
      );

      let testnetOutcome: AckOutcome = {
        status: "DISABLED",
        reason: "Testnet auto-execute off or API key missing",
      };
      if (testnetKey && testnetSecret && isTestnetAuto) {
        try {
          testnetOutcome = await executeSignalOrder(data, {
            autoExecute: true,
            binanceApiKey: testnetKey,
            binanceApiSecret: testnetSecret,
            environment: "TESTNET",
            marginType:
              binanceConfig.testnetMarginType ||
              binanceConfig.marginType ||
              "ISOLATED",
            leverage:
              binanceConfig.testnetLeverage || binanceConfig.leverage || 10,
            riskMode:
              binanceConfig.testnetRiskMode ||
              binanceConfig.riskMode ||
              "PERCENTAGE",
            riskAmountUsd:
              binanceConfig.testnetRiskAmountUsd ??
              binanceConfig.riskAmountUsd ??
              10.0,
            riskPerTradePct:
              binanceConfig.testnetRiskPerTradePct ??
              binanceConfig.riskPerTradePct ??
              2.0,
            maxOpenPositions:
              binanceConfig.testnetMaxOpenPositions ??
              binanceConfig.maxOpenPositions ??
              3,
            coinFilterMode:
              binanceConfig.testnetCoinFilterMode ||
              binanceConfig.coinFilterMode ||
              "ALL",
            targetCoins:
              binanceConfig.testnetTargetCoins ??
              binanceConfig.targetCoins ??
              "",
            tradeDirection:
              binanceConfig.testnetTradeDirection ||
              binanceConfig.tradeDirection ||
              "BOTH",
            minScore:
              binanceConfig.testnetMinScore ?? binanceConfig.minScore ?? 0,
            blockLongOnBtcBearish:
              binanceConfig.testnetBlockLongOnBtcBearish ??
              binanceConfig.blockLongOnBtcBearish ??
              true,
            tpMode: getTpConfig().testnetTpMode,
            customTpRoiPct: getTpConfig().testnetCustomTpRoiPct,
            customTpSplitRatio: getTpConfig().testnetCustomTpSplitRatio,
            slMode: getTpConfig().testnetSlMode,
            customSlValue: getTpConfig().testnetCustomSlValue,
          });
        } catch (testnetErr: any) {
          testnetOutcome = { status: "FAILED", reason: testnetErr.message };
          addAppLog(
            "ERROR",
            "BinanceTestnet",
            `Failed to execute Binance Testnet signal: ${testnetErr.message}`,
            testnetErr,
          );
        }
      }
      sendSignalResultAck(data, "TESTNET", testnetOutcome);

      // 🚀 Jalur B: Binance Futures Live (Riil)
      const liveKey =
        binanceConfig.liveApiKey ||
        (binanceConfig.environment === "LIVE" ? binanceConfig.apiKey : null);
      const liveSecret =
        binanceConfig.liveApiSecret ||
        (binanceConfig.environment === "LIVE" ? binanceConfig.apiSecret : null);
      const isLiveAuto = Boolean(
        binanceConfig.liveAutoExecute ||
        (binanceConfig.environment === "LIVE" && binanceConfig.autoExecute),
      );

      let liveOutcome: AckOutcome = {
        status: "DISABLED",
        reason: "Live auto-execute off or API key missing",
      };
      if (liveKey && liveSecret && isLiveAuto) {
        try {
          liveOutcome = await executeSignalOrder(data, {
            autoExecute: true,
            binanceApiKey: liveKey,
            binanceApiSecret: liveSecret,
            environment: "LIVE",
            marginType:
              binanceConfig.liveMarginType ||
              binanceConfig.marginType ||
              "ISOLATED",
            leverage:
              binanceConfig.liveLeverage || binanceConfig.leverage || 10,
            riskMode:
              binanceConfig.liveRiskMode ||
              binanceConfig.riskMode ||
              "PERCENTAGE",
            riskAmountUsd:
              binanceConfig.liveRiskAmountUsd ??
              binanceConfig.riskAmountUsd ??
              10.0,
            riskPerTradePct:
              binanceConfig.liveRiskPerTradePct ??
              binanceConfig.riskPerTradePct ??
              2.0,
            maxOpenPositions:
              binanceConfig.liveMaxOpenPositions ??
              binanceConfig.maxOpenPositions ??
              3,
            coinFilterMode:
              binanceConfig.liveCoinFilterMode ||
              binanceConfig.coinFilterMode ||
              "ALL",
            targetCoins:
              binanceConfig.liveTargetCoins ?? binanceConfig.targetCoins ?? "",
            tradeDirection:
              binanceConfig.liveTradeDirection ||
              binanceConfig.tradeDirection ||
              "BOTH",
            minScore: binanceConfig.liveMinScore ?? binanceConfig.minScore ?? 0,
            blockLongOnBtcBearish:
              binanceConfig.liveBlockLongOnBtcBearish ??
              binanceConfig.blockLongOnBtcBearish ??
              true,
            tpMode: getTpConfig().liveTpMode,
            customTpRoiPct: getTpConfig().liveCustomTpRoiPct,
            customTpSplitRatio: getTpConfig().liveCustomTpSplitRatio,
            slMode: getTpConfig().liveSlMode,
            customSlValue: getTpConfig().liveCustomSlValue,
          });
        } catch (liveErr: any) {
          liveOutcome = { status: "FAILED", reason: liveErr.message };
          addAppLog(
            "ERROR",
            "BinanceLive",
            `Failed to execute Binance Live signal: ${liveErr.message}`,
            liveErr,
          );
        }
      }
      sendSignalResultAck(data, "LIVE", liveOutcome);
    } else {
      const off: AckOutcome = {
        status: "DISABLED",
        reason: "Binance Futures is not a target exchange",
      };
      sendSignalResultAck(data, "TESTNET", off);
      sendSignalResultAck(data, "LIVE", off);
    }
  } catch (err: any) {
    addAppLog(
      "ERROR",
      "SignalEngine",
      `Error processing signal: ${err.message}`,
      err,
    );
  }
}
