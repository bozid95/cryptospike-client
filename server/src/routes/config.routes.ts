import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { testBinanceConnection } from "../lib/binance";
import { requireAuth } from "../middlewares/auth";
import { connectToNestJS } from "../services/socket.service";

export const configRouter = Router();

// 1. Ambil Konfigurasi dari Database SQLite Lokal
configRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
    });

    // Explicitly cast to boolean to fix SQLite 1/0 returning as numbers to frontend
    if (config) {
      config.autoExecute =
        (config.autoExecute as unknown) === 1 || config.autoExecute === true;
    }

    res.json({
      success: true,
      data: config || {
        clientToken: "",
        binanceApiKey: "",
        binanceApiSecret: "",
        environment: "TESTNET",
        autoExecute: false,
        marginType: "ISOLATED",
        leverage: 10,
        riskPerTradePct: 2.0,
        maxOpenPositions: 3,
        coinFilterMode: "ALL",
        targetCoins: "",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Simpan Konfigurasi & Otomatis Reconnect Bot
configRouter.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      clientToken,
      binanceApiKey,
      binanceApiSecret,
      environment,
      autoExecute,
      marginType,
      leverage,
      riskPerTradePct,
      maxOpenPositions,
      coinFilterMode,
      targetCoins,
    } = req.body;

    const saved = await prisma.appConfig.upsert({
      where: { id: 1 },
      update: {
        clientToken: clientToken ? clientToken.trim() : null,
        binanceApiKey: binanceApiKey ? binanceApiKey.trim() : null,
        binanceApiSecret: binanceApiSecret ? binanceApiSecret.trim() : null,
        environment: environment || "TESTNET",
        autoExecute: autoExecute ?? false,
        marginType: marginType || "ISOLATED",
        leverage: leverage ? Number(leverage) : 10,
        riskPerTradePct: riskPerTradePct ? Number(riskPerTradePct) : 2.0,
        maxOpenPositions: maxOpenPositions ? Number(maxOpenPositions) : 3,
        coinFilterMode: coinFilterMode || "ALL",
        targetCoins: typeof targetCoins === "string" ? targetCoins.trim() : "",
      },
      create: {
        id: 1,
        clientToken: clientToken ? clientToken.trim() : null,
        binanceApiKey: binanceApiKey ? binanceApiKey.trim() : null,
        binanceApiSecret: binanceApiSecret ? binanceApiSecret.trim() : null,
        environment: environment || "TESTNET",
        autoExecute: autoExecute ?? false,
        marginType: marginType || "ISOLATED",
        leverage: leverage ? Number(leverage) : 10,
        riskPerTradePct: riskPerTradePct ? Number(riskPerTradePct) : 2.0,
        maxOpenPositions: maxOpenPositions ? Number(maxOpenPositions) : 3,
        coinFilterMode: coinFilterMode || "ALL",
        targetCoins: typeof targetCoins === "string" ? targetCoins.trim() : "",
      },
    });

    // Otomatis Reconnect WebSocket jika ada token di konfigurasi
    if (saved.clientToken) {
      connectToNestJS(saved.clientToken);
    }

    res.json({
      success: true,
      message: "Konfigurasi berhasil disimpan dan bot diperbarui!",
      data: saved,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Tes Koneksi Kredensial Binance
configRouter.post("/test-connection", requireAuth, async (req: Request, res: Response) => {
  try {
    const { apiKey, apiSecret, environment } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message:
          "Binance API Key dan API Secret wajib diisi untuk menguji koneksi.",
      });
    }

    const result = await testBinanceConnection(
      apiKey.trim(),
      apiSecret.trim(),
      environment || "TESTNET",
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Gagal menguji koneksi.",
    });
  }
});
