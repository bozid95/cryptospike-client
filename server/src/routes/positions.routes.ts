import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { getAccountAndPositions, closePositionDirect } from "../lib/binance";
import { getTokocryptoBalance, getTokocryptoTicker } from "../lib/tokocrypto";
import { closeSpotTradeManually } from "../services/spot-monitor.service";
import { addAppLog } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";

export const positionsRouter = Router();

// 1. Ambil Akun & Posisi Terbuka (Multi-Exchange: Binance Futures atau Tokocrypto Spot)
positionsRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const [appConfig, binanceConfig, tokocryptoConfig] = await Promise.all([
      prisma.appConfig.findUnique({ where: { id: 1 } }),
      prisma.binanceConfig.findUnique({ where: { id: 1 } }),
      prisma.tokocryptoConfig.findUnique({ where: { id: 1 } }),
    ]);
    const requestedExchange = (req.query.exchange as string)?.toUpperCase();
    const targetExchange =
      requestedExchange === "BINANCE" || requestedExchange === "TOKOCRYPTO"
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

          const unRealizedProfit =
            (markPrice - trade.entryPrice) * trade.quantity;
          const roiPct =
            trade.entryPrice > 0
              ? ((markPrice - trade.entryPrice) / trade.entryPrice) * 100
              : 0;
          const notionalValue = trade.quantity * markPrice;

          totalUnrealizedProfit += unRealizedProfit;

          return {
            id: trade.id,
            symbol: trade.symbol,
            side: "LONG" as const,
            entryPrice: trade.entryPrice,
            markPrice,
            positionAmt: trade.quantity,
            leverage: 1,
            unRealizedProfit,
            liquidationPrice: 0,
            isolatedMargin: trade.quantity * trade.entryPrice,
            notionalValue,
            roiPct,
            distanceToLiqPct: 0,
            marginType: "SPOT",
            tpPrice: trade.tpPrice,
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

    // JALUR 2: BINANCE FUTURES (Default)
    if (!binanceConfig?.apiKey || !binanceConfig?.apiSecret) {
      return res.json({
        success: true,
        exchange: "BINANCE",
        account: null,
        positions: [],
      });
    }

    const { account, positions } = await getAccountAndPositions(
      binanceConfig.apiKey.trim(),
      binanceConfig.apiSecret.trim(),
      binanceConfig.environment || "TESTNET",
    );

    res.json({
      success: true,
      exchange: "BINANCE",
      account,
      positions,
      environment: binanceConfig.environment || "TESTNET",
    });
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

      // JALUR 2: Close Posisi Binance Futures
      if (!symbol) {
        return res
          .status(400)
          .json({ success: false, message: "Symbol wajib diisi." });
      }

      if (!binanceConfig?.apiKey || !binanceConfig?.apiSecret) {
        return res.status(400).json({
          success: false,
          message: "Binance API Key is not configured.",
        });
      }

      addAppLog(
        "INFO",
        "ManualAction",
        `Closing manual Binance position for ${symbol}...`,
      );
      const isTestnet = binanceConfig.environment === "TESTNET";
      const result = await closePositionDirect(
        binanceConfig.apiKey.trim(),
        binanceConfig.apiSecret.trim(),
        symbol.trim(),
        isTestnet,
      );

      addAppLog(
        "SUCCESS",
        "ManualAction",
        `Position ${symbol} closed successfully!`,
      );
      res.json({
        success: true,
        message: `Position ${symbol} closed successfully!`,
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

      // JALUR 2: Close All Binance Futures
      if (!binanceConfig?.apiKey || !binanceConfig?.apiSecret) {
        return res.status(400).json({
          success: false,
          message: "Binance API Key is not configured.",
        });
      }

      const isTestnet = binanceConfig.environment === "TESTNET";
      const apiKey = binanceConfig.apiKey.trim();
      const apiSecret = binanceConfig.apiSecret.trim();

      const { positions } = await getAccountAndPositions(
        apiKey,
        apiSecret,
        binanceConfig.environment || "TESTNET",
      );

      if (positions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No active positions to close.",
        });
      }

      addAppLog(
        "INFO",
        "ManualAction",
        `Initiating Close All for ${positions.length} positions...`,
      );

      const results = await Promise.allSettled(
        positions.map((pos) =>
          closePositionDirect(apiKey, apiSecret, pos.symbol, isTestnet),
        ),
      );

      const successCount = results.filter(
        (r) => r.status === "fulfilled",
      ).length;
      const failCount = results.length - successCount;

      addAppLog(
        "SUCCESS",
        "ManualAction",
        `Close All Completed. Success: ${successCount}, Failed: ${failCount}`,
      );

      res.json({
        success: true,
        message: `Successfully closed ${successCount} positions. ${failCount > 0 ? `Failed to close ${failCount} positions.` : ""}`,
      });
    } catch (err: any) {
      addAppLog("ERROR", "ManualAction", `Failed to Close All: ${err.message}`);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);
