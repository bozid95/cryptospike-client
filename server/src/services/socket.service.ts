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
      console.error("[Bot] Gagal membaca token dari database:", err);
    }
  }

  if (!activeToken) {
    addAppLog(
      "WARN",
      "SignalClient",
      "Belum ada Client Token. Masukkan Client Token di Web Dashboard (Menu Config).",
    );
    return;
  }

  if (socket) {
    addAppLog(
      "INFO",
      "SignalClient",
      "Memperbarui sesi WebSocket dengan token baru...",
    );
    socket.disconnect();
    socket = null;
  }

  addAppLog(
    "INFO",
    "SignalClient",
    `Menghubungkan ke Server Sinyal (${SERVER_URL})...`,
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
      `Terhubung ke Server Sinyal (${SERVER_URL})!`,
    );
  });

  socket.on("disconnect", (reason) => {
    addAppLog(
      "WARN",
      "SignalClient",
      `Terputus dari Server Sinyal (${reason})`,
    );
  });

  socket.on("connect_error", (err) => {
    addAppLog(
      "WARN",
      "SignalClient",
      `Gagal terhubung ke sinyal (${err.message})`,
    );
  });

  socket.on("new_signal", async (data) => {
    await handleIncomingSignal(data);
  });
}

export async function handleIncomingSignal(data: any): Promise<void> {
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      addAppLog(
        "WARN",
        "SignalEngine",
        "Konfigurasi bot belum tersimpan di database.",
      );
      return;
    }

    const targetExchange = (config.targetExchange || "BINANCE").toUpperCase();
    const shouldExecuteTokocrypto =
      targetExchange === "TOKOCRYPTO" || targetExchange === "BOTH";
    const shouldExecuteBinance =
      targetExchange === "BINANCE" || targetExchange === "BOTH";

    // 1. Eksekusi Tokocrypto Spot jika target TOKOCRYPTO atau BOTH
    if (shouldExecuteTokocrypto) {
      try {
        const openSpotCount = await prisma.spotTrade.count({
          where: { status: "OPEN" },
        });

        const maxPos =
          config.tokocryptoMaxOpenPositions ?? config.maxOpenPositions ?? 5;
        if (openSpotCount >= maxPos) {
          addAppLog(
            "WARN",
            "Tokocrypto",
            `Maksimal posisi terbuka (${openSpotCount}/${maxPos}) telah tercapai. Sinyal ${data?.symbol} dilewati.`,
          );
        } else {
          const result = await executeTokocryptoSignalOrder(data, {
            autoExecute:
              config.tokocryptoAutoExecute ?? config.autoExecute ?? false,
            dryRun: config.tokocryptoDryRun ?? config.dryRun ?? false,
            tokocryptoApiKey: config.tokocryptoApiKey,
            tokocryptoApiSecret: config.tokocryptoApiSecret,
            tokocryptoQuoteAsset:
              (config.tokocryptoQuoteAsset as "USDT" | "BIDR") || "USDT",
            riskPerTradePct:
              config.tokocryptoRiskPerTradePct ??
              config.riskPerTradePct ??
              10.0,
            maxOpenPositions: maxPos,
            coinFilterMode:
              config.tokocryptoCoinFilterMode ?? config.coinFilterMode ?? "ALL",
            targetCoins:
              config.tokocryptoTargetCoins ?? config.targetCoins ?? "",
          });

          // Jika order berhasil atau simulasi sukses, catat ke tabel SpotTrade
          if (result.success && result.order) {
            await prisma.spotTrade.create({
              data: {
                exchange: "TOKOCRYPTO",
                symbol: result.order.symbol,
                buyOrderId: result.order.orderId,
                entryPrice: Number(data.entryPrice),
                quantity: result.order.executedQty,
                tpPrice: result.tpPrice || Number(data.entryPrice) * 1.05,
                slPrice: result.slPrice || Number(data.entryPrice) * 0.975,
                status: "OPEN",
              },
            });
          }
        }
      } catch (tokoErr: any) {
        addAppLog(
          "ERROR",
          "Tokocrypto",
          `Gagal eksekusi sinyal Tokocrypto: ${tokoErr.message}`,
          tokoErr,
        );
      }
    }

    // 2. Eksekusi Binance Futures jika target BINANCE atau BOTH
    if (shouldExecuteBinance) {
      try {
        await executeSignalOrder(data, {
          autoExecute: config.binanceAutoExecute ?? config.autoExecute ?? false,
          binanceApiKey: config.binanceApiKey,
          binanceApiSecret: config.binanceApiSecret,
          environment: config.environment || "TESTNET",
          marginType: config.marginType || "ISOLATED",
          leverage: config.leverage || 10,
          riskPerTradePct:
            config.binanceRiskPerTradePct ?? config.riskPerTradePct ?? 2.0,
          maxOpenPositions:
            config.binanceMaxOpenPositions ?? config.maxOpenPositions ?? 3,
          coinFilterMode:
            config.binanceCoinFilterMode ?? config.coinFilterMode ?? "ALL",
          targetCoins: config.binanceTargetCoins ?? config.targetCoins ?? "",
        });
      } catch (binanceErr: any) {
        addAppLog(
          "ERROR",
          "Binance",
          `Gagal eksekusi sinyal Binance: ${binanceErr.message}`,
          binanceErr,
        );
      }
    }
  } catch (err: any) {
    addAppLog(
      "ERROR",
      "SignalEngine",
      `Error saat memproses sinyal: ${err.message}`,
      err,
    );
  }
}
