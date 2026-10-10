import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { getAccountAndPositions, closePositionDirect } from "../lib/binance";
import { addAppLog } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";

export const positionsRouter = Router();

// 1. Ambil Akun & Posisi Terbuka Binance Futures
positionsRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config?.binanceApiKey || !config?.binanceApiSecret) {
      return res.json({ success: true, account: null, positions: [] });
    }

    const { account, positions } = await getAccountAndPositions(
      config.binanceApiKey.trim(),
      config.binanceApiSecret.trim(),
      config.environment || "TESTNET",
    );

    res.json({
      success: true,
      account,
      positions,
      environment: config.environment || "TESTNET",
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

// 2. Tutup Posisi Terbuka Secara Manual
positionsRouter.post(
  "/close",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { symbol } = req.body;
      if (!symbol) {
        return res
          .status(400)
          .json({ success: false, message: "Symbol wajib diisi." });
      }

      const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
      if (!config?.binanceApiKey || !config?.binanceApiSecret) {
        return res.status(400).json({
          success: false,
          message: "API Key Binance belum dikonfigurasi.",
        });
      }

      addAppLog(
        "INFO",
        "ManualAction",
        `Menutup posisi manual untuk ${symbol}...`,
      );
      const isTestnet = config.environment === "TESTNET";
      const result = await closePositionDirect(
        config.binanceApiKey.trim(),
        config.binanceApiSecret.trim(),
        symbol.trim(),
        isTestnet,
      );

      addAppLog(
        "SUCCESS",
        "ManualAction",
        `Posisi ${symbol} berhasil ditutup!`,
      );
      res.json({
        success: true,
        message: `Posisi ${symbol} berhasil ditutup!`,
        result,
      });
    } catch (err: any) {
      addAppLog(
        "ERROR",
        "ManualAction",
        `Gagal menutup posisi ${req.body.symbol}: ${err.message}`,
      );
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// 3. Tutup Semua Posisi Terbuka (Close All) Secara Manual
positionsRouter.post(
  "/close-all",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
      if (!config?.binanceApiKey || !config?.binanceApiSecret) {
        return res.status(400).json({
          success: false,
          message: "API Key Binance belum dikonfigurasi.",
        });
      }

      const isTestnet = config.environment === "TESTNET";
      const apiKey = config.binanceApiKey.trim();
      const apiSecret = config.binanceApiSecret.trim();

      const { positions } = await getAccountAndPositions(
        apiKey,
        apiSecret,
        config.environment || "TESTNET",
      );

      if (positions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Tidak ada posisi aktif untuk ditutup.",
        });
      }

      addAppLog(
        "INFO",
        "ManualAction",
        `Memulai proses penutupan SEMUA posisi (${positions.length} posisi)...`,
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
        `Close All Selesai. Sukses: ${successCount}, Gagal: ${failCount}`,
      );

      res.json({
        success: true,
        message: `Berhasil menutup ${successCount} posisi. ${failCount > 0 ? `Gagal menutup ${failCount} posisi.` : ""}`,
      });
    } catch (err: any) {
      addAppLog(
        "ERROR",
        "ManualAction",
        `Gagal melakukan Close All: ${err.message}`,
      );
      res.status(500).json({ success: false, message: err.message });
    }
  },
);
