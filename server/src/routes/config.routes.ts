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
      config.binanceAutoExecute =
        (config.binanceAutoExecute as unknown) === 1 ||
        config.binanceAutoExecute === true;
      config.tokocryptoAutoExecute =
        (config.tokocryptoAutoExecute as unknown) === 1 ||
        config.tokocryptoAutoExecute === true;
      config.tokocryptoDryRun =
        (config.tokocryptoDryRun as unknown) === 1 ||
        config.tokocryptoDryRun === true;
    }

    res.json({
      success: true,
      data: config || {
        targetExchange: "BINANCE",
        clientToken: "",
        binanceApiKey: "",
        binanceApiSecret: "",
        environment: "TESTNET",
        binanceAutoExecute: false,
        leverage: 10,
        marginType: "ISOLATED",
        binanceRiskPerTradePct: 2.0,
        binanceMaxOpenPositions: 3,
        binanceCoinFilterMode: "ALL",
        binanceTargetCoins: "",
        tokocryptoApiKey: "",
        tokocryptoApiSecret: "",
        tokocryptoQuoteAsset: "USDT",
        tokocryptoAutoExecute: false,
        tokocryptoDryRun: false,
        tokocryptoRiskPerTradePct: 10.0,
        tokocryptoMaxOpenPositions: 5,
        tokocryptoCoinFilterMode: "ALL",
        tokocryptoTargetCoins: "",
        autoExecute: false,
        dryRun: false,
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
      // Binance
      binanceApiKey,
      binanceApiSecret,
      environment,
      binanceAutoExecute,
      marginType,
      leverage,
      binanceRiskPerTradePct,
      binanceMaxOpenPositions,
      binanceCoinFilterMode,
      binanceTargetCoins,
      // Tokocrypto
      tokocryptoApiKey,
      tokocryptoApiSecret,
      tokocryptoQuoteAsset,
      tokocryptoAutoExecute,
      tokocryptoDryRun,
      tokocryptoRiskPerTradePct,
      tokocryptoMaxOpenPositions,
      tokocryptoCoinFilterMode,
      tokocryptoTargetCoins,
      // Legacy fallbacks
      autoExecute,
      dryRun,
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

    // --- Binance Fields ---
    if (binanceApiKey !== undefined)
      updateData.binanceApiKey = binanceApiKey ? binanceApiKey.trim() : null;
    if (binanceApiSecret !== undefined)
      updateData.binanceApiSecret = binanceApiSecret
        ? binanceApiSecret.trim()
        : null;
    if (environment !== undefined) updateData.environment = environment;
    if (marginType !== undefined) updateData.marginType = marginType;
    if (leverage !== undefined) updateData.leverage = Number(leverage);

    if (binanceAutoExecute !== undefined) {
      updateData.binanceAutoExecute = binanceAutoExecute;
      updateData.autoExecute = binanceAutoExecute;
    } else if (autoExecute !== undefined) {
      updateData.binanceAutoExecute = autoExecute;
      updateData.autoExecute = autoExecute;
    }

    if (binanceRiskPerTradePct !== undefined) {
      updateData.binanceRiskPerTradePct = Number(binanceRiskPerTradePct);
      updateData.riskPerTradePct = Number(binanceRiskPerTradePct);
    } else if (riskPerTradePct !== undefined) {
      updateData.binanceRiskPerTradePct = Number(riskPerTradePct);
      updateData.riskPerTradePct = Number(riskPerTradePct);
    }

    if (binanceMaxOpenPositions !== undefined) {
      updateData.binanceMaxOpenPositions = Number(binanceMaxOpenPositions);
      updateData.maxOpenPositions = Number(binanceMaxOpenPositions);
    } else if (maxOpenPositions !== undefined) {
      updateData.binanceMaxOpenPositions = Number(maxOpenPositions);
      updateData.maxOpenPositions = Number(maxOpenPositions);
    }

    if (binanceCoinFilterMode !== undefined) {
      updateData.binanceCoinFilterMode = binanceCoinFilterMode;
      updateData.coinFilterMode = binanceCoinFilterMode;
    } else if (coinFilterMode !== undefined) {
      updateData.binanceCoinFilterMode = coinFilterMode;
      updateData.coinFilterMode = coinFilterMode;
    }

    if (binanceTargetCoins !== undefined) {
      updateData.binanceTargetCoins =
        typeof binanceTargetCoins === "string" ? binanceTargetCoins.trim() : "";
      updateData.targetCoins = updateData.binanceTargetCoins;
    } else if (targetCoins !== undefined) {
      updateData.binanceTargetCoins =
        typeof targetCoins === "string" ? targetCoins.trim() : "";
      updateData.targetCoins = updateData.binanceTargetCoins;
    }

    // --- Tokocrypto Fields ---
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

    if (tokocryptoAutoExecute !== undefined) {
      updateData.tokocryptoAutoExecute = tokocryptoAutoExecute;
    }
    if (tokocryptoDryRun !== undefined) {
      updateData.tokocryptoDryRun = tokocryptoDryRun;
      updateData.dryRun = tokocryptoDryRun;
    } else if (dryRun !== undefined) {
      updateData.tokocryptoDryRun = dryRun;
      updateData.dryRun = dryRun;
    }
    if (tokocryptoRiskPerTradePct !== undefined) {
      updateData.tokocryptoRiskPerTradePct = Number(tokocryptoRiskPerTradePct);
    }
    if (tokocryptoMaxOpenPositions !== undefined) {
      updateData.tokocryptoMaxOpenPositions = Number(
        tokocryptoMaxOpenPositions,
      );
    }
    if (tokocryptoCoinFilterMode !== undefined) {
      updateData.tokocryptoCoinFilterMode = tokocryptoCoinFilterMode;
    }
    if (tokocryptoTargetCoins !== undefined) {
      updateData.tokocryptoTargetCoins =
        typeof tokocryptoTargetCoins === "string"
          ? tokocryptoTargetCoins.trim()
          : "";
    }

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
        binanceAutoExecute: binanceAutoExecute ?? autoExecute ?? false,
        leverage: leverage ? Number(leverage) : 10,
        marginType: marginType || "ISOLATED",
        binanceRiskPerTradePct: binanceRiskPerTradePct
          ? Number(binanceRiskPerTradePct)
          : 2.0,
        binanceMaxOpenPositions: binanceMaxOpenPositions
          ? Number(binanceMaxOpenPositions)
          : 3,
        binanceCoinFilterMode: binanceCoinFilterMode || coinFilterMode || "ALL",
        binanceTargetCoins:
          typeof binanceTargetCoins === "string"
            ? binanceTargetCoins.trim()
            : "",
        tokocryptoApiKey: tokocryptoApiKey ? tokocryptoApiKey.trim() : null,
        tokocryptoApiSecret: tokocryptoApiSecret
          ? tokocryptoApiSecret.trim()
          : null,
        tokocryptoQuoteAsset: tokocryptoQuoteAsset || "USDT",
        tokocryptoAutoExecute: tokocryptoAutoExecute ?? false,
        tokocryptoDryRun: tokocryptoDryRun ?? dryRun ?? false,
        tokocryptoRiskPerTradePct: tokocryptoRiskPerTradePct
          ? Number(tokocryptoRiskPerTradePct)
          : 10.0,
        tokocryptoMaxOpenPositions: tokocryptoMaxOpenPositions
          ? Number(tokocryptoMaxOpenPositions)
          : 5,
        tokocryptoCoinFilterMode: tokocryptoCoinFilterMode || "ALL",
        tokocryptoTargetCoins:
          typeof tokocryptoTargetCoins === "string"
            ? tokocryptoTargetCoins.trim()
            : "",
        autoExecute: autoExecute ?? false,
        dryRun: dryRun ?? false,
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
