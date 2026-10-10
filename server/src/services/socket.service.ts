import { io as Client } from "socket.io-client";
import { prisma } from "../lib/db";
import { executeSignalOrder } from "../lib/binance";
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

      await executeSignalOrder(data, {
        autoExecute: config.autoExecute,
        binanceApiKey: config.binanceApiKey,
        binanceApiSecret: config.binanceApiSecret,
        environment: config.environment || "TESTNET",
        marginType: config.marginType || "ISOLATED",
        leverage: config.leverage || 10,
        riskPerTradePct: config.riskPerTradePct || 2.0,
        maxOpenPositions: config.maxOpenPositions || 3,
        coinFilterMode: config.coinFilterMode || "ALL",
        targetCoins: config.targetCoins || "",
      });
    } catch (err: any) {
      addAppLog(
        "ERROR",
        "SignalEngine",
        `Error saat memproses sinyal: ${err.message}`,
        err,
      );
    }
  });
}
