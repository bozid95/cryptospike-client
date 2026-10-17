import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { getAccountAndPositions, closePositionDirect } from "../lib/binance";
import { getTokocryptoBalance, getTokocryptoTicker } from "../lib/tokocrypto";
import { closeSpotTradeManually } from "../services/spot-monitor.service";
import {
  isBinanceWsConnected,
  getLiveBinanceAccount,
  getLiveBinancePositions,
  getLiveCacheLastUpdated,
} from "../services/binance-ws.service";
import { addAppLog } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";

// Cache jangka pendek untuk fallback REST per environment agar tidak spam bursa
const lastRestPositionsFetch: Record<"TESTNET" | "LIVE", number> = {
  TESTNET: 0,
  LIVE: 0,
};
const lastRestPositionsData: Record<
  "TESTNET" | "LIVE",
  { account: any; positions: any[] } | null
> = {
  TESTNET: null,
  LIVE: null,
};

export const positionsRouter = Router();

// 1. Ambil Akun & Posisi Terbuka (Multi-Exchange: Binance Live, Binance Testnet, Tokocrypto Spot)
positionsRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const [appConfig, binanceConfig, tokocryptoConfig] = await Promise.all([
      prisma.appConfig.findUnique({ where: { id: 1 } }),
      prisma.binanceConfig.findUnique({ where: { id: 1 } }),
      prisma.tokocryptoConfig.findUnique({ where: { id: 1 } }),
    ]);
    const requestedExchange = (req.query.exchange as string)?.toUpperCase();
    const targetExchange =
      requestedExchange === "BINANCE_TESTNET" ||
      requestedExchange === "BINANCE_LIVE" ||
      requestedExchange === "BINANCE" ||
      requestedExchange === "TOKOCRYPTO"
        ? requestedExchange
        : (appConfig?.targetExchange || "BINANCE").toUpperCase();

    // JALUR 1: TOKOCRYPTO SPOT
    if (targetExchange === "TOKOCRYPTO") {
      const openTrades = await prisma.spotTrade.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
      });

      let totalWalletBalance = 0;
      const quoteAsset = tokocryptoConfig?.quoteAsset || "USDT";

      // Coba ambil saldo kas langsung dari Tokocrypto jika API key tersedia
      if (tokocryptoConfig?.apiKey && tokocryptoConfig?.apiSecret) {
        try {
          const bal = await getTokocryptoBalance(
            tokocryptoConfig.apiKey.trim(),
            tokocryptoConfig.apiSecret.trim(),
            quoteAsset,
          );
          totalWalletBalance = bal.free;
        } catch {}
      }

      // Ambil harga live untuk setiap posisi spot terbuka
      let totalUnrealizedProfit = 0;
      const mappedPositions = await Promise.all(
        openTrades.map(async (trade) => {
          let markPrice = trade.entryPrice;
          try {
            const ticker = await getTokocryptoTicker(trade.symbol);
            if (ticker.lastPrice > 0) {
              markPrice = ticker.lastPrice;
            }
          } catch {}

          const activeQty = trade.remainingQty ?? trade.quantity;
          const unRealizedProfit =
            (markPrice - trade.entryPrice) * activeQty +
            (trade.realizedPnl || 0);
          const roiPct =
            trade.entryPrice > 0
              ? ((markPrice - trade.entryPrice) / trade.entryPrice) * 100
              : 0;
          const notionalValue = activeQty * markPrice;

          totalUnrealizedProfit += unRealizedProfit;

          const activeTpPrice =
            trade.tpStage === 0
              ? trade.tp1Price || trade.tpPrice
              : trade.tpStage === 1
                ? trade.tp2Price || trade.tpPrice
                : trade.tp3Price || trade.tpPrice;

          return {
            id: trade.id,
            symbol: trade.symbol,
            side: "LONG" as const,
            entryPrice: trade.entryPrice,
            markPrice,
            positionAmt: activeQty,
            totalQty: trade.quantity,
            remainingQty: activeQty,
            tpStage: trade.tpStage,
            realizedPnl: trade.realizedPnl || 0,
            leverage: 1,
            unRealizedProfit,
            liquidationPrice: 0,
            isolatedMargin: activeQty * trade.entryPrice,
            notionalValue,
            roiPct,
            distanceToLiqPct: 0,
            marginType: "SPOT",
            tpPrice: activeTpPrice,
            tp1Price: trade.tp1Price,
            tp2Price: trade.tp2Price,
            tp3Price: trade.tp3Price,
            slPrice: trade.slPrice,
            status: trade.status,
            createdAt: trade.createdAt,
            isDryRun: trade.buyOrderId.startsWith("SIM-"),
          };
        }),
      );

      return res.json({
        success: true,
        exchange: "TOKOCRYPTO",
        account: {
          totalWalletBalance,
          totalUnrealizedProfit,
          quoteAsset,
        },
        positions: mappedPositions,
      });
    }

    // JALUR 2: BINANCE FUTURES (TESTNET atau LIVE)
    const isLive =
      targetExchange === "BINANCE_LIVE" ||
      (targetExchange !== "BINANCE_TESTNET" &&
        binanceConfig?.environment === "LIVE");
    const targetEnv: "TESTNET" | "LIVE" = isLive ? "LIVE" : "TESTNET";

    const apiKey = isLive
      ? binanceConfig?.liveApiKey ||
        (binanceConfig?.environment === "LIVE" ? binanceConfig?.apiKey : null)
      : binanceConfig?.testnetApiKey ||
        (binanceConfig?.environment === "TESTNET"
          ? binanceConfig?.apiKey
          : null);

    const apiSecret = isLive
      ? binanceConfig?.liveApiSecret ||
        (binanceConfig?.environment === "LIVE"
          ? binanceConfig?.apiSecret
          : null)
      : binanceConfig?.testnetApiSecret ||
        (binanceConfig?.environment === "TESTNET"
          ? binanceConfig?.apiSecret
          : null);

    const responseExchange =
      targetExchange === "BINANCE_TESTNET"
        ? "BINANCE_TESTNET"
        : targetExchange === "BINANCE_LIVE"
          ? "BINANCE_LIVE"
          : "BINANCE";

    if (!apiKey || !apiSecret) {
      return res.json({
        success: true,
        exchange: responseExchange,
        environment: targetEnv,
        account: null,
        positions: [],
      });
    }

    // 1. Prioritas Utama: Layani langsung dari WebSocket Live Cache jika stream aktif & berisi posisi
    const wsPositions = getLiveBinancePositions(targetEnv);
    if (
      isBinanceWsConnected(targetEnv) &&
      getLiveCacheLastUpdated(targetEnv) > 0 &&
      wsPositions.length > 0
    ) {
      return res.json({
        success: true,
        exchange: responseExchange,
        account: getLiveBinanceAccount(targetEnv),
        positions: wsPositions,
        environment: targetEnv,
        source: "WEBSOCKET_STREAM",
      });
    }

    // 2. Fallback REST dengan Caching 5 Detik per environment
    const now = Date.now();
    if (
      now - lastRestPositionsFetch[targetEnv] < 5000 &&
      lastRestPositionsData[targetEnv]
    ) {
      return res.json({
        success: true,
        exchange: responseExchange,
        account: lastRestPositionsData[targetEnv]!.account,
        positions: lastRestPositionsData[targetEnv]!.positions,
        environment: targetEnv,
        source: "MEMORY_CACHE",
      });
    }

    try {
      const { account, positions } = await getAccountAndPositions(
        apiKey.trim(),
        apiSecret.trim(),
        targetEnv,
      );

      lastRestPositionsFetch[targetEnv] = now;
      lastRestPositionsData[targetEnv] = { account, positions };

      res.json({
        success: true,
        exchange: responseExchange,
        account,
        positions,
        environment: targetEnv,
        source: "REST_API",
      });
    } catch (apiErr: any) {
      // Jika terjadi error pada REST, kembalikan data cache terakhir jika ada
      if (lastRestPositionsData[targetEnv]) {
        return res.json({
          success: true,
          exchange: responseExchange,
          account: lastRestPositionsData[targetEnv]!.account,
          positions: lastRestPositionsData[targetEnv]!.positions,
          environment: targetEnv,
          source: "STALE_CACHE_FALLBACK",
        });
      }
      throw apiErr;
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message,
      account: null,
      positions: [],
    });
  }
});

// 2. Tutup Posisi Terbuka Secara Manual (Sell Now)
positionsRouter.post(
  "/close",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { symbol, tradeId, exchange } = req.body;
      const [appConfig, binanceConfig] = await Promise.all([
        prisma.appConfig.findUnique({ where: { id: 1 } }),
        prisma.binanceConfig.findUnique({ where: { id: 1 } }),
      ]);
      const requestedExchange = (exchange as string)?.toUpperCase();
      const targetExchange =
        requestedExchange ||
        (appConfig?.targetExchange || "BINANCE").toUpperCase();

      // JALUR 1: Close Posisi Spot Tokocrypto
      if (targetExchange === "TOKOCRYPTO" || tradeId) {
        let targetId = tradeId;

        if (!targetId && symbol) {
          const found = await prisma.spotTrade.findFirst({
            where: {
              symbol: { contains: symbol.replace(/[\/\-_]/g, "") },
              status: "OPEN",
            },
            orderBy: { createdAt: "desc" },
          });
          if (found) targetId = found.id;
        }

        if (!targetId) {
          return res.status(400).json({
            success: false,
            message: "ID Posisi Spot tidak ditemukan.",
          });
        }

        const result = await closeSpotTradeManually(targetId);
        if (!result.success) {
          return res.status(400).json(result);
        }

        return res.json(result);
      }

      // JALUR 2: Close Posisi Binance Futures (LIVE atau TESTNET)
      if (!symbol) {
        return res
          .status(400)
          .json({ success: false, message: "Symbol wajib diisi." });
      }

      const isLive =
        targetExchange === "BINANCE_LIVE" ||
        (targetExchange !== "BINANCE_TESTNET" &&
          binanceConfig?.environment === "LIVE");
      const targetEnv = isLive ? "LIVE" : "TESTNET";

      const apiKey = isLive
        ? binanceConfig?.liveApiKey ||
          (binanceConfig?.environment === "LIVE" ? binanceConfig?.apiKey : null)
        : binanceConfig?.testnetApiKey ||
          (binanceConfig?.environment === "TESTNET"
            ? binanceConfig?.apiKey
            : null);

      const apiSecret = isLive
        ? binanceConfig?.liveApiSecret ||
          (binanceConfig?.environment === "LIVE"
            ? binanceConfig?.apiSecret
            : null)
        : binanceConfig?.testnetApiSecret ||
          (binanceConfig?.environment === "TESTNET"
            ? binanceConfig?.apiSecret
            : null);

      if (!apiKey || !apiSecret) {
        return res.status(400).json({
          success: false,
          message: `Binance (${targetEnv}) API Key is not configured.`,
        });
      }

      addAppLog(
        "INFO",
        "ManualAction",
        `Closing manual Binance (${targetEnv}) position for ${symbol}...`,
      );
      const isTestnet = !isLive;
      const result = await closePositionDirect(
        apiKey.trim(),
        apiSecret.trim(),
        symbol.trim(),
        isTestnet,
      );

      addAppLog(
        "SUCCESS",
        "ManualAction",
        `Binance (${targetEnv}) position ${symbol} closed successfully!`,
      );
      res.json({
        success: true,
        message: `Binance (${targetEnv}) position ${symbol} closed successfully!`,
        result,
      });
    } catch (err: any) {
      addAppLog(
        "ERROR",
        "ManualAction",
        `Failed to close position ${req.body.symbol}: ${err.message}`,
      );
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// 3. Ambil Histori Transaksi Posisi Spot Tokocrypto
positionsRouter.get(
  "/spot-history",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const history = await prisma.spotTrade.findMany({
        where: { status: { not: "OPEN" } },
        orderBy: { closedAt: "desc" },
        take: 50,
      });

      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// 4. Tutup Semua Posisi Terbuka (Close All) Secara Manual
positionsRouter.post(
  "/close-all",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const [appConfig, binanceConfig] = await Promise.all([
        prisma.appConfig.findUnique({ where: { id: 1 } }),
        prisma.binanceConfig.findUnique({ where: { id: 1 } }),
      ]);
      const requestedExchange = (
        req.body?.exchange || (req.query.exchange as string)
      )?.toUpperCase();
      const targetExchange =
        requestedExchange ||
        (appConfig?.targetExchange || "BINANCE").toUpperCase();

      // JALUR 1: Close All Tokocrypto Spot
      if (targetExchange === "TOKOCRYPTO") {
        const openTrades = await prisma.spotTrade.findMany({
          where: { status: "OPEN" },
        });

        if (openTrades.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Tidak ada posisi spot aktif untuk ditutup.",
          });
        }

        const results = await Promise.allSettled(
          openTrades.map((t) => closeSpotTradeManually(t.id)),
        );

        const successCount = results.filter(
          (r) => r.status === "fulfilled" && (r.value as any).success,
        ).length;

        return res.json({
          success: true,
          message: `Successfully closed ${successCount} of ${openTrades.length} spot positions.`,
        });
      }

      // JALUR 2: Close All Binance Futures (LIVE atau TESTNET)
      const isLive =
        targetExchange === "BINANCE_LIVE" ||
        (targetExchange !== "BINANCE_TESTNET" &&
          binanceConfig?.environment === "LIVE");
      const targetEnv = isLive ? "LIVE" : "TESTNET";

      const apiKey = isLive
        ? binanceConfig?.liveApiKey ||
          (binanceConfig?.environment === "LIVE" ? binanceConfig?.apiKey : null)
        : binanceConfig?.testnetApiKey ||
          (binanceConfig?.environment === "TESTNET"
            ? binanceConfig?.apiKey
            : null);

      const apiSecret = isLive
        ? binanceConfig?.liveApiSecret ||
          (binanceConfig?.environment === "LIVE"
            ? binanceConfig?.apiSecret
            : null)
        : binanceConfig?.testnetApiSecret ||
          (binanceConfig?.environment === "TESTNET"
            ? binanceConfig?.apiSecret
            : null);

      if (!apiKey || !apiSecret) {
        return res.status(400).json({
          success: false,
          message: `Binance (${targetEnv}) API Key is not configured.`,
        });
      }

      const isTestnet = !isLive;
      const { positions } = await getAccountAndPositions(
        apiKey.trim(),
        apiSecret.trim(),
        targetEnv,
      );

      if (positions.length === 0) {
        return res.status(400).json({
          success: false,
          message: `No active positions to close on Binance (${targetEnv}).`,
        });
      }

      addAppLog(
        "INFO",
        "ManualAction",
        `Initiating Close All on Binance (${targetEnv}) for ${positions.length} positions...`,
      );

      const results = await Promise.allSettled(
        positions.map((pos) =>
          closePositionDirect(
            apiKey.trim(),
            apiSecret.trim(),
            pos.symbol,
            isTestnet,
          ),
        ),
      );

      const successCount = results.filter(
        (r) => r.status === "fulfilled",
      ).length;
      const failCount = results.length - successCount;

      addAppLog(
        "SUCCESS",
        "ManualAction",
        `Close All on Binance (${targetEnv}) Completed. Success: ${successCount}, Failed: ${failCount}`,
      );

      res.json({
        success: true,
        message: `Successfully closed ${successCount} Binance (${targetEnv}) positions. ${failCount > 0 ? `Failed to close ${failCount} positions.` : ""}`,
      });
    } catch (err: any) {
      addAppLog("ERROR", "ManualAction", `Failed to Close All: ${err.message}`);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);
