import { prisma } from "../lib/db";
import { addAppLog } from "../lib/logger";
import {
  getTokocryptoTicker,
  placeTokocryptoOrder,
  getTokocryptoBalance,
  getTokocryptoSymbolRules,
  normalizeTokocryptoSymbol,
  floorToStepSize,
} from "../lib/tokocrypto";

let monitorInterval: NodeJS.Timeout | null = null;
let isChecking = false;

// Throttle map agar log peringatan/error yang sama tidak membanjiri database setiap 4 detik
const throttledLogMap = new Map<string, number>();

function logThrottled(
  key: string,
  level: "INFO" | "WARN" | "ERROR",
  source: string,
  message: string,
  cooldownMs: number = 60_000,
): void {
  const now = Date.now();
  const lastTime = throttledLogMap.get(key) || 0;
  if (now - lastTime >= cooldownMs) {
    throttledLogMap.set(key, now);
    addAppLog(level, source, message);
  }
}

export interface ResolveSellQtyResult {
  action: "SELL" | "AUTO_CLOSE_EMPTY" | "SKIP_LOCKED";
  sellQty: number;
  remainingAfterSell: number;
  forceFullClose: boolean;
  freeBalance: number;
  lockedBalance: number;
  reason?: string;
}

/**
 * Mengevaluasi kuantitas jual aktual berdasarkan saldo free di dompet Tokocrypto,
 * aturan stepSize/minQty/minNotional, serta menggabungkan sisa koin secara dinamis
 * (Dynamic Auto-Merge) jika sisa untuk TP berikutnya kurang dari batas minimal bursa ($5).
 */
export async function resolveActualSellQuantity(params: {
  apiKey: string;
  apiSecret: string;
  symbol: string;
  requestedQty: number;
  totalRemainingQty: number;
  currentPrice: number;
  hasNextStage: boolean;
  nextTargetPrice?: number;
  baseUrl?: string;
  customFetch?: typeof fetch;
}): Promise<ResolveSellQtyResult> {
  const {
    apiKey,
    apiSecret,
    symbol,
    requestedQty,
    totalRemainingQty,
    currentPrice,
    hasNextStage,
    nextTargetPrice,
    baseUrl,
    customFetch,
  } = params;

  const formattedSymbol = normalizeTokocryptoSymbol(symbol);
  const baseAsset = (
    formattedSymbol.split("_")[0] || formattedSymbol
  ).toUpperCase();

  const [rules, bal] = await Promise.all([
    getTokocryptoSymbolRules(formattedSymbol, baseUrl, customFetch),
    getTokocryptoBalance(apiKey, apiSecret, baseAsset, baseUrl, customFetch),
  ]);

  const maxSellableQty = floorToStepSize(bal.free, rules.stepSize);

  // 1. Jika saldo bebas di dompet kosong atau di bawah batas minimal lot (minQty)
  if (maxSellableQty <= 0 || maxSellableQty < rules.minQty) {
    if (bal.locked >= rules.minQty) {
      return {
        action: "SKIP_LOCKED",
        sellQty: 0,
        remainingAfterSell: totalRemainingQty,
        forceFullClose: false,
        freeBalance: bal.free,
        lockedBalance: bal.locked,
        reason: `Coin ${baseAsset} is locked in an active open order on Tokocrypto (free: ${bal.free}, locked: ${bal.locked}).`,
      };
    }

    return {
      action: "AUTO_CLOSE_EMPTY",
      sellQty: 0,
      remainingAfterSell: 0,
      forceFullClose: true,
      freeBalance: bal.free,
      lockedBalance: bal.locked,
      reason: `Wallet balance for ${baseAsset} on Tokocrypto is already 0 or below minimum lot (${bal.free} < ${rules.minQty}). Position closed/synced automatically.`,
    };
  }

  const effectiveTotal = floorToStepSize(
    Math.min(totalRemainingQty, maxSellableQty),
    rules.stepSize,
  );
  const cappedRequestedQty = floorToStepSize(
    Math.min(requestedQty, effectiveTotal),
    rules.stepSize,
  );

  // 2. Jika ini adalah penutupan penuh (SL, TP3, Manual Close, atau Single TP)
  if (!hasNextStage) {
    const finalSellQty =
      effectiveTotal >= rules.minQty ? effectiveTotal : maxSellableQty;
    return {
      action: "SELL",
      sellQty: finalSellQty,
      remainingAfterSell: 0,
      forceFullClose: true,
      freeBalance: bal.free,
      lockedBalance: bal.locked,
    };
  }

  // 3. Jika ini adalah Partial TP (TP1 atau TP2), cek apakah sisa koin untuk tahap berikutnya masih layak dijual (>= $5 & >= minQty)
  const remainderQty = floorToStepSize(
    Math.max(0, effectiveTotal - cappedRequestedQty),
    rules.stepSize,
  );
  const evalNextPrice =
    nextTargetPrice && nextTargetPrice > 0 ? nextTargetPrice : currentPrice;
  const minNotionalThreshold = Math.max(rules.minNotional || 5.0, 5.0);

  const isPartialTooSmall =
    cappedRequestedQty < rules.minQty ||
    cappedRequestedQty * currentPrice < (rules.minNotional || 5.0);
  const isRemainderTooSmall =
    remainderQty < rules.minQty ||
    remainderQty * evalNextPrice < minNotionalThreshold;

  if (
    cappedRequestedQty >= effectiveTotal ||
    isPartialTooSmall ||
    isRemainderTooSmall
  ) {
    const mergedSellQty =
      effectiveTotal >= rules.minQty ? effectiveTotal : maxSellableQty;
    return {
      action: "SELL",
      sellQty: mergedSellQty,
      remainingAfterSell: 0,
      forceFullClose: true,
      freeBalance: bal.free,
      lockedBalance: bal.locked,
      reason: `[DynamicMerge] Remaining coins (${remainderQty} ${baseAsset} ~ $${(remainderQty * evalNextPrice).toFixed(2)}) would be below exchange minimum ($${minNotionalThreshold.toFixed(2)}). Merged 100% into current TP.`,
    };
  }

  return {
    action: "SELL",
    sellQty: cappedRequestedQty,
    remainingAfterSell: remainderQty,
    forceFullClose: false,
    freeBalance: bal.free,
    lockedBalance: bal.locked,
  };
}

/**
 * Worker pemeriksaan harga real-time untuk mengeksekusi Take Profit atau Stop Loss
 */
export async function checkSpotTradesCycle(): Promise<void> {
  if (isChecking) return;
  isChecking = true;

  try {
    const config = await prisma.tokocryptoConfig.findUnique({
      where: { id: 1 },
    });

    // Jika Auto-Trade dimatikan pada Tokocrypto, nonaktifkan pantauan 4 detik agar user bisa HOLD asetnya
    if (!config?.autoExecute) {
      isChecking = false;
      return;
    }

    const openTrades = await prisma.spotTrade.findMany({
      where: { status: "OPEN" },
    });

    if (openTrades.length === 0) {
      isChecking = false;
      return;
    }

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

        const isSimulated = isDryRun || trade.buyOrderId.startsWith("SIM-");

        // 1. Cek STOP LOSS Terlebih Dahulu
        const isSlReached = currentPrice <= trade.slPrice;
        if (isSlReached) {
          let exitOrderId = `SIM-SELL-${Date.now()}`;
          let actualSoldQty = remainingQty;

          if (!isSimulated) {
            if (!apiKey || !apiSecret) {
              logThrottled(
                `no-cred-${trade.symbol}`,
                "ERROR",
                "SpotMonitor",
                `Tidak dapat mengeksekusi STOP LOSS untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
              );
              continue;
            }

            const resolved = await resolveActualSellQuantity({
              apiKey,
              apiSecret,
              symbol: trade.symbol,
              requestedQty: remainingQty,
              totalRemainingQty: remainingQty,
              currentPrice,
              hasNextStage: false,
            });

            if (resolved.action === "SKIP_LOCKED") {
              logThrottled(
                `locked-${trade.symbol}`,
                "WARN",
                "SpotMonitor",
                `[SpotMonitor] Cannot execute SL for ${trade.symbol}: ${resolved.reason}`,
                300_000,
              );
              continue;
            }

            if (resolved.action === "AUTO_CLOSE_EMPTY") {
              await prisma.spotTrade.update({
                where: { id: trade.id },
                data: {
                  status: trade.tpStage > 0 ? "TP_CLOSED" : "MANUAL_CLOSED",
                  remainingQty: 0,
                  exitPrice: currentPrice,
                  pnlUsd: trade.realizedPnl || 0,
                  closedAt: new Date(),
                },
              });
              addAppLog(
                "WARN",
                "SpotMonitor",
                `[AutoSync] ${trade.symbol} closed in local DB: ${resolved.reason}`,
              );
              continue;
            }

            actualSoldQty = resolved.sellQty;
            const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
              symbol: trade.symbol,
              side: "SELL",
              type: "MARKET",
              quantity: actualSoldQty,
            });
            exitOrderId = sellResult.orderId;
          }

          const lossUsd = (currentPrice - trade.entryPrice) * actualSoldQty;
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
            `[STOP LOSS HIT] ${trade.symbol} closed ${actualSoldQty} coins at $${currentPrice.toFixed(4)}. Total PnL: ${totalPnlUsd >= 0 ? "+" : ""}$${totalPnlUsd.toFixed(2)} (${pnlPct.toFixed(2)}%). OrderID: ${exitOrderId}`,
          );
          continue;
        }

        // 2. Cek Multi-Stage TAKE PROFIT (TP1, TP2, TP3)
        // Stage 0: Menunggu TP1
        if (trade.tpStage === 0) {
          const targetTp1 = trade.tp1Price || trade.tpPrice;
          if (currentPrice >= targetTp1) {
            const requestedTp1Qty =
              trade.tp1Qty && trade.tp1Qty > 0
                ? Math.min(trade.tp1Qty, remainingQty)
                : remainingQty;

            const plannedHasNextStage = Boolean(
              remainingQty - requestedTp1Qty > 0 &&
                ((trade.tp2Qty && trade.tp2Qty > 0) ||
                  (trade.tp3Qty && trade.tp3Qty > 0)),
            );

            let sellQty = requestedTp1Qty;
            let newRemainingQty = Math.max(0, remainingQty - sellQty);
            let hasNextStage = plannedHasNextStage;
            let exitOrderId = `SIM-SELL-${Date.now()}`;

            if (!isSimulated) {
              if (!apiKey || !apiSecret) {
                logThrottled(
                  `no-cred-${trade.symbol}`,
                  "ERROR",
                  "SpotMonitor",
                  `Tidak dapat mengeksekusi TP1 untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
                );
                continue;
              }

              const resolved = await resolveActualSellQuantity({
                apiKey,
                apiSecret,
                symbol: trade.symbol,
                requestedQty: requestedTp1Qty,
                totalRemainingQty: remainingQty,
                currentPrice,
                hasNextStage: plannedHasNextStage,
                nextTargetPrice: trade.tp2Price || currentPrice,
              });

              if (resolved.action === "SKIP_LOCKED") {
                logThrottled(
                  `locked-${trade.symbol}`,
                  "WARN",
                  "SpotMonitor",
                  `[SpotMonitor] Cannot execute TP1 for ${trade.symbol}: ${resolved.reason}`,
                  300_000,
                );
                continue;
              }

              if (resolved.action === "AUTO_CLOSE_EMPTY") {
                await prisma.spotTrade.update({
                  where: { id: trade.id },
                  data: {
                    status: "MANUAL_CLOSED",
                    remainingQty: 0,
                    exitPrice: currentPrice,
                    pnlUsd: trade.realizedPnl || 0,
                    closedAt: new Date(),
                  },
                });
                addAppLog(
                  "WARN",
                  "SpotMonitor",
                  `[AutoSync] ${trade.symbol} closed in local DB: ${resolved.reason}`,
                );
                continue;
              }

              sellQty = resolved.sellQty;
              newRemainingQty = resolved.remainingAfterSell;
              hasNextStage =
                !resolved.forceFullClose && resolved.remainingAfterSell > 0;

              if (resolved.reason) {
                addAppLog("INFO", "SpotMonitor", resolved.reason);
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
            const pnlPct =
              ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

            if (!hasNextStage) {
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
            const requestedTp2Qty =
              trade.tp2Qty && trade.tp2Qty > 0
                ? Math.min(trade.tp2Qty, remainingQty)
                : remainingQty;

            const plannedHasNextStage = Boolean(
              remainingQty - requestedTp2Qty > 0 &&
                trade.tp3Qty &&
                trade.tp3Qty > 0,
            );

            let sellQty = requestedTp2Qty;
            let newRemainingQty = Math.max(0, remainingQty - sellQty);
            let hasNextStage = plannedHasNextStage;
            let exitOrderId = `SIM-SELL-${Date.now()}`;

            if (!isSimulated) {
              if (!apiKey || !apiSecret) {
                logThrottled(
                  `no-cred-${trade.symbol}`,
                  "ERROR",
                  "SpotMonitor",
                  `Tidak dapat mengeksekusi TP2 untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
                );
                continue;
              }

              const resolved = await resolveActualSellQuantity({
                apiKey,
                apiSecret,
                symbol: trade.symbol,
                requestedQty: requestedTp2Qty,
                totalRemainingQty: remainingQty,
                currentPrice,
                hasNextStage: plannedHasNextStage,
                nextTargetPrice: trade.tp3Price || currentPrice,
              });

              if (resolved.action === "SKIP_LOCKED") {
                logThrottled(
                  `locked-${trade.symbol}`,
                  "WARN",
                  "SpotMonitor",
                  `[SpotMonitor] Cannot execute TP2 for ${trade.symbol}: ${resolved.reason}`,
                  300_000,
                );
                continue;
              }

              if (resolved.action === "AUTO_CLOSE_EMPTY") {
                await prisma.spotTrade.update({
                  where: { id: trade.id },
                  data: {
                    status: "TP_CLOSED",
                    remainingQty: 0,
                    exitPrice: currentPrice,
                    pnlUsd: trade.realizedPnl || 0,
                    closedAt: new Date(),
                  },
                });
                addAppLog(
                  "WARN",
                  "SpotMonitor",
                  `[AutoSync] ${trade.symbol} closed in local DB: ${resolved.reason}`,
                );
                continue;
              }

              sellQty = resolved.sellQty;
              newRemainingQty = resolved.remainingAfterSell;
              hasNextStage =
                !resolved.forceFullClose && resolved.remainingAfterSell > 0;

              if (resolved.reason) {
                addAppLog("INFO", "SpotMonitor", resolved.reason);
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
            const pnlPct =
              ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

            if (!hasNextStage) {
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
                `[TP2 HIT / FULL TP] ${trade.symbol} closed (${sellQty} coins) at $${currentPrice.toFixed(4)}. Total PnL: +$${newRealizedPnl.toFixed(2)} (+${pnlPct.toFixed(2)}%). OrderID: ${exitOrderId}`,
              );
            } else {
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
            let sellQty = remainingQty;
            let exitOrderId = `SIM-SELL-${Date.now()}`;

            if (!isSimulated) {
              if (!apiKey || !apiSecret) {
                logThrottled(
                  `no-cred-${trade.symbol}`,
                  "ERROR",
                  "SpotMonitor",
                  `Tidak dapat mengeksekusi TP3 untuk ${trade.symbol}: Kredensial Tokocrypto tidak tersedia.`,
                );
                continue;
              }

              const resolved = await resolveActualSellQuantity({
                apiKey,
                apiSecret,
                symbol: trade.symbol,
                requestedQty: remainingQty,
                totalRemainingQty: remainingQty,
                currentPrice,
                hasNextStage: false,
              });

              if (resolved.action === "SKIP_LOCKED") {
                logThrottled(
                  `locked-${trade.symbol}`,
                  "WARN",
                  "SpotMonitor",
                  `[SpotMonitor] Cannot execute TP3 for ${trade.symbol}: ${resolved.reason}`,
                  300_000,
                );
                continue;
              }

              if (resolved.action === "AUTO_CLOSE_EMPTY") {
                await prisma.spotTrade.update({
                  where: { id: trade.id },
                  data: {
                    status: "TP_CLOSED",
                    tpStage: 3,
                    remainingQty: 0,
                    exitPrice: currentPrice,
                    pnlUsd: trade.realizedPnl || 0,
                    closedAt: new Date(),
                  },
                });
                addAppLog(
                  "WARN",
                  "SpotMonitor",
                  `[AutoSync] ${trade.symbol} closed in local DB: ${resolved.reason}`,
                );
                continue;
              }

              sellQty = resolved.sellQty;
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
        logThrottled(
          `eval-err-${trade.symbol}-${err.message}`,
          "ERROR",
          "SpotMonitor",
          `Failed to process price evaluation for ${trade.symbol}: ${err.message}`,
          60_000,
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
    let actualSoldQty = remainingQty;

    // Jika trade riil dan bukan dry-run, eksekusi SELL Market ke Tokocrypto
    if (!isDryRun && !trade.buyOrderId.startsWith("SIM-")) {
      if (!apiKey || !apiSecret) {
        return {
          success: false,
          message: "Tokocrypto API Key / Secret is not configured.",
        };
      }

      const resolved = await resolveActualSellQuantity({
        apiKey,
        apiSecret,
        symbol: trade.symbol,
        requestedQty: remainingQty,
        totalRemainingQty: remainingQty,
        currentPrice,
        hasNextStage: false,
      });

      if (resolved.action === "SKIP_LOCKED") {
        return {
          success: false,
          message:
            resolved.reason ||
            "Coins are currently locked in an open order on Tokocrypto.",
        };
      }

      if (resolved.action === "AUTO_CLOSE_EMPTY") {
        await prisma.spotTrade.update({
          where: { id: trade.id },
          data: {
            status: "MANUAL_CLOSED",
            remainingQty: 0,
            exitPrice: currentPrice,
            pnlUsd: trade.realizedPnl || 0,
            closedAt: new Date(),
          },
        });
        addAppLog(
          "WARN",
          "SpotMonitor",
          `[MANUAL CLOSE / SYNC] ${trade.symbol} synced as closed: ${resolved.reason}`,
        );
        return {
          success: true,
          message: `Position ${trade.symbol} synced as closed (wallet balance on Tokocrypto was already empty).`,
          exitPrice: currentPrice,
          pnlUsd: trade.realizedPnl || 0,
        };
      }

      actualSoldQty = resolved.sellQty;
      const sellResult = await placeTokocryptoOrder(apiKey, apiSecret, {
        symbol: trade.symbol,
        side: "SELL",
        type: "MARKET",
        quantity: actualSoldQty,
      });
      exitOrderId = sellResult.orderId;
    }

    const currentPnl = (currentPrice - trade.entryPrice) * actualSoldQty;
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
      `[MANUAL CLOSE] Position ${trade.symbol} manually closed (${actualSoldQty} coins) at $${currentPrice.toFixed(4)}. Total PnL: ${totalPnlUsd >= 0 ? "+" : ""}$${totalPnlUsd.toFixed(2)} (${pnlPct.toFixed(2)}%).`,
    );

    return {
      success: true,
      message: `Position ${trade.symbol} sold successfully (${actualSoldQty} coins) at $${currentPrice.toFixed(4)}.`,
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
