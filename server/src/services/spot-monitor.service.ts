import { prisma } from "../lib/db";
import { addAppLog } from "../lib/logger";
import { getTokocryptoTicker, placeTokocryptoOrder } from "../lib/tokocrypto";

let monitorInterval: NodeJS.Timeout | null = null;
let isChecking = false;

/**
 * Worker pemeriksaan harga real-time untuk mengeksekusi Take Profit (+5%) atau Stop Loss (-2.5%)
 */
export async function checkSpotTradesCycle(): Promise<void> {
  if (isChecking) return;
  isChecking = true;

  try {
    const openTrades = await prisma.spotTrade.findMany({
      where: { status: "OPEN" },
    });

    if (openTrades.length === 0) {
      isChecking = false;
      return;
    }

    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const apiKey = (config?.tokocryptoApiKey || "").trim();
    const apiSecret = (config?.tokocryptoApiSecret || "").trim();
    const isDryRun = config?.dryRun ?? false;

    for (const trade of openTrades) {
      try {
        const ticker = await getTokocryptoTicker(trade.symbol);
        const currentPrice = ticker.lastPrice;

        if (!currentPrice || currentPrice <= 0) continue;

        const isTpReached = currentPrice >= trade.tpPrice;
        const isSlReached = currentPrice <= trade.slPrice;

        if (isTpReached || isSlReached) {
          const actionType = isTpReached ? "TAKE PROFIT" : "STOP LOSS";
          const newStatus = isTpReached ? "TP_CLOSED" : "SL_CLOSED";
          const pnlUsd = (currentPrice - trade.entryPrice) * trade.quantity;
          const pnlPct =
            ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

          let exitOrderId = `SIM-SELL-${Date.now()}`;

          // Jika trade riil dan bukan dry-run, kirim order SELL Market ke Tokocrypto
          if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
            if (!apiKey || !apiSecret) {
              addAppLog(
                "ERROR",
                "SpotMonitor",
                `Tidak dapat mengeksekusi ${actionType} untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
              );
              continue;
            }

            const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
              symbol: trade.symbol,
              side: "SELL",
              type: "MARKET",
              quantity: trade.quantity,
            });
            exitOrderId = sellResult.orderId;
          }

          // Perbarui status posisi di database lokal
          await prisma.spotTrade.update({
            where: { id: trade.id },
            data: {
              status: newStatus,
              exitPrice: currentPrice,
              exitOrderId,
              pnlUsd,
              closedAt: new Date(),
            },
          });

          const logTag = isTpReached ? "SUCCESS" : "WARN";
          addAppLog(
            logTag,
            "SpotMonitor",
            `[${actionType} HIT] ${trade.symbol} telah ditutup di harga $${currentPrice.toFixed(4)}. PnL: ${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)} (${pnlPct.toFixed(2)}%). OrderID: ${exitOrderId}`,
          );
        }
      } catch (err: any) {
        addAppLog(
          "ERROR",
          "SpotMonitor",
          `Gagal memproses evaluasi harga untuk ${trade.symbol}: ${err.message}`,
        );
      }
    }
  } catch (err: any) {
    console.error("[SpotMonitor] Error cycle:", err);
  } finally {
    isChecking = false;
  }
}

/**
 * Menutup posisi spot secara manual oleh pengguna (Sell Now)
 */
export async function closeSpotTradeManually(tradeId: string): Promise<{
  success: boolean;
  message: string;
  exitPrice?: number;
  pnlUsd?: number;
}> {
  try {
    const trade = await prisma.spotTrade.findUnique({
      where: { id: tradeId },
    });

    if (!trade || trade.status !== "OPEN") {
      return {
        success: false,
        message: "Posisi tidak ditemukan atau sudah ditutup sebelumnya.",
      };
    }

    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const isDryRun = config?.dryRun ?? false;
    const apiKey = (config?.tokocryptoApiKey || "").trim();
    const apiSecret = (config?.tokocryptoApiSecret || "").trim();

    const ticker = await getTokocryptoTicker(trade.symbol);
    const currentPrice =
      ticker.lastPrice > 0 ? ticker.lastPrice : trade.entryPrice;

    let exitOrderId = `MANUAL-SELL-${Date.now()}`;

    // Jika trade riil dan bukan dry-run, eksekusi SELL Market ke Tokocrypto
    if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
      if (!apiKey || !apiSecret) {
        return {
          success: false,
          message: "API Key / Secret Tokocrypto belum dikonfigurasi.",
        };
      }

      const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
        symbol: trade.symbol,
        side: "SELL",
        type: "MARKET",
        quantity: trade.quantity,
      });
      exitOrderId = sellResult.orderId;
    }

    const pnlUsd = (currentPrice - trade.entryPrice) * trade.quantity;
    const pnlPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

    await prisma.spotTrade.update({
      where: { id: trade.id },
      data: {
        status: "MANUAL_CLOSED",
        exitPrice: currentPrice,
        exitOrderId,
        pnlUsd,
        closedAt: new Date(),
      },
    });

    addAppLog(
      "INFO",
      "SpotMonitor",
      `[MANUAL CLOSE] Posisi ${trade.symbol} ditutup manual di $${currentPrice.toFixed(4)}. PnL: ${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)} (${pnlPct.toFixed(2)}%).`,
    );

    return {
      success: true,
      message: `Posisi ${trade.symbol} berhasil dijual di harga $${currentPrice.toFixed(4)}.`,
      exitPrice: currentPrice,
      pnlUsd,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal menutup posisi: ${err.message}`,
    };
  }
}

/**
 * Memulai loop background monitor (berjalan setiap 4 detik)
 */
export function startSpotMonitor(intervalMs: number = 4000): void {
  if (monitorInterval) return;

  monitorInterval = setInterval(() => {
    checkSpotTradesCycle().catch((err) =>
      console.error("[SpotMonitor] Unhandled error:", err),
    );
  }, intervalMs);
}

/**
 * Menghentikan loop background monitor
 */
export function stopSpotMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
