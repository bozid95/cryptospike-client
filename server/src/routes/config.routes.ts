import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { testBinanceConnection } from "../lib/binance";
import { testTokocryptoConnection } from "../lib/tokocrypto";
import { requireAuth } from "../middlewares/auth";
import { connectToNestJS } from "../services/socket.service";
import { restartBinanceWsService } from "../services/binance-ws.service";
import { getTpConfig, saveTpConfig, TpMode, SlMode } from "../lib/tp-config";

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

    const tpConfig = getTpConfig();

    const mergedData = {
      targetExchange,
      clientToken,
      // 🎯 Take Profit Execution Modes
      testnetTpMode: tpConfig.testnetTpMode,
      testnetCustomTpRoiPct: tpConfig.testnetCustomTpRoiPct,
      testnetCustomTpSplitRatio: tpConfig.testnetCustomTpSplitRatio,
      liveTpMode: tpConfig.liveTpMode,
      liveCustomTpRoiPct: tpConfig.liveCustomTpRoiPct,
      liveCustomTpSplitRatio: tpConfig.liveCustomTpSplitRatio,
      tokocryptoTpMode: tpConfig.tokocryptoTpMode,
      tokocryptoCustomTpRoiPct: tpConfig.tokocryptoCustomTpRoiPct,
      tokocryptoCustomTpSplitRatio: tpConfig.tokocryptoCustomTpSplitRatio,
      // 🛡️ Stop Loss Guard Modes
      testnetSlMode: tpConfig.testnetSlMode,
      testnetCustomSlValue: tpConfig.testnetCustomSlValue,
      liveSlMode: tpConfig.liveSlMode,
      liveCustomSlValue: tpConfig.liveCustomSlValue,
      tokocryptoSlMode: tpConfig.tokocryptoSlMode,
      tokocryptoCustomSlValue: tpConfig.tokocryptoCustomSlValue,

      // 🧪 Binance Testnet Dedicated Fields
      testnetApiKey: binanceConfig?.testnetApiKey || "",
      testnetApiSecret: binanceConfig?.testnetApiSecret || "",
      testnetAutoExecute: Boolean(binanceConfig?.testnetAutoExecute),
      testnetTradeDirection: binanceConfig?.testnetTradeDirection || "BOTH",
      testnetMinScore: binanceConfig?.testnetMinScore ?? 0,
      testnetBlockLongOnBtcBearish:
        binanceConfig?.testnetBlockLongOnBtcBearish ?? true,
      testnetLeverage: binanceConfig?.testnetLeverage || 10,
      testnetMarginType: binanceConfig?.testnetMarginType || "ISOLATED",
      testnetRiskMode: binanceConfig?.testnetRiskMode || "PERCENTAGE",
      testnetRiskAmountUsd: binanceConfig?.testnetRiskAmountUsd ?? 10.0,
      testnetRiskPerTradePct: binanceConfig?.testnetRiskPerTradePct ?? 2.0,
      testnetMaxOpenPositions: binanceConfig?.testnetMaxOpenPositions ?? 3,
      testnetCoinFilterMode: binanceConfig?.testnetCoinFilterMode || "ALL",
      testnetTargetCoins: binanceConfig?.testnetTargetCoins || "",

      // 🚀 Binance Live Dedicated Fields
      liveApiKey: binanceConfig?.liveApiKey || "",
      liveApiSecret: binanceConfig?.liveApiSecret || "",
      liveAutoExecute: Boolean(binanceConfig?.liveAutoExecute),
      liveTradeDirection: binanceConfig?.liveTradeDirection || "BOTH",
      liveMinScore: binanceConfig?.liveMinScore ?? 0,
      liveBlockLongOnBtcBearish:
        binanceConfig?.liveBlockLongOnBtcBearish ?? true,
      liveLeverage: binanceConfig?.liveLeverage || 10,
      liveMarginType: binanceConfig?.liveMarginType || "ISOLATED",
      liveRiskMode: binanceConfig?.liveRiskMode || "PERCENTAGE",
      liveRiskAmountUsd: binanceConfig?.liveRiskAmountUsd ?? 10.0,
      liveRiskPerTradePct: binanceConfig?.liveRiskPerTradePct ?? 2.0,
      liveMaxOpenPositions: binanceConfig?.liveMaxOpenPositions ?? 3,
      liveCoinFilterMode: binanceConfig?.liveCoinFilterMode || "ALL",
      liveTargetCoins: binanceConfig?.liveTargetCoins || "",

      // Legacy Binance Fields
      binanceApiKey: binanceConfig?.apiKey || "",
      binanceApiSecret: binanceConfig?.apiSecret || "",
      environment: binanceConfig?.environment || "TESTNET",
      binanceAutoExecute: binanceAuto,
      leverage: binanceConfig?.leverage || 10,
      marginType: binanceConfig?.marginType || "ISOLATED",
      binanceRiskMode: binanceConfig?.riskMode || "PERCENTAGE",
      binanceRiskAmountUsd: binanceConfig?.riskAmountUsd ?? 10.0,
      binanceRiskPerTradePct: binanceConfig?.riskPerTradePct ?? 2.0,
      riskMode: binanceConfig?.riskMode || "PERCENTAGE",
      riskAmountUsd: binanceConfig?.riskAmountUsd ?? 10.0,
      binanceMaxOpenPositions: binanceConfig?.maxOpenPositions ?? 3,
      binanceCoinFilterMode: binanceConfig?.coinFilterMode || "ALL",
      binanceTargetCoins: binanceConfig?.targetCoins || "",
      binanceTradeDirection: binanceConfig?.tradeDirection || "BOTH",
      tradeDirection: binanceConfig?.tradeDirection || "BOTH",
      binanceMinScore: binanceConfig?.minScore ?? 0,
      minScore: binanceConfig?.minScore ?? 0,
      binanceBlockLongOnBtcBearish:
        binanceConfig?.blockLongOnBtcBearish ?? true,
      blockLongOnBtcBearish: binanceConfig?.blockLongOnBtcBearish ?? true,

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
      // 🧪 Testnet Dedicated
      testnetApiKey,
      testnetApiSecret,
      testnetAutoExecute,
      testnetTradeDirection,
      testnetMinScore,
      testnetBlockLongOnBtcBearish,
      testnetLeverage,
      testnetMarginType,
      testnetRiskMode,
      testnetRiskAmountUsd,
      testnetRiskPerTradePct,
      testnetMaxOpenPositions,
      testnetCoinFilterMode,
      testnetTargetCoins,
      // 🚀 Live Dedicated
      liveApiKey,
      liveApiSecret,
      liveAutoExecute,
      liveTradeDirection,
      liveMinScore,
      liveBlockLongOnBtcBearish,
      liveLeverage,
      liveMarginType,
      liveRiskMode,
      liveRiskAmountUsd,
      liveRiskPerTradePct,
      liveMaxOpenPositions,
      liveCoinFilterMode,
      liveTargetCoins,
      // Legacy Binance
      binanceApiKey,
      binanceApiSecret,
      environment,
      binanceAutoExecute,
      marginType,
      leverage,
      binanceRiskMode,
      binanceRiskAmountUsd,
      binanceRiskPerTradePct,
      binanceMaxOpenPositions,
      binanceCoinFilterMode,
      binanceTargetCoins,
      binanceTradeDirection,
      tradeDirection,
      binanceMinScore,
      minScore,
      binanceBlockLongOnBtcBearish,
      blockLongOnBtcBearish,
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
      // 🎯 Take Profit Modes
      testnetTpMode,
      testnetCustomTpRoiPct,
      liveTpMode,
      liveCustomTpRoiPct,
      tokocryptoTpMode,
      tokocryptoCustomTpRoiPct,
      testnetCustomTpSplitRatio,
      liveCustomTpSplitRatio,
      tokocryptoCustomTpSplitRatio,
      tpMode,
      customTpRoiPct,
      customTpSplitRatio,
      // 🛡️ Stop Loss Modes
      testnetSlMode,
      testnetCustomSlValue,
      liveSlMode,
      liveCustomSlValue,
      tokocryptoSlMode,
      tokocryptoCustomSlValue,
      slMode,
      customSlValue,
      // Legacy fallbacks
      autoExecute,
      dryRun,
      riskMode,
      riskAmountUsd,
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

    // 2. Simpan ke BinanceConfig (Dual Configurations)
    const binanceUpdate: any = {};

    // 🧪 Testnet Fields
    if (testnetApiKey !== undefined) {
      binanceUpdate.testnetApiKey = testnetApiKey ? testnetApiKey.trim() : null;
    }
    if (testnetApiSecret !== undefined) {
      binanceUpdate.testnetApiSecret = testnetApiSecret
        ? testnetApiSecret.trim()
        : null;
    }
    if (testnetAutoExecute !== undefined) {
      binanceUpdate.testnetAutoExecute = Boolean(testnetAutoExecute);
    }
    if (testnetTradeDirection !== undefined) {
      const dir = String(testnetTradeDirection).trim().toUpperCase();
      binanceUpdate.testnetTradeDirection =
        dir === "LONG_ONLY" || dir === "SHORT_ONLY" ? dir : "BOTH";
    }
    if (testnetMinScore !== undefined) {
      binanceUpdate.testnetMinScore = Math.max(
        0,
        Math.min(100, Number(testnetMinScore) || 0),
      );
    }
    if (testnetBlockLongOnBtcBearish !== undefined) {
      binanceUpdate.testnetBlockLongOnBtcBearish = Boolean(
        testnetBlockLongOnBtcBearish,
      );
    }
    if (testnetLeverage !== undefined) {
      binanceUpdate.testnetLeverage = Number(testnetLeverage);
    }
    if (testnetMarginType !== undefined) {
      binanceUpdate.testnetMarginType = testnetMarginType;
    }
    if (testnetRiskMode !== undefined) {
      const mode = String(testnetRiskMode).trim().toUpperCase();
      binanceUpdate.testnetRiskMode =
        mode === "FIXED_USD" ? "FIXED_USD" : "PERCENTAGE";
    }
    if (testnetRiskAmountUsd !== undefined) {
      binanceUpdate.testnetRiskAmountUsd = Math.max(
        0.1,
        Number(testnetRiskAmountUsd) || 10.0,
      );
    }
    if (testnetRiskPerTradePct !== undefined) {
      binanceUpdate.testnetRiskPerTradePct = Number(testnetRiskPerTradePct);
    }
    if (testnetMaxOpenPositions !== undefined) {
      binanceUpdate.testnetMaxOpenPositions = Number(testnetMaxOpenPositions);
    }
    if (testnetCoinFilterMode !== undefined) {
      binanceUpdate.testnetCoinFilterMode = testnetCoinFilterMode;
    }
    if (testnetTargetCoins !== undefined) {
      binanceUpdate.testnetTargetCoins =
        typeof testnetTargetCoins === "string" ? testnetTargetCoins.trim() : "";
    }

    // 🚀 Live Fields
    if (liveApiKey !== undefined) {
      binanceUpdate.liveApiKey = liveApiKey ? liveApiKey.trim() : null;
    }
    if (liveApiSecret !== undefined) {
      binanceUpdate.liveApiSecret = liveApiSecret ? liveApiSecret.trim() : null;
    }
    if (liveAutoExecute !== undefined) {
      binanceUpdate.liveAutoExecute = Boolean(liveAutoExecute);
    }
    if (liveTradeDirection !== undefined) {
      const dir = String(liveTradeDirection).trim().toUpperCase();
      binanceUpdate.liveTradeDirection =
        dir === "LONG_ONLY" || dir === "SHORT_ONLY" ? dir : "BOTH";
    }
    if (liveMinScore !== undefined) {
      binanceUpdate.liveMinScore = Math.max(
        0,
        Math.min(100, Number(liveMinScore) || 0),
      );
    }
    if (liveBlockLongOnBtcBearish !== undefined) {
      binanceUpdate.liveBlockLongOnBtcBearish = Boolean(
        liveBlockLongOnBtcBearish,
      );
    }
    if (liveLeverage !== undefined) {
      binanceUpdate.liveLeverage = Number(liveLeverage);
    }
    if (liveMarginType !== undefined) {
      binanceUpdate.liveMarginType = liveMarginType;
    }
    if (liveRiskMode !== undefined) {
      const mode = String(liveRiskMode).trim().toUpperCase();
      binanceUpdate.liveRiskMode =
        mode === "FIXED_USD" ? "FIXED_USD" : "PERCENTAGE";
    }
    if (liveRiskAmountUsd !== undefined) {
      binanceUpdate.liveRiskAmountUsd = Math.max(
        0.1,
        Number(liveRiskAmountUsd) || 10.0,
      );
    }
    if (liveRiskPerTradePct !== undefined) {
      binanceUpdate.liveRiskPerTradePct = Number(liveRiskPerTradePct);
    }
    if (liveMaxOpenPositions !== undefined) {
      binanceUpdate.liveMaxOpenPositions = Number(liveMaxOpenPositions);
    }
    if (liveCoinFilterMode !== undefined) {
      binanceUpdate.liveCoinFilterMode = liveCoinFilterMode;
    }
    if (liveTargetCoins !== undefined) {
      binanceUpdate.liveTargetCoins =
        typeof liveTargetCoins === "string" ? liveTargetCoins.trim() : "";
    }

    // Legacy sync
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

    if (binanceRiskMode !== undefined) {
      const mode = String(binanceRiskMode).trim().toUpperCase();
      binanceUpdate.riskMode =
        mode === "FIXED_USD" ? "FIXED_USD" : "PERCENTAGE";
    } else if (riskMode !== undefined) {
      const mode = String(riskMode).trim().toUpperCase();
      binanceUpdate.riskMode =
        mode === "FIXED_USD" ? "FIXED_USD" : "PERCENTAGE";
    }

    if (binanceRiskAmountUsd !== undefined) {
      binanceUpdate.riskAmountUsd = Math.max(
        0.1,
        Number(binanceRiskAmountUsd) || 10.0,
      );
    } else if (riskAmountUsd !== undefined) {
      binanceUpdate.riskAmountUsd = Math.max(
        0.1,
        Number(riskAmountUsd) || 10.0,
      );
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

    if (binanceTradeDirection !== undefined) {
      const dir = String(binanceTradeDirection).trim().toUpperCase();
      binanceUpdate.tradeDirection =
        dir === "LONG_ONLY" || dir === "SHORT_ONLY" ? dir : "BOTH";
    } else if (tradeDirection !== undefined) {
      const dir = String(tradeDirection).trim().toUpperCase();
      binanceUpdate.tradeDirection =
        dir === "LONG_ONLY" || dir === "SHORT_ONLY" ? dir : "BOTH";
    }

    if (binanceMinScore !== undefined) {
      binanceUpdate.minScore = Math.max(
        0,
        Math.min(100, Number(binanceMinScore) || 0),
      );
    } else if (minScore !== undefined) {
      binanceUpdate.minScore = Math.max(
        0,
        Math.min(100, Number(minScore) || 0),
      );
    }

    if (binanceBlockLongOnBtcBearish !== undefined) {
      binanceUpdate.blockLongOnBtcBearish = Boolean(
        binanceBlockLongOnBtcBearish,
      );
    } else if (blockLongOnBtcBearish !== undefined) {
      binanceUpdate.blockLongOnBtcBearish = Boolean(blockLongOnBtcBearish);
    }

    const savedBinance = await prisma.binanceConfig.upsert({
      where: { id: 1 },
      update: binanceUpdate,
      create: {
        id: 1,
        // Testnet
        testnetApiKey: binanceUpdate.testnetApiKey || null,
        testnetApiSecret: binanceUpdate.testnetApiSecret || null,
        testnetAutoExecute: binanceUpdate.testnetAutoExecute ?? false,
        testnetTradeDirection: binanceUpdate.testnetTradeDirection || "BOTH",
        testnetMinScore: binanceUpdate.testnetMinScore ?? 0,
        testnetBlockLongOnBtcBearish:
          binanceUpdate.testnetBlockLongOnBtcBearish ?? true,
        testnetLeverage: binanceUpdate.testnetLeverage ?? 10,
        testnetMarginType: binanceUpdate.testnetMarginType || "ISOLATED",
        testnetRiskPerTradePct: binanceUpdate.testnetRiskPerTradePct ?? 2.0,
        testnetMaxOpenPositions: binanceUpdate.testnetMaxOpenPositions ?? 3,
        testnetCoinFilterMode: binanceUpdate.testnetCoinFilterMode || "ALL",
        testnetTargetCoins: binanceUpdate.testnetTargetCoins || "",
        // Live
        liveApiKey: binanceUpdate.liveApiKey || null,
        liveApiSecret: binanceUpdate.liveApiSecret || null,
        liveAutoExecute: binanceUpdate.liveAutoExecute ?? false,
        liveTradeDirection: binanceUpdate.liveTradeDirection || "BOTH",
        liveMinScore: binanceUpdate.liveMinScore ?? 0,
        liveBlockLongOnBtcBearish:
          binanceUpdate.liveBlockLongOnBtcBearish ?? true,
        liveLeverage: binanceUpdate.liveLeverage ?? 10,
        liveMarginType: binanceUpdate.liveMarginType || "ISOLATED",
        liveRiskPerTradePct: binanceUpdate.liveRiskPerTradePct ?? 2.0,
        liveMaxOpenPositions: binanceUpdate.liveMaxOpenPositions ?? 3,
        liveCoinFilterMode: binanceUpdate.liveCoinFilterMode || "ALL",
        liveTargetCoins: binanceUpdate.liveTargetCoins || "",
        // Legacy
        apiKey: binanceUpdate.apiKey || null,
        apiSecret: binanceUpdate.apiSecret || null,
        environment: binanceUpdate.environment || "TESTNET",
        autoExecute: binanceUpdate.autoExecute ?? false,
        tradeDirection: binanceUpdate.tradeDirection || "BOTH",
        minScore: binanceUpdate.minScore ?? 0,
        blockLongOnBtcBearish: binanceUpdate.blockLongOnBtcBearish ?? true,
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

    // Simpan Preferensi Take Profit Execution Mode
    const tpUpdates: any = {};
    if (testnetTpMode !== undefined) tpUpdates.testnetTpMode = testnetTpMode as TpMode;
    if (testnetCustomTpRoiPct !== undefined) tpUpdates.testnetCustomTpRoiPct = Number(testnetCustomTpRoiPct);
    if (testnetCustomTpSplitRatio !== undefined) tpUpdates.testnetCustomTpSplitRatio = Number(testnetCustomTpSplitRatio);
    if (liveTpMode !== undefined) tpUpdates.liveTpMode = liveTpMode as TpMode;
    if (liveCustomTpRoiPct !== undefined) tpUpdates.liveCustomTpRoiPct = Number(liveCustomTpRoiPct);
    if (liveCustomTpSplitRatio !== undefined) tpUpdates.liveCustomTpSplitRatio = Number(liveCustomTpSplitRatio);
    if (tokocryptoTpMode !== undefined) tpUpdates.tokocryptoTpMode = tokocryptoTpMode as TpMode;
    if (tokocryptoCustomTpRoiPct !== undefined) tpUpdates.tokocryptoCustomTpRoiPct = Number(tokocryptoCustomTpRoiPct);
    if (tokocryptoCustomTpSplitRatio !== undefined) tpUpdates.tokocryptoCustomTpSplitRatio = Number(tokocryptoCustomTpSplitRatio);

    // 🛡️ Stop Loss Updates
    if (testnetSlMode !== undefined) tpUpdates.testnetSlMode = testnetSlMode as SlMode;
    if (testnetCustomSlValue !== undefined) tpUpdates.testnetCustomSlValue = Number(testnetCustomSlValue);
    if (liveSlMode !== undefined) tpUpdates.liveSlMode = liveSlMode as SlMode;
    if (liveCustomSlValue !== undefined) tpUpdates.liveCustomSlValue = Number(liveCustomSlValue);
    if (tokocryptoSlMode !== undefined) tpUpdates.tokocryptoSlMode = tokocryptoSlMode as SlMode;
    if (tokocryptoCustomSlValue !== undefined) tpUpdates.tokocryptoCustomSlValue = Number(tokocryptoCustomSlValue);

    // Fallback sync jika dikirim via generic tpMode
    if (tpMode !== undefined) {
      if (environment === "LIVE") {
        tpUpdates.liveTpMode = tpMode as TpMode;
        if (customTpRoiPct !== undefined) tpUpdates.liveCustomTpRoiPct = Number(customTpRoiPct);
        if (customTpSplitRatio !== undefined) tpUpdates.liveCustomTpSplitRatio = Number(customTpSplitRatio);
      } else {
        tpUpdates.testnetTpMode = tpMode as TpMode;
        if (customTpRoiPct !== undefined) tpUpdates.testnetCustomTpRoiPct = Number(customTpRoiPct);
        if (customTpSplitRatio !== undefined) tpUpdates.testnetCustomTpSplitRatio = Number(customTpSplitRatio);
      }
    }
    if (slMode !== undefined) {
      if (environment === "LIVE") {
        tpUpdates.liveSlMode = slMode as SlMode;
        if (customSlValue !== undefined) tpUpdates.liveCustomSlValue = Number(customSlValue);
      } else {
        tpUpdates.testnetSlMode = slMode as SlMode;
        if (customSlValue !== undefined) tpUpdates.testnetCustomSlValue = Number(customSlValue);
      }
    }
    const savedTp = saveTpConfig(tpUpdates);

    // Otomatis Reconnect WebSocket jika ada token di konfigurasi
    if (savedApp.clientToken) {
      connectToNestJS(savedApp.clientToken);
    }

    // Otomatis Reconnect Binance Futures WebSocket Stream (Live/Testnet Switch)
    restartBinanceWsService();

    const mergedSaved = {
      targetExchange: savedApp.targetExchange,
      clientToken: savedApp.clientToken || "",
      // 🎯 Take Profit Modes
      testnetTpMode: savedTp.testnetTpMode,
      testnetCustomTpRoiPct: savedTp.testnetCustomTpRoiPct,
      testnetCustomTpSplitRatio: savedTp.testnetCustomTpSplitRatio,
      liveTpMode: savedTp.liveTpMode,
      liveCustomTpRoiPct: savedTp.liveCustomTpRoiPct,
      liveCustomTpSplitRatio: savedTp.liveCustomTpSplitRatio,
      tokocryptoTpMode: savedTp.tokocryptoTpMode,
      tokocryptoCustomTpRoiPct: savedTp.tokocryptoCustomTpRoiPct,
      tokocryptoCustomTpSplitRatio: savedTp.tokocryptoCustomTpSplitRatio,
      // 🛡️ Stop Loss Modes
      testnetSlMode: savedTp.testnetSlMode,
      testnetCustomSlValue: savedTp.testnetCustomSlValue,
      liveSlMode: savedTp.liveSlMode,
      liveCustomSlValue: savedTp.liveCustomSlValue,
      tokocryptoSlMode: savedTp.tokocryptoSlMode,
      tokocryptoCustomSlValue: savedTp.tokocryptoCustomSlValue,
      // 🧪 Testnet
      testnetApiKey: savedBinance.testnetApiKey || "",
      testnetApiSecret: savedBinance.testnetApiSecret || "",
      testnetAutoExecute: Boolean(savedBinance.testnetAutoExecute),
      testnetTradeDirection: savedBinance.testnetTradeDirection || "BOTH",
      testnetMinScore: savedBinance.testnetMinScore ?? 0,
      testnetBlockLongOnBtcBearish:
        savedBinance.testnetBlockLongOnBtcBearish ?? true,
      testnetLeverage: savedBinance.testnetLeverage || 10,
      testnetMarginType: savedBinance.testnetMarginType || "ISOLATED",
      testnetRiskPerTradePct: savedBinance.testnetRiskPerTradePct ?? 2.0,
      testnetMaxOpenPositions: savedBinance.testnetMaxOpenPositions ?? 3,
      testnetCoinFilterMode: savedBinance.testnetCoinFilterMode || "ALL",
      testnetTargetCoins: savedBinance.testnetTargetCoins || "",

      // 🚀 Live
      liveApiKey: savedBinance.liveApiKey || "",
      liveApiSecret: savedBinance.liveApiSecret || "",
      liveAutoExecute: Boolean(savedBinance.liveAutoExecute),
      liveTradeDirection: savedBinance.liveTradeDirection || "BOTH",
      liveMinScore: savedBinance.liveMinScore ?? 0,
      liveBlockLongOnBtcBearish: savedBinance.liveBlockLongOnBtcBearish ?? true,
      liveLeverage: savedBinance.liveLeverage || 10,
      liveMarginType: savedBinance.liveMarginType || "ISOLATED",
      liveRiskPerTradePct: savedBinance.liveRiskPerTradePct ?? 2.0,
      liveMaxOpenPositions: savedBinance.liveMaxOpenPositions ?? 3,
      liveCoinFilterMode: savedBinance.liveCoinFilterMode || "ALL",
      liveTargetCoins: savedBinance.liveTargetCoins || "",

      // Binance Legacy
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
      binanceTradeDirection: savedBinance.tradeDirection || "BOTH",
      tradeDirection: savedBinance.tradeDirection || "BOTH",
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
      message: "Configuration saved successfully and bot updated!",
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
            "Binance API Key and API Secret are required to test connection.",
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
        message: err.message || "Failed to test Binance connection.",
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
            "Tokocrypto API Key and API Secret are required to test connection.",
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
        message: err.message || "Failed to test Tokocrypto connection.",
      });
    }
  },
);
