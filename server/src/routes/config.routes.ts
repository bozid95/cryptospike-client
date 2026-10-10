import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { testBinanceConnection } from "../lib/binance";
import { testTokocryptoConnection } from "../lib/tokocrypto";
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
      config.dryRun =
        (config.dryRun as unknown) === 1 || config.dryRun === true;
    }

    res.json({
      success: true,
      data: config || {
        targetExchange: "BINANCE",
        clientToken: "",
        binanceApiKey: "",
        binanceApiSecret: "",
        environment: "TESTNET",
        tokocryptoApiKey: "",
        tokocryptoApiSecret: "",
        tokocryptoQuoteAsset: "USDT",
        autoExecute: false,
        dryRun: false,
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
      targetExchange,
      clientToken,
      binanceApiKey,
      binanceApiSecret,
      environment,
      tokocryptoApiKey,
      tokocryptoApiSecret,
      tokocryptoQuoteAsset,
      autoExecute,
      dryRun,
      marginType,
      leverage,
      riskPerTradePct,
      maxOpenPositions,
      coinFilterMode,
      targetCoins,
    } = req.body;

    const updateData: Record<string, any> = {};
    if (targetExchange !== undefined) {
      const ex = String(targetExchange).trim().toUpperCase();
      updateData.targetExchange =
        ex === "TOKOCRYPTO" || ex === "BOTH" ? ex : "BINANCE";
    }
    if (clientToken !== undefined)
      updateData.clientToken = clientToken ? clientToken.trim() : null;
    if (binanceApiKey !== undefined)
      updateData.binanceApiKey = binanceApiKey ? binanceApiKey.trim() : null;
    if (binanceApiSecret !== undefined)
      updateData.binanceApiSecret = binanceApiSecret
        ? binanceApiSecret.trim()
        : null;
    if (environment !== undefined) updateData.environment = environment;

    if (tokocryptoApiKey !== undefined)
      updateData.tokocryptoApiKey = tokocryptoApiKey
        ? tokocryptoApiKey.trim()
        : null;
    if (tokocryptoApiSecret !== undefined)
      updateData.tokocryptoApiSecret = tokocryptoApiSecret
        ? tokocryptoApiSecret.trim()
        : null;
    if (tokocryptoQuoteAsset !== undefined)
      updateData.tokocryptoQuoteAsset = tokocryptoQuoteAsset || "USDT";

    if (autoExecute !== undefined) updateData.autoExecute = autoExecute;
    if (dryRun !== undefined) updateData.dryRun = dryRun;
    if (marginType !== undefined) updateData.marginType = marginType;
    if (leverage !== undefined) updateData.leverage = Number(leverage);
    if (riskPerTradePct !== undefined)
      updateData.riskPerTradePct = Number(riskPerTradePct);
    if (maxOpenPositions !== undefined)
      updateData.maxOpenPositions = Number(maxOpenPositions);
    if (coinFilterMode !== undefined)
      updateData.coinFilterMode = coinFilterMode;
    if (targetCoins !== undefined)
      updateData.targetCoins =
        typeof targetCoins === "string" ? targetCoins.trim() : "";

    const saved = await prisma.appConfig.upsert({
      where: { id: 1 },
      update: updateData,
      create: {
        id: 1,
        targetExchange: targetExchange || "BINANCE",
        clientToken: clientToken ? clientToken.trim() : null,
        binanceApiKey: binanceApiKey ? binanceApiKey.trim() : null,
        binanceApiSecret: binanceApiSecret ? binanceApiSecret.trim() : null,
        environment: environment || "TESTNET",
        tokocryptoApiKey: tokocryptoApiKey ? tokocryptoApiKey.trim() : null,
        tokocryptoApiSecret: tokocryptoApiSecret
          ? tokocryptoApiSecret.trim()
          : null,
        tokocryptoQuoteAsset: tokocryptoQuoteAsset || "USDT",
        autoExecute: autoExecute ?? false,
        dryRun: dryRun ?? false,
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
configRouter.post(
  "/test-connection",
  requireAuth,
  async (req: Request, res: Response) => {
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
  },
);

// 4. Tes Koneksi Kredensial Tokocrypto
configRouter.post(
  "/test-tokocrypto",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { apiKey, apiSecret, quoteAsset } = req.body;

      if (!apiKey || !apiSecret) {
        return res.status(400).json({
          success: false,
          message:
            "Tokocrypto API Key dan API Secret wajib diisi untuk menguji koneksi.",
        });
      }

      const result = await testTokocryptoConnection(
        apiKey.trim(),
        apiSecret.trim(),
        quoteAsset || "USDT",
      );

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err.message || "Gagal menguji koneksi Tokocrypto.",
      });
    }
  },
);
