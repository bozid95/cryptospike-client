import { io as Client } from "socket.io-client";
import { prisma } from "../lib/db";
import { executeSignalOrder } from "../lib/binance";
import { executeTokocryptoSignalOrder } from "../lib/tokocrypto";
import { addAppLog } from "../lib/logger";

const SERVER_URL = process.env.SERVER_URL || "https://signal.forlearning.my.id";

let socket: ReturnType<typeof Client> | null = null;

export function isSocketConnected(): boolean {
  return socket ? socket.connected : false;
}

export function getSocketServerUrl(): string {
  return SERVER_URL;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export async function connectToNestJS(tokenOverride?: string): Promise<void> {
  let activeToken = tokenOverride;

  if (!activeToken) {
    try {
      const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
      activeToken =
        config?.clientToken || process.env.CLIENT_TOKEN || undefined;
    } catch (err) {
      console.error("[Bot] Failed to read token from database:", err);
    }
  }

  if (!activeToken) {
    addAppLog(
      "WARN",
      "SignalClient",
      "No Client Token installed. Please input your Client Token in Web Dashboard (Config menu).",
    );
    return;
  }

  if (socket) {
    addAppLog(
      "INFO",
      "SignalClient",
      "Updating WebSocket session with new token...",
    );
    socket.disconnect();
    socket = null;
  }

  addAppLog(
    "INFO",
    "SignalClient",
    `Connecting to Signal Server (${SERVER_URL})...`,
  );

  socket = Client(SERVER_URL, {
    transports: ["websocket", "polling"],
    auth: { token: activeToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
  });

  socket.on("connect", () => {
    addAppLog(
      "SUCCESS",
      "SignalClient",
      `Connected to Signal Server (${SERVER_URL})!`,
    );
  });

  socket.on("disconnect", (reason) => {
    addAppLog(
      "WARN",
      "SignalClient",
      `Disconnected from Signal Server (${reason})`,
    );
  });

  socket.on("connect_error", (err) => {
    addAppLog(
      "WARN",
      "SignalClient",
      `Failed to connect to Signal Server (${err.message})`,
    );
  });

  socket.on("new_signal", async (data) => {
    await handleIncomingSignal(data);
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

    // 2. Eksekusi Binance Futures jika target BINANCE atau BOTH
    if (shouldExecuteBinance && binanceConfig) {
      try {
        await executeSignalOrder(data, {
          autoExecute: Boolean(binanceConfig.autoExecute),
          binanceApiKey: binanceConfig.apiKey,
          binanceApiSecret: binanceConfig.apiSecret,
          environment: binanceConfig.environment || "TESTNET",
          marginType: binanceConfig.marginType || "ISOLATED",
          leverage: binanceConfig.leverage || 10,
          riskPerTradePct: binanceConfig.riskPerTradePct ?? 2.0,
          maxOpenPositions: binanceConfig.maxOpenPositions ?? 3,
          coinFilterMode: binanceConfig.coinFilterMode || "ALL",
          targetCoins: binanceConfig.targetCoins || "",
          tradeDirection: binanceConfig.tradeDirection || "BOTH",
          minScore: binanceConfig.minScore ?? 0,
          blockLongOnBtcBearish: binanceConfig.blockLongOnBtcBearish ?? true,
        });
      } catch (binanceErr: any) {
        addAppLog(
          "ERROR",
          "Binance",
          `Failed to execute Binance signal: ${binanceErr.message}`,
          binanceErr,
        );
      }
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
