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

    const config = await prisma.tokocryptoConfig.findUnique({
      where: { id: 1 },
    });
    const apiKey = (config?.apiKey || "").trim();
    const apiSecret = (config?.apiSecret || "").trim();
    const isDryRun = config?.dryRun ?? false;

    for (const trade of openTrades) {
      try {
        const ticker = await getTokocryptoTicker(trade.symbol);
        const currentPrice = ticker.lastPrice;

        if (!currentPrice || currentPrice <= 0) continue;

        const remainingQty = trade.remainingQty ?? trade.quantity;
        if (remainingQty <= 0) continue;

        // 1. Cek STOP LOSS Terlebih Dahulu
        const isSlReached = currentPrice <= trade.slPrice;
        if (isSlReached) {
          let exitOrderId = `SIM-SELL-${Date.now()}`;

          // Jika trade riil dan bukan dry-run, kirim order SELL Market ke Tokocrypto
          if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
            if (!apiKey || !apiSecret) {
              addAppLog(
                "ERROR",
                "SpotMonitor",
                `Tidak dapat mengeksekusi STOP LOSS untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
              );
              continue;
            }

            const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
              symbol: trade.symbol,
              side: "SELL",
              type: "MARKET",
              quantity: remainingQty,
            });
            exitOrderId = sellResult.orderId;
          }

          const lossUsd = (currentPrice - trade.entryPrice) * remainingQty;
          const totalPnlUsd = (trade.realizedPnl || 0) + lossUsd;
          const pnlPct =
            ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

          await prisma.spotTrade.update({
            where: { id: trade.id },
            data: {
              status: "SL_CLOSED",
              remainingQty: 0,
              exitPrice: currentPrice,
              exitOrderId,
              pnlUsd: totalPnlUsd,
              closedAt: new Date(),
            },
          });

          addAppLog(
            "WARN",
            "SpotMonitor",
            `[STOP LOSS HIT] ${trade.symbol} closed ${remainingQty} coins at $${currentPrice.toFixed(4)}. Total PnL: ${totalPnlUsd >= 0 ? "+" : ""}$${totalPnlUsd.toFixed(2)} (${pnlPct.toFixed(2)}%). OrderID: ${exitOrderId}`,
          );
          continue;
        }

        // 2. Cek Multi-Stage TAKE PROFIT (TP1, TP2, TP3)
        // Stage 0: Menunggu TP1
        if (trade.tpStage === 0) {
          const targetTp1 = trade.tp1Price || trade.tpPrice;
          if (currentPrice >= targetTp1) {
            const sellQty =
              trade.tp1Qty && trade.tp1Qty > 0
                ? Math.min(trade.tp1Qty, remainingQty)
                : remainingQty;
            let exitOrderId = `SIM-SELL-${Date.now()}`;

            if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
              if (!apiKey || !apiSecret) {
                addAppLog(
                  "ERROR",
                  "SpotMonitor",
                  `Tidak dapat mengeksekusi TP1 untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
                );
                continue;
              }

              const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
                symbol: trade.symbol,
                side: "SELL",
                type: "MARKET",
                quantity: sellQty,
              });
              exitOrderId = sellResult.orderId;
            }

            const pnlStage = (currentPrice - trade.entryPrice) * sellQty;
            const newRealizedPnl = (trade.realizedPnl || 0) + pnlStage;
            const newRemainingQty = Math.max(0, remainingQty - sellQty);
            const pnlPct =
              ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

            const hasNextStage =
              newRemainingQty > 0 &&
              ((trade.tp2Qty && trade.tp2Qty > 0) ||
                (trade.tp3Qty && trade.tp3Qty > 0));

            if (!hasNextStage) {
              // Full TP selesai pada stage 1 (termasuk kondisi SmartMerge ke single TP)
              await prisma.spotTrade.update({
                where: { id: trade.id },
                data: {
                  status: "TP_CLOSED",
                  tpStage: 1,
                  remainingQty: 0,
                  exitPrice: currentPrice,
                  exitOrderId,
                  pnlUsd: newRealizedPnl,
                  closedAt: new Date(),
                },
              });
              addAppLog(
                "SUCCESS",
                "SpotMonitor",
                `[TP1 HIT / FULL TP] ${trade.symbol} 100% closed (${sellQty} coins) at $${currentPrice.toFixed(4)}. Total PnL: +$${newRealizedPnl.toFixed(2)} (+${pnlPct.toFixed(2)}%). OrderID: ${exitOrderId}`,
              );
            } else {
              // Parsial TP1 selesai (50%), posisi tetap OPEN untuk menunggu TP2
              await prisma.spotTrade.update({
                where: { id: trade.id },
                data: {
                  tpStage: 1,
                  remainingQty: newRemainingQty,
                  realizedPnl: newRealizedPnl,
                  exitOrderId,
                },
              });
              addAppLog(
                "SUCCESS",
                "SpotMonitor",
                `[TP1 HIT] ${trade.symbol} 50% closed (${sellQty} coins) at $${currentPrice.toFixed(4)}. Realized PnL: +$${pnlStage.toFixed(2)}. Remaining: ${newRemainingQty} coins (Next: TP2 @ $${trade.tp2Price?.toFixed(4) || "..."}).`,
              );
            }
            continue;
          }
        }

        // Stage 1: Menunggu TP2
        if (trade.tpStage === 1) {
          const targetTp2 = trade.tp2Price || trade.tpPrice * 1.015;
          if (currentPrice >= targetTp2) {
            const sellQty =
              trade.tp2Qty && trade.tp2Qty > 0
                ? Math.min(trade.tp2Qty, remainingQty)
                : remainingQty;
            let exitOrderId = `SIM-SELL-${Date.now()}`;

            if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
              if (!apiKey || !apiSecret) {
                addAppLog(
                  "ERROR",
                  "SpotMonitor",
                  `Tidak dapat mengeksekusi TP2 untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
                );
                continue;
              }

              const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
                symbol: trade.symbol,
                side: "SELL",
                type: "MARKET",
                quantity: sellQty,
              });
              exitOrderId = sellResult.orderId;
            }

            const pnlStage = (currentPrice - trade.entryPrice) * sellQty;
            const newRealizedPnl = (trade.realizedPnl || 0) + pnlStage;
            const newRemainingQty = Math.max(0, remainingQty - sellQty);
            const pnlPct =
              ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

            const hasNextStage =
              newRemainingQty > 0 && trade.tp3Qty && trade.tp3Qty > 0;

            if (!hasNextStage) {
              // Full TP selesai pada stage 2
              await prisma.spotTrade.update({
                where: { id: trade.id },
                data: {
                  status: "TP_CLOSED",
                  tpStage: 2,
                  remainingQty: 0,
                  exitPrice: currentPrice,
                  exitOrderId,
                  pnlUsd: newRealizedPnl,
                  closedAt: new Date(),
                },
              });
              addAppLog(
                "SUCCESS",
                "SpotMonitor",
                `[TP2 HIT / FULL TP] ${trade.symbol} closed at $${currentPrice.toFixed(4)}. Total PnL: +$${newRealizedPnl.toFixed(2)} (+${pnlPct.toFixed(2)}%). OrderID: ${exitOrderId}`,
              );
            } else {
              // Parsial TP2 selesai (30%), posisi tetap OPEN untuk menunggu TP3
              await prisma.spotTrade.update({
                where: { id: trade.id },
                data: {
                  tpStage: 2,
                  remainingQty: newRemainingQty,
                  realizedPnl: newRealizedPnl,
                  exitOrderId,
                },
              });
              addAppLog(
                "SUCCESS",
                "SpotMonitor",
                `[TP2 HIT] ${trade.symbol} 30% closed (${sellQty} coins) at $${currentPrice.toFixed(4)}. Realized PnL: +$${pnlStage.toFixed(2)}. Remaining: ${newRemainingQty} coins (Next: TP3 @ $${trade.tp3Price?.toFixed(4) || "..."}).`,
              );
            }
            continue;
          }
        }

        // Stage 2: Menunggu TP3
        if (trade.tpStage === 2) {
          const targetTp3 = trade.tp3Price || trade.tpPrice * 1.02;
          if (currentPrice >= targetTp3) {
            const sellQty = remainingQty;
            let exitOrderId = `SIM-SELL-${Date.now()}`;

            if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
              if (!apiKey || !apiSecret) {
                addAppLog(
                  "ERROR",
                  "SpotMonitor",
                  `Tidak dapat mengeksekusi TP3 untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
                );
                continue;
              }

              const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
                symbol: trade.symbol,
                side: "SELL",
                type: "MARKET",
                quantity: sellQty,
              });
              exitOrderId = sellResult.orderId;
            }

            const pnlStage = (currentPrice - trade.entryPrice) * sellQty;
            const totalPnlUsd = (trade.realizedPnl || 0) + pnlStage;
            const pnlPct =
              ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

            await prisma.spotTrade.update({
              where: { id: trade.id },
              data: {
                status: "TP_CLOSED",
                tpStage: 3,
                remainingQty: 0,
                exitPrice: currentPrice,
                exitOrderId,
                pnlUsd: totalPnlUsd,
                closedAt: new Date(),
              },
            });

            addAppLog(
              "SUCCESS",
              "SpotMonitor",
              `[TP3 HIT / FULL TP] ${trade.symbol} 100% completed! (${sellQty} coins) closed at $${currentPrice.toFixed(4)}. Total PnL: +$${totalPnlUsd.toFixed(2)} (+${pnlPct.toFixed(2)}%). OrderID: ${exitOrderId}`,
            );
            continue;
          }
        }
      } catch (err: any) {
        addAppLog(
          "ERROR",
          "SpotMonitor",
          `Failed to process price evaluation for ${trade.symbol}: ${err.message}`,
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
        message: "Position not found or already closed.",
      };
    }

    const remainingQty = trade.remainingQty ?? trade.quantity;
    if (remainingQty <= 0) {
      return {
        success: false,
        message: "No remaining coins to sell in this position.",
      };
    }

    const config = await prisma.tokocryptoConfig.findUnique({
      where: { id: 1 },
    });
    const isDryRun = config?.dryRun ?? false;
    const apiKey = (config?.apiKey || "").trim();
    const apiSecret = (config?.apiSecret || "").trim();

    const ticker = await getTokocryptoTicker(trade.symbol);
    const currentPrice =
      ticker.lastPrice > 0 ? ticker.lastPrice : trade.entryPrice;

    let exitOrderId = `MANUAL-SELL-${Date.now()}`;

    // Jika trade riil dan bukan dry-run, eksekusi SELL Market ke Tokocrypto
    if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
      if (!apiKey || !apiSecret) {
        return {
          success: false,
          message: "Tokocrypto API Key / Secret is not configured.",
        };
      }

      const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
        symbol: trade.symbol,
        side: "SELL",
        type: "MARKET",
        quantity: remainingQty,
      });
      exitOrderId = sellResult.orderId;
    }

    const currentPnl = (currentPrice - trade.entryPrice) * remainingQty;
    const totalPnlUsd = (trade.realizedPnl || 0) + currentPnl;
    const pnlPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

    await prisma.spotTrade.update({
      where: { id: trade.id },
      data: {
        status: "MANUAL_CLOSED",
        remainingQty: 0,
        exitPrice: currentPrice,
        exitOrderId,
        pnlUsd: totalPnlUsd,
        closedAt: new Date(),
      },
    });

    addAppLog(
      "INFO",
      "SpotMonitor",
      `[MANUAL CLOSE] Position ${trade.symbol} manually closed (${remainingQty} coins) at $${currentPrice.toFixed(4)}. Total PnL: ${totalPnlUsd >= 0 ? "+" : ""}$${totalPnlUsd.toFixed(2)} (${pnlPct.toFixed(2)}%).`,
    );

    return {
      success: true,
      message: `Position ${trade.symbol} sold successfully at $${currentPrice.toFixed(4)}.`,
      exitPrice: currentPrice,
      pnlUsd: totalPnlUsd,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to close position: ${err.message}`,
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
