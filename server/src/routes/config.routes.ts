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
    const [appConfig, binanceConfig, tokocryptoConfig] = await Promise.all([
      prisma.appConfig.findUnique({ where: { id: 1 } }),
      prisma.binanceConfig.findUnique({ where: { id: 1 } }),
      prisma.tokocryptoConfig.findUnique({ where: { id: 1 } }),
    ]);

    const targetExchange = (
      appConfig?.targetExchange || "BINANCE"
    ).toUpperCase();
    const clientToken = appConfig?.clientToken || "";

    const binanceAuto = Boolean(binanceConfig?.autoExecute);
    const tokocryptoAuto = Boolean(tokocryptoConfig?.autoExecute);
    const tokocryptoDry = Boolean(tokocryptoConfig?.dryRun);

    const mergedData = {
      targetExchange,
      clientToken,
      // Binance Dedicated Fields
      binanceApiKey: binanceConfig?.apiKey || "",
      binanceApiSecret: binanceConfig?.apiSecret || "",
      environment: binanceConfig?.environment || "TESTNET",
      binanceAutoExecute: binanceAuto,
      leverage: binanceConfig?.leverage || 10,
      marginType: binanceConfig?.marginType || "ISOLATED",
      binanceRiskPerTradePct: binanceConfig?.riskPerTradePct ?? 2.0,
      binanceMaxOpenPositions: binanceConfig?.maxOpenPositions ?? 3,
      binanceCoinFilterMode: binanceConfig?.coinFilterMode || "ALL",
      binanceTargetCoins: binanceConfig?.targetCoins || "",
      // Tokocrypto Dedicated Fields
      tokocryptoApiKey: tokocryptoConfig?.apiKey || "",
      tokocryptoApiSecret: tokocryptoConfig?.apiSecret || "",
      tokocryptoQuoteAsset: tokocryptoConfig?.quoteAsset || "USDT",
      tokocryptoAutoExecute: tokocryptoAuto,
      tokocryptoDryRun: tokocryptoDry,
      tokocryptoRiskPerTradePct: tokocryptoConfig?.riskPerTradePct ?? 10.0,
      tokocryptoMaxOpenPositions: tokocryptoConfig?.maxOpenPositions ?? 5,
      tokocryptoCoinFilterMode: tokocryptoConfig?.coinFilterMode || "ALL",
      tokocryptoTargetCoins: tokocryptoConfig?.targetCoins || "",
      // Legacy Fallbacks
      autoExecute: binanceAuto,
      dryRun: tokocryptoDry,
      riskPerTradePct: binanceConfig?.riskPerTradePct ?? 2.0,
      maxOpenPositions: binanceConfig?.maxOpenPositions ?? 3,
      coinFilterMode: binanceConfig?.coinFilterMode || "ALL",
      targetCoins: binanceConfig?.targetCoins || "",
      // Clean Nested Models
      app: appConfig,
      binance: binanceConfig,
      tokocrypto: tokocryptoConfig,
    };

    res.json({
      success: true,
      data: mergedData,
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

    // 1. Simpan ke AppConfig (Global Lisensi & Routing)
    const appUpdate: any = {};
    if (targetExchange !== undefined) {
      const ex = String(targetExchange).trim().toUpperCase();
      appUpdate.targetExchange =
        ex === "TOKOCRYPTO" || ex === "BOTH" ? ex : "BINANCE";
    }
    if (clientToken !== undefined) {
      appUpdate.clientToken = clientToken ? clientToken.trim() : null;
    }

    const savedApp = await prisma.appConfig.upsert({
      where: { id: 1 },
      update: appUpdate,
      create: {
        id: 1,
        targetExchange: appUpdate.targetExchange || "BINANCE",
        clientToken: appUpdate.clientToken || null,
      },
    });

    // 2. Simpan ke BinanceConfig
    const binanceUpdate: any = {};
    if (binanceApiKey !== undefined)
      binanceUpdate.apiKey = binanceApiKey ? binanceApiKey.trim() : null;
    if (binanceApiSecret !== undefined)
      binanceUpdate.apiSecret = binanceApiSecret
        ? binanceApiSecret.trim()
        : null;
    if (environment !== undefined) binanceUpdate.environment = environment;
    if (marginType !== undefined) binanceUpdate.marginType = marginType;
    if (leverage !== undefined) binanceUpdate.leverage = Number(leverage);

    if (binanceAutoExecute !== undefined) {
      binanceUpdate.autoExecute = Boolean(binanceAutoExecute);
    } else if (autoExecute !== undefined) {
      binanceUpdate.autoExecute = Boolean(autoExecute);
    }

    if (binanceRiskPerTradePct !== undefined) {
      binanceUpdate.riskPerTradePct = Number(binanceRiskPerTradePct);
    } else if (riskPerTradePct !== undefined) {
      binanceUpdate.riskPerTradePct = Number(riskPerTradePct);
    }

    if (binanceMaxOpenPositions !== undefined) {
      binanceUpdate.maxOpenPositions = Number(binanceMaxOpenPositions);
    } else if (maxOpenPositions !== undefined) {
      binanceUpdate.maxOpenPositions = Number(maxOpenPositions);
    }

    if (binanceCoinFilterMode !== undefined) {
      binanceUpdate.coinFilterMode = binanceCoinFilterMode;
    } else if (coinFilterMode !== undefined) {
      binanceUpdate.coinFilterMode = coinFilterMode;
    }

    if (binanceTargetCoins !== undefined) {
      binanceUpdate.targetCoins =
        typeof binanceTargetCoins === "string" ? binanceTargetCoins.trim() : "";
    } else if (targetCoins !== undefined) {
      binanceUpdate.targetCoins =
        typeof targetCoins === "string" ? targetCoins.trim() : "";
    }

    const savedBinance = await prisma.binanceConfig.upsert({
      where: { id: 1 },
      update: binanceUpdate,
      create: {
        id: 1,
        apiKey: binanceUpdate.apiKey || null,
        apiSecret: binanceUpdate.apiSecret || null,
        environment: binanceUpdate.environment || "TESTNET",
        autoExecute: binanceUpdate.autoExecute ?? false,
        marginType: binanceUpdate.marginType || "ISOLATED",
        leverage: binanceUpdate.leverage ?? 10,
        riskPerTradePct: binanceUpdate.riskPerTradePct ?? 2.0,
        maxOpenPositions: binanceUpdate.maxOpenPositions ?? 3,
        coinFilterMode: binanceUpdate.coinFilterMode || "ALL",
        targetCoins: binanceUpdate.targetCoins || "",
      },
    });

    // 3. Simpan ke TokocryptoConfig
    const tokoUpdate: any = {};
    if (tokocryptoApiKey !== undefined)
      tokoUpdate.apiKey = tokocryptoApiKey ? tokocryptoApiKey.trim() : null;
    if (tokocryptoApiSecret !== undefined)
      tokoUpdate.apiSecret = tokocryptoApiSecret
        ? tokocryptoApiSecret.trim()
        : null;
    if (tokocryptoQuoteAsset !== undefined)
      tokoUpdate.quoteAsset = tokocryptoQuoteAsset || "USDT";

    if (tokocryptoAutoExecute !== undefined) {
      tokoUpdate.autoExecute = Boolean(tokocryptoAutoExecute);
    }
    if (tokocryptoDryRun !== undefined) {
      tokoUpdate.dryRun = Boolean(tokocryptoDryRun);
    } else if (dryRun !== undefined) {
      tokoUpdate.dryRun = Boolean(dryRun);
    }

    if (tokocryptoRiskPerTradePct !== undefined) {
      tokoUpdate.riskPerTradePct = Number(tokocryptoRiskPerTradePct);
    }
    if (tokocryptoMaxOpenPositions !== undefined) {
      tokoUpdate.maxOpenPositions = Number(tokocryptoMaxOpenPositions);
    }
    if (tokocryptoCoinFilterMode !== undefined) {
      tokoUpdate.coinFilterMode = tokocryptoCoinFilterMode;
    }
    if (tokocryptoTargetCoins !== undefined) {
      tokoUpdate.targetCoins =
        typeof tokocryptoTargetCoins === "string"
          ? tokocryptoTargetCoins.trim()
          : "";
    }

    const savedToko = await prisma.tokocryptoConfig.upsert({
      where: { id: 1 },
      update: tokoUpdate,
      create: {
        id: 1,
        apiKey: tokoUpdate.apiKey || null,
        apiSecret: tokoUpdate.apiSecret || null,
        quoteAsset: tokoUpdate.quoteAsset || "USDT",
        autoExecute: tokoUpdate.autoExecute ?? false,
        dryRun: tokoUpdate.dryRun ?? false,
        riskPerTradePct: tokoUpdate.riskPerTradePct ?? 10.0,
        maxOpenPositions: tokoUpdate.maxOpenPositions ?? 5,
        coinFilterMode: tokoUpdate.coinFilterMode || "ALL",
        targetCoins: tokoUpdate.targetCoins || "",
      },
    });

    // Otomatis Reconnect WebSocket jika ada token di konfigurasi
    if (savedApp.clientToken) {
      connectToNestJS(savedApp.clientToken);
    }

    const mergedSaved = {
      targetExchange: savedApp.targetExchange,
      clientToken: savedApp.clientToken || "",
      // Binance
      binanceApiKey: savedBinance.apiKey || "",
      binanceApiSecret: savedBinance.apiSecret || "",
      environment: savedBinance.environment || "TESTNET",
      binanceAutoExecute: Boolean(savedBinance.autoExecute),
      leverage: savedBinance.leverage || 10,
      marginType: savedBinance.marginType || "ISOLATED",
      binanceRiskPerTradePct: savedBinance.riskPerTradePct ?? 2.0,
      binanceMaxOpenPositions: savedBinance.maxOpenPositions ?? 3,
      binanceCoinFilterMode: savedBinance.coinFilterMode || "ALL",
      binanceTargetCoins: savedBinance.targetCoins || "",
      // Tokocrypto
      tokocryptoApiKey: savedToko.apiKey || "",
      tokocryptoApiSecret: savedToko.apiSecret || "",
      tokocryptoQuoteAsset: savedToko.quoteAsset || "USDT",
      tokocryptoAutoExecute: Boolean(savedToko.autoExecute),
      tokocryptoDryRun: Boolean(savedToko.dryRun),
      tokocryptoRiskPerTradePct: savedToko.riskPerTradePct ?? 10.0,
      tokocryptoMaxOpenPositions: savedToko.maxOpenPositions ?? 5,
      tokocryptoCoinFilterMode: savedToko.coinFilterMode || "ALL",
      tokocryptoTargetCoins: savedToko.targetCoins || "",
      // Legacy fallbacks
      autoExecute: Boolean(savedBinance.autoExecute),
      dryRun: Boolean(savedToko.dryRun),
      riskPerTradePct: savedBinance.riskPerTradePct ?? 2.0,
      maxOpenPositions: savedBinance.maxOpenPositions ?? 3,
      coinFilterMode: savedBinance.coinFilterMode || "ALL",
      targetCoins: savedBinance.targetCoins || "",
      // Nested models
      app: savedApp,
      binance: savedBinance,
      tokocrypto: savedToko,
    };

    res.json({
      success: true,
      message: "Konfigurasi berhasil disimpan dan bot diperbarui!",
      data: mergedSaved,
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
