import { prisma } from "../lib/db";
import { addAppLog } from "../lib/logger";
import {
  getAccountAndPositions,
  getOpenOrders,
  cancelAllOpenOrders,
  moveSlToBreakEven,
} from "../lib/binance";
import { isBinanceWsConnected } from "./binance-ws.service";

interface MonitoredPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  initialQty: number;
  bepMoved: boolean;
  lastCheckedAt: number;
}

let monitorInterval: NodeJS.Timeout | null = null;
let isChecking = false;

// Menyimpan state posisi yang sedang dipantau di memori
const monitoredPositions = new Map<string, MonitoredPosition>();
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

/**
 * Worker siklus pemantau Binance Futures:
 * 1. Mendeteksi eksekusi TP1 untuk memindahkan SL ke Break-Even (Auto-BEP).
 * 2. Membersihkan seluruh sisa order (Clean-up) ketika posisi sudah bernilai 0 (Closed).
 */
export async function checkBinancePositionsCycle(): Promise<void> {
  if (isChecking) return;
  // Jika WebSocket aktif, pemantauan ditangani 100% oleh push event stream (Zero-Polling)
  if (isBinanceWsConnected()) {
    return;
  }
  isChecking = true;

  try {
    const config = await prisma.binanceConfig.findUnique({
      where: { id: 1 },
    });

    if (!config?.autoExecute || !config?.apiKey || !config?.apiSecret) {
      isChecking = false;
      return;
    }

    const apiKey = config.apiKey.trim();
    const apiSecret = config.apiSecret.trim();
    const environment = config.environment || "TESTNET";
    const isTestnet = environment === "TESTNET";

    const autoBepEnabled = process.env.BINANCE_AUTO_BEP !== "false";
    const bepBufferPct = parseFloat(
      process.env.BINANCE_BEP_BUFFER_PCT || "0.2",
    );

    // Ambil akun & posisi aktif
    const { positions } = await getAccountAndPositions(
      apiKey,
      apiSecret,
      environment,
    );

    const activeSymbols = new Set<string>();

    for (const pos of positions) {
      const symbol = pos.symbol;
      const currentAmt = Math.abs(pos.positionAmt);
      if (currentAmt <= 0) continue;

      activeSymbols.add(symbol);

      let tracked = monitoredPositions.get(symbol);
      if (!tracked) {
        tracked = {
          symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          initialQty: currentAmt,
          bepMoved: false,
          lastCheckedAt: Date.now(),
        };
        monitoredPositions.set(symbol, tracked);
      } else {
        // Update initialQty jika posisi baru saja ditambah
        if (currentAmt > tracked.initialQty) {
          tracked.initialQty = currentAmt;
        }
      }

      // Evaluasi Auto-BEP: jika belum dipindah ke BEP
      if (autoBepEnabled && !tracked.bepMoved) {
        // Indikator 1: Kuantitas posisi berkurang signifikan (misal <= 60% dari awal, artinya TP1 50% sudah terisi)
        const qtyReducedSignificantly = currentAmt <= tracked.initialQty * 0.65;

        // Indikator 2: Cek open orders apakah order TP1 masih ada atau sudah terisi
        let tp1Filled = qtyReducedSignificantly;

        if (!tp1Filled) {
          try {
            const openOrders = await getOpenOrders(
              apiKey,
              apiSecret,
              symbol,
              isTestnet,
            );
            // Hitung order limit penutup yang masih terbuka
            const limitExitOrders = openOrders.filter(
              (o) =>
                o.type === "LIMIT" &&
                (pos.side === "LONG" ? o.side === "SELL" : o.side === "BUY"),
            );
            // Awalnya ada 2 limit order (TP1 & TP2) atau 3 limit order
            // Jika limit order penutup berkurang atau tidak ada sama sekali saat harga sudah mendekati TP1
            const priceDistancePct =
              pos.side === "LONG"
                ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100
                : ((pos.entryPrice - pos.markPrice) / pos.entryPrice) * 100;

            if (priceDistancePct >= 1.0 && limitExitOrders.length <= 1) {
              tp1Filled = true;
            }
          } catch {}
        }

        if (tp1Filled) {
          addAppLog(
            "INFO",
            "BinanceMonitor",
            `[Auto-BEP Detected] TP1 executed for ${symbol} (remaining qty: ${currentAmt}/${tracked.initialQty}). Moving SL to Break-Even...`,
          );

          const moved = await moveSlToBreakEven(
            apiKey,
            apiSecret,
            symbol,
            pos.side,
            pos.entryPrice,
            isTestnet,
            bepBufferPct,
          );

          if (moved) {
            tracked.bepMoved = true;
          }
        }
      }
    }

    // Evaluasi Clean-up: Periksa simbol yang sebelumnya dipantau tapi sekarang sudah tidak ada posisinya
    for (const [symbol, tracked] of monitoredPositions.entries()) {
      if (!activeSymbols.has(symbol)) {
        // Posisi sudah 0 (CLOSED)
        addAppLog(
          "INFO",
          "BinanceMonitor",
          `[Clean-up] Position ${symbol} is now CLOSED. Cancelling all leftover open orders...`,
        );

        await cancelAllOpenOrders(apiKey, apiSecret, symbol, isTestnet);
        monitoredPositions.delete(symbol);
      }
    }
  } catch (err: any) {
    const isBan = /banned until/i.test(err.message);
    logThrottled(
      "binance-monitor-err",
      "WARN",
      "BinanceMonitor",
      `Error in Binance position monitor cycle: ${err.message}`,
      isBan ? 300_000 : 30_000,
    );
  } finally {
    isChecking = false;
  }
}

/**
 * Menjalankan background worker pemantau Binance Futures (Fallback)
 */
export function startBinanceMonitor(intervalMs: number = 20_000): void {
  if (monitorInterval) return;

  addAppLog(
    "INFO",
    "BinanceMonitor",
    `Binance Futures Position & Auto-BEP Monitor fallback started (interval: ${intervalMs / 1000}s).`,
  );

  monitorInterval = setInterval(() => {
    checkBinancePositionsCycle().catch(() => {});
  }, intervalMs);
}

/**
 * Menghentikan background worker
 */
export function stopBinanceMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    addAppLog("INFO", "BinanceMonitor", "Binance Monitor stopped.");
  }
}
