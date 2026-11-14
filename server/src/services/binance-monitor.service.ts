import { prisma } from "../lib/db";
import { addAppLog } from "../lib/logger";
import {
  getAccountAndPositions,
  getOpenOrders,
  cancelAllOpenOrders,
  moveSlToBreakEven,
  clearBreakEvenState,
  closePositionDirect,
  getBaseUrl,
  isBinanceRestPaused,
} from "../lib/binance";
import { isBinanceWsHealthy } from "./binance-ws.service";
import { shouldRunMonitorCycle } from "./binance-stream-health";
import { getTpConfig } from "../lib/tp-config";
import { resolveBinanceCredentials } from "../lib/binance-credentials";
import { isQtyReduced, isTp1Filled } from "../lib/tp1-detection";
import {
  BinanceEnv,
  getOwnedPosition,
  listOwnedPositions,
  releaseOwnedPosition,
} from "../lib/owned-positions";

interface MonitoredPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  initialQty: number;
  bepMoved: boolean;
  openedAt: number;
  lastCheckedAt: number;
}

let monitorInterval: NodeJS.Timeout | null = null;
let isChecking = false;
const lastCycleRunAt: Record<BinanceEnv, number> = { TESTNET: 0, LIVE: 0 };

// State posisi milik Client yang sedang dipantau di memori, kunci `${env}:${symbol}`
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
  isChecking = true;

  try {
    // Kredensial dibaca ulang setiap siklus dengan aturan yang sama seperti eksekusi sinyal & WebSocket
    // (liveApiKey/testnetApiKey), jadi key yang diganti/dihapus di konfigurasi langsung berhenti dipakai.
    const config = await prisma.binanceConfig.findUnique({
      where: { id: 1 },
    });
    for (const env of ["TESTNET", "LIVE"] as const) {
      const creds = resolveBinanceCredentials(config, env);
      if (!creds) {
        // Key dihapus: lupakan state pantauan environment ini (tidak ada aksi dengan key lama)
        for (const k of Array.from(monitoredPositions.keys())) {
          if (k.startsWith(`${env}:`)) monitoredPositions.delete(k);
        }
        continue;
      }
      // Hanya bila Client punya posisi terbuka di environment ini; posisi manual tidak pernah disentuh
      if (listOwnedPositions(env).length === 0) {
        for (const k of Array.from(monitoredPositions.keys())) {
          if (k.startsWith(`${env}:`)) monitoredPositions.delete(k);
        }
        continue;
      }
      await checkEnvironment(env, creds.apiKey, creds.apiSecret);
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

async function checkEnvironment(
  environment: BinanceEnv,
  apiKey: string,
  apiSecret: string,
): Promise<void> {
  const isTestnet = environment === "TESTNET";
  try {
    // WebSocket environment AKUN INI sehat (tersambung & benar-benar menerima data) → event stream menangani
    // Auto-BEP/cleanup; monitor REST tetap jalan tiap 60 detik sebagai jaring pengaman.
    // Tidak sehat (mis. URL tanpa jalur yang diam) → monitor REST tiap siklus.
    const now = Date.now();
    if (
      !shouldRunMonitorCycle(
        isBinanceWsHealthy(environment),
        lastCycleRunAt[environment],
        now,
      )
    ) {
      return;
    }
    lastCycleRunAt[environment] = now;

    // Saat 429/418 (atau rem weight) aktif, jangan polling: hanya memperpanjang ban
    if (isBinanceRestPaused(getBaseUrl(isTestnet))) {
      return;
    }

    const autoBepEnabled = process.env.BINANCE_AUTO_BEP !== "false";
    const bepBufferPct = parseFloat(
      process.env.BINANCE_BEP_BUFFER_PCT || "0.2",
    );

    const tpConfig = getTpConfig();
    const stagnationEnabled = isTestnet
      ? Boolean(
          tpConfig.testnetStagnationStopEnabled ??
          process.env.BINANCE_STAGNATION_STOP !== "false",
        )
      : Boolean(
          tpConfig.liveStagnationStopEnabled ??
          process.env.BINANCE_STAGNATION_STOP !== "false",
        );
    const stagnationHours = isTestnet
      ? Number(
          tpConfig.testnetStagnationHours ||
            process.env.BINANCE_STAGNATION_HOURS ||
            32,
        )
      : Number(
          tpConfig.liveStagnationHours ||
            process.env.BINANCE_STAGNATION_HOURS ||
            32,
        );
    const stagnationMs = stagnationHours * 60 * 60 * 1000;

    // Ambil akun & posisi aktif
    const { positions } = await getAccountAndPositions(
      apiKey,
      apiSecret,
      environment,
      "normal",
    );

    const activeSymbols = new Set<string>();

    for (const pos of positions) {
      const symbol = pos.symbol;
      const currentAmt = Math.abs(pos.positionAmt);
      if (currentAmt <= 0) continue;

      activeSymbols.add(symbol);

      // Posisi manual pengguna (tidak dibuka Client) tidak disentuh sama sekali
      const owned = getOwnedPosition(environment, symbol);
      if (!owned) continue;

      const key = `${environment}:${symbol}`;
      let tracked = monitoredPositions.get(key);
      if (!tracked) {
        tracked = {
          symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          initialQty: Math.max(currentAmt, owned.quantity),
          bepMoved: false,
          // Waktu entry dari daftar persisten: stagnation tetap benar setelah Client restart
          openedAt: owned.openedAt,
          lastCheckedAt: Date.now(),
        };
        monitoredPositions.set(key, tracked);
      } else {
        // Update initialQty jika posisi baru saja ditambah
        if (currentAmt > tracked.initialQty) {
          tracked.initialQty = currentAmt;
        }
      }

      // Evaluasi Stagnation Cutoff: Jika posisi macet >= stagnationHours dan belum TP1 / BEP
      if (stagnationEnabled && !tracked.bepMoved) {
        const holdingMs = Date.now() - tracked.openedAt;
        if (holdingMs >= stagnationMs) {
          const holdingHours = (holdingMs / (60 * 60 * 1000)).toFixed(1);
          addAppLog(
            "WARN",
            "BinanceMonitor",
            `[Stagnation Cutoff] Position ${symbol} has been open for ${holdingHours}h without reaching TP1 (limit: ${stagnationHours}h). Closing position at market...`,
          );

          try {
            await closePositionDirect(apiKey, apiSecret, symbol, isTestnet);
            await cancelAllOpenOrders(apiKey, apiSecret, symbol, isTestnet);
            monitoredPositions.delete(key);
            releaseOwnedPosition(environment, symbol);
            continue;
          } catch (err: any) {
            addAppLog(
              "ERROR",
              "BinanceMonitor",
              `[Stagnation Cutoff Failed] Could not close ${symbol}: ${err?.message}`,
            );
          }
        }
      }

      // Evaluasi Auto-BEP: jika belum dipindah ke BEP
      if (autoBepEnabled && !tracked.bepMoved) {
        // TP1 terisi hanya bila posisi benar-benar berkurang, ATAU harga mark sudah melewati harga TP1 dan
        // order TP1 sudah tidak ada. (Aturan lama "harga +1% & LIMIT <= 1" memindah SL sebelum TP1 tersentuh
        // ketika sejak awal hanya ada 1 order LIMIT.)
        const tp1 = owned.tp1 ?? null;
        const side = pos.side as "LONG" | "SHORT";
        const crossed =
          tp1 && pos.markPrice > 0
            ? side === "SHORT"
              ? pos.markPrice <= tp1
              : pos.markPrice >= tp1
            : false;
        let openExitLimitPrices: number[] | null = [];
        if (!isQtyReduced(tracked.initialQty, currentAmt) && crossed) {
          try {
            const openOrders = await getOpenOrders(
              apiKey,
              apiSecret,
              symbol,
              isTestnet,
            );
            openExitLimitPrices = openOrders
              .filter(
                (o) =>
                  o.type === "LIMIT" &&
                  (side === "LONG" ? o.side === "SELL" : o.side === "BUY"),
              )
              .map((o) => Number(o.price));
          } catch {
            openExitLimitPrices = null;
          }
        }
        const tp1Filled = isTp1Filled({
          side,
          initialQty: tracked.initialQty,
          currentQty: currentAmt,
          markPrice: pos.markPrice,
          tp1,
          openExitLimitPrices,
        });

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

    // Evaluasi Clean-up: posisi MILIK CLIENT yang sudah tidak ada (CLOSED) → batalkan sisa order-nya
    for (const owned of listOwnedPositions(environment)) {
      const symbol = owned.symbol;
      if (activeSymbols.has(symbol)) continue;
      addAppLog(
        "INFO",
        "BinanceMonitor",
        `[Clean-up] Position ${symbol} is now CLOSED. Cancelling all leftover open orders...`,
      );

      await cancelAllOpenOrders(apiKey, apiSecret, symbol, isTestnet);
      monitoredPositions.delete(`${environment}:${symbol}`);
      releaseOwnedPosition(environment, symbol);
      clearBreakEvenState(environment, symbol);
    }
  } catch (err: any) {
    const isBan = /banned until/i.test(err.message);
    logThrottled(
      `binance-monitor-err-${environment}`,
      "WARN",
      "BinanceMonitor",
      `Error in Binance position monitor cycle (${environment}): ${err.message}`,
      isBan ? 300_000 : 30_000,
    );
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
