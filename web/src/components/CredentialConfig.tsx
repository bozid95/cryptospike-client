import { useState, useEffect } from "react";
import {
  KeyIcon,
  FlaskConicalIcon,
  GlobeIcon,
  CheckIcon,
  Loader2,
  ActivityIcon,
  ShieldAlert,
  ShieldCheck,
  SaveIcon,
  FilterIcon,
  PlusIcon,
  XIcon,
  Coins,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RiskMode = "PERCENTAGE" | "FIXED_USD" | "RISK_AT_SL";

/** Normalisasi mode alokasi risiko dari API; nilai tak dikenal → PERCENTAGE. */
function toRiskMode(value: unknown): RiskMode {
  const mode = String(value ?? "").toUpperCase();
  return mode === "FIXED_USD" || mode === "RISK_AT_SL" ? mode : "PERCENTAGE";
}

const TOP_50_CMC: string[] = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "SOLUSDT",
  "TRXUSDT",
  "HYPEUSDT",
  "ZECUSDT",
  "DOGEUSDT",
  "LINKUSDT",
  "ADAUSDT",
  "NEARUSDT",
  "XLMUSDT",
  "BCHUSDT",
  "LTCUSDT",
  "UNIUSDT",
  "AVAXUSDT",
  "SUIUSDT",
  "HBARUSDT",
  "TAOUSDT",
  "1000SHIBUSDT",
  "ENAUSDT",
  "QNTUSDT",
  "AAVEUSDT",
  "PUMPUSDT",
  "ONDOUSDT",
  "DOTUSDT",
  "WLDUSDT",
  "ICPUSDT",
  "1000PEPEUSDT",
  "ETCUSDT",
  "ARBUSDT",
  "JUPUSDT",
  "KASUSDT",
  "POLUSDT",
  "ALGOUSDT",
  "ATOMUSDT",
  "RENDERUSDT",
  "FILUSDT",
  "AEROUSDT",
  "ZROUSDT",
  "CAKEUSDT",
  "INJUSDT",
  "APTUSDT",
  "XDCUSDT",
  "STRKUSDT",
  "STXUSDT",
  "VETUSDT",
  "DASHUSDT",
  "ETHFIUSDT",
];

const TOP_100_CMC: string[] = Array.from(
  new Set([
    ...TOP_50_CMC,
    "RAYUSDT",
    "PYTHUSDT",
    "FLRUSDT",
    "CRVUSDT",
    "TRUMPUSDT",
    "FETUSDT",
    "SEIUSDT",
    "PENGUUSDT",
    "VIRTUALUSDT",
    "TIAUSDT",
    "IMXUSDT",
    "PENDLEUSDT",
    "KAIAUSDT",
    "LDOUSDT",
    "CFXUSDT",
    "XTZUSDT",
    "SUNUSDT",
    "OPUSDT",
    "GNOUSDT",
    "DCRUSDT",
    "1000BONKUSDT",
    "GRTUSDT",
    "MONUSDT",
    "JTOUSDT",
    "1000LUNCUSDT",
    "SYRUPUSDT",
    "ARUSDT",
    "ENSUSDT",
    "1000FLOKIUSDT",
    "JASMYUSDT",
    "PONSUSDT",
    "COMPUSDT",
    "IOTAUSDT",
    "METUSDT",
    "NFTUSDT",
    "EIGENUSDT",
    "ZBCNUSDT",
    "RUNEUSDT",
    "THETAUSDT",
    "TWTUSDT",
    "AXSUSDT",
    "AKTUSDT",
    "WIFUSDT",
    "TRACUSDT",
    "CVXUSDT",
    "KMNOUSDT",
    "ZAMAUSDT",
    "MANAUSDT",
  ]),
);

const MEMECOINS: string[] = [
  "DOGEUSDT",
  "1000SHIBUSDT",
  "1000PEPEUSDT",
  "WIFUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
  "PUMPUSDT",
  "PENGUUSDT",
  "POPCATUSDT",
  "TURBOUSDT",
  "BRETTUSDT",
  "NEIROUSDT",
  "BOMEUSDT",
  "MEMEUSDT",
  "1000SATSUSDT",
  "1000RATSUSDT",
  "1000CATUSDT",
  "1000LUNCUSDT",
  "MYROUSDT",
  "PEOPLEUSDT",
];

const TOP_50_NO_MEME: string[] = TOP_50_CMC.filter(
  (coin) => !MEMECOINS.includes(coin),
);

const TOP_100_NO_MEME: string[] = TOP_100_CMC.filter(
  (coin) => !MEMECOINS.includes(coin),
);

interface CredentialConfigProps {
  forcedExchange?: "BINANCE" | "TOKOCRYPTO";
}

export default function CredentialConfig({
  forcedExchange,
}: CredentialConfigProps = {}) {
  const [token, setToken] = useState("");
  const [targetExchange, setTargetExchange] = useState<
    "BINANCE" | "TOKOCRYPTO" | "BOTH"
  >("BINANCE");
  const [activeExchangeForm, setActiveExchangeForm] = useState<
    "BINANCE" | "TOKOCRYPTO"
  >(forcedExchange || "BINANCE");
  const [binanceSubTab, setBinanceSubTab] = useState<"TESTNET" | "LIVE">(
    "TESTNET",
  );

  // Sync with forcedExchange prop when tab changes
  useEffect(() => {
    if (forcedExchange) {
      setActiveExchangeForm(forcedExchange);
    }
  }, [forcedExchange]);

  // 🧪 Binance Testnet Dedicated Settings
  const [testnetApiKey, setTestnetApiKey] = useState("");
  const [testnetApiSecret, setTestnetApiSecret] = useState("");
  const [showTestnetSecret, setShowTestnetSecret] = useState(false);
  const [testnetAutoExecute, setTestnetAutoExecute] = useState(false);
  const [testnetMarginType, setTestnetMarginType] = useState<
    "ISOLATED" | "CROSSED"
  >("ISOLATED");
  const [testnetLeverage, setTestnetLeverage] = useState(10);
  const [testnetRiskMode, setTestnetRiskMode] = useState<
    RiskMode
  >("PERCENTAGE");
  const [testnetRiskAmountUsd, setTestnetRiskAmountUsd] = useState(10.0);
  const [testnetRiskPerTradePct, setTestnetRiskPerTradePct] = useState(2.0);
  const [testnetMaxOpenPositions, setTestnetMaxOpenPositions] = useState(3);
  const [testnetCoinFilterMode, setTestnetCoinFilterMode] = useState<
    "ALL" | "WHITELIST" | "BLACKLIST"
  >("ALL");
  const [testnetTargetCoins, setTestnetTargetCoins] = useState("");
  const [testnetTradeDirection, setTestnetTradeDirection] = useState<
    "BOTH" | "LONG_ONLY" | "SHORT_ONLY"
  >("BOTH");
  const [testnetMinScore, setTestnetMinScore] = useState<number>(0);
  const [testnetBlockLongOnBtcBearish, setTestnetBlockLongOnBtcBearish] =
    useState<boolean>(true);

  // 🚀 Binance Live Dedicated Settings
  const [liveApiKey, setLiveApiKey] = useState("");
  const [liveApiSecret, setLiveApiSecret] = useState("");
  const [showLiveSecret, setShowLiveSecret] = useState(false);
  const [liveAutoExecute, setLiveAutoExecute] = useState(false);
  const [liveMarginType, setLiveMarginType] = useState<"ISOLATED" | "CROSSED">(
    "ISOLATED",
  );
  const [liveLeverage, setLiveLeverage] = useState(10);
  const [liveRiskMode, setLiveRiskMode] = useState<RiskMode>(
    "PERCENTAGE",
  );
  const [liveRiskAmountUsd, setLiveRiskAmountUsd] = useState(10.0);
  const [liveRiskPerTradePct, setLiveRiskPerTradePct] = useState(2.0);
  const [liveMaxOpenPositions, setLiveMaxOpenPositions] = useState(3);
  const [liveCoinFilterMode, setLiveCoinFilterMode] = useState<
    "ALL" | "WHITELIST" | "BLACKLIST"
  >("ALL");
  const [liveTargetCoins, setLiveTargetCoins] = useState("");
  const [liveTradeDirection, setLiveTradeDirection] = useState<
    "BOTH" | "LONG_ONLY" | "SHORT_ONLY"
  >("BOTH");
  const [liveMinScore, setLiveMinScore] = useState<number>(0);
  const [liveBlockLongOnBtcBearish, setLiveBlockLongOnBtcBearish] =
    useState<boolean>(true);

  // 🎯 Take Profit Mode States
  const [testnetTpMode, setTestnetTpMode] = useState<
    "MULTI_TP" | "TP1_ONLY" | "TP2_ONLY" | "CUSTOM_ROI" | "CUSTOM_SPLIT"
  >("MULTI_TP");
  const [testnetCustomTpRoiPct, setTestnetCustomTpRoiPct] = useState<number>(10.0);
  const [testnetCustomTpSplitRatio, setTestnetCustomTpSplitRatio] = useState<number>(70);

  const [liveTpMode, setLiveTpMode] = useState<
    "MULTI_TP" | "TP1_ONLY" | "TP2_ONLY" | "CUSTOM_ROI" | "CUSTOM_SPLIT"
  >("MULTI_TP");
  const [liveCustomTpRoiPct, setLiveCustomTpRoiPct] = useState<number>(10.0);
  const [liveCustomTpSplitRatio, setLiveCustomTpSplitRatio] = useState<number>(70);

  const [tokocryptoTpMode, setTokocryptoTpMode] = useState<
    "MULTI_TP" | "TP1_ONLY" | "TP2_ONLY" | "CUSTOM_ROI" | "CUSTOM_SPLIT"
  >("MULTI_TP");
  const [tokocryptoCustomTpRoiPct, setTokocryptoCustomTpRoiPct] = useState<number>(3.5);
  const [tokocryptoCustomTpSplitRatio, setTokocryptoCustomTpSplitRatio] = useState<number>(70);

  // 🛡️ Stop Loss Mode States
  const [testnetSlMode, setTestnetSlMode] = useState<
    "SIGNAL_SL" | "FIXED_PCT" | "MAX_LOSS_ROI"
  >("SIGNAL_SL");
  const [testnetCustomSlValue, setTestnetCustomSlValue] = useState<number>(15.0);

  const [liveSlMode, setLiveSlMode] = useState<
    "SIGNAL_SL" | "FIXED_PCT" | "MAX_LOSS_ROI"
  >("SIGNAL_SL");
  const [liveCustomSlValue, setLiveCustomSlValue] = useState<number>(15.0);

  const [tokocryptoSlMode, setTokocryptoSlMode] = useState<
    "SIGNAL_SL" | "FIXED_PCT" | "MAX_LOSS_ROI"
  >("SIGNAL_SL");
  const [tokocryptoCustomSlValue, setTokocryptoCustomSlValue] = useState<number>(2.5);

  // Tokocrypto Dedicated Risk & Execution
  const [tokocryptoApiKey, setTokocryptoApiKey] = useState("");
  const [tokocryptoApiSecret, setTokocryptoApiSecret] = useState("");
  const [showTokocryptoSecret, setShowTokocryptoSecret] = useState(false);
  const [tokocryptoQuoteAsset, setTokocryptoQuoteAsset] = useState<
    "USDT" | "BIDR"
  >("USDT");
  const [tokocryptoAutoExecute, setTokocryptoAutoExecute] = useState(false);
  const [tokocryptoDryRun, setTokocryptoDryRun] = useState(false);
  const [tokocryptoRiskPerTradePct, setTokocryptoRiskPerTradePct] =
    useState(10.0);
  const [tokocryptoMaxOpenPositions, setTokocryptoMaxOpenPositions] =
    useState(5);
  const [tokocryptoCoinFilterMode, setTokocryptoCoinFilterMode] = useState<
    "ALL" | "WHITELIST" | "BLACKLIST"
  >("ALL");
  const [tokocryptoTargetCoins, setTokocryptoTargetCoins] = useState("");

  // Coin input for adding symbols
  const [coinInput, setCoinInput] = useState("");

  // Status State
  const [isSaving, setIsSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  type TestResultType = {
    success: boolean;
    message: string;
    balance?: number;
    quoteAsset?: string;
  };

  const [testnetTestResult, setTestnetTestResult] =
    useState<TestResultType | null>(null);
  const [liveTestResult, setLiveTestResult] = useState<TestResultType | null>(
    null,
  );
  const [tokocryptoTestResult, setTokocryptoTestResult] =
    useState<TestResultType | null>(null);

  // Active form getters and setters
  const isTokoForm = activeExchangeForm === "TOKOCRYPTO";
  const isLiveBinance = !isTokoForm && binanceSubTab === "LIVE";

  const autoExecute = isTokoForm
    ? tokocryptoAutoExecute
    : isLiveBinance
      ? liveAutoExecute
      : testnetAutoExecute;
  const setAutoExecute = isTokoForm
    ? setTokocryptoAutoExecute
    : isLiveBinance
      ? setLiveAutoExecute
      : setTestnetAutoExecute;

  const marginType = isLiveBinance ? liveMarginType : testnetMarginType;
  const setMarginType = isLiveBinance
    ? setLiveMarginType
    : setTestnetMarginType;

  const leverage = isLiveBinance ? liveLeverage : testnetLeverage;
  const setLeverage = isLiveBinance ? setLiveLeverage : setTestnetLeverage;

  const tradeDirection = isLiveBinance
    ? liveTradeDirection
    : testnetTradeDirection;
  const setTradeDirection = isLiveBinance
    ? setLiveTradeDirection
    : setTestnetTradeDirection;

  const minScore = isLiveBinance ? liveMinScore : testnetMinScore;
  const setMinScore = isLiveBinance ? setLiveMinScore : setTestnetMinScore;

  const blockLongOnBtcBearish = isLiveBinance
    ? liveBlockLongOnBtcBearish
    : testnetBlockLongOnBtcBearish;
  const setBlockLongOnBtcBearish = isLiveBinance
    ? setLiveBlockLongOnBtcBearish
    : setTestnetBlockLongOnBtcBearish;

  const riskPerTradePct = isTokoForm
    ? tokocryptoRiskPerTradePct
    : isLiveBinance
      ? liveRiskPerTradePct
      : testnetRiskPerTradePct;
  const setRiskPerTradePct = isTokoForm
    ? setTokocryptoRiskPerTradePct
    : isLiveBinance
      ? setLiveRiskPerTradePct
      : setTestnetRiskPerTradePct;

  const riskMode = isLiveBinance ? liveRiskMode : testnetRiskMode;
  const setRiskMode = isLiveBinance ? setLiveRiskMode : setTestnetRiskMode;

  const tpMode = isTokoForm
    ? tokocryptoTpMode
    : isLiveBinance
      ? liveTpMode
      : testnetTpMode;
  const setTpMode = isTokoForm
    ? setTokocryptoTpMode
    : isLiveBinance
      ? setLiveTpMode
      : setTestnetTpMode;

  const customTpRoiPct = isTokoForm
    ? tokocryptoCustomTpRoiPct
    : isLiveBinance
      ? liveCustomTpRoiPct
      : testnetCustomTpRoiPct;
  const setCustomTpRoiPct = isTokoForm
    ? setTokocryptoCustomTpRoiPct
    : isLiveBinance
      ? setLiveCustomTpRoiPct
      : setTestnetCustomTpRoiPct;

  const customTpSplitRatio = isTokoForm
    ? tokocryptoCustomTpSplitRatio
    : isLiveBinance
      ? liveCustomTpSplitRatio
      : testnetCustomTpSplitRatio;
  const setCustomTpSplitRatio = isTokoForm
    ? setTokocryptoCustomTpSplitRatio
    : isLiveBinance
      ? setLiveCustomTpSplitRatio
      : setTestnetCustomTpSplitRatio;

  const slMode = isTokoForm
    ? tokocryptoSlMode
    : isLiveBinance
      ? liveSlMode
      : testnetSlMode;
  const setSlMode = isTokoForm
    ? setTokocryptoSlMode
    : isLiveBinance
      ? setLiveSlMode
      : setTestnetSlMode;

  const customSlValue = isTokoForm
    ? tokocryptoCustomSlValue
    : isLiveBinance
      ? liveCustomSlValue
      : testnetCustomSlValue;
  const setCustomSlValue = isTokoForm
    ? setTokocryptoCustomSlValue
    : isLiveBinance
      ? setLiveCustomSlValue
      : setTestnetCustomSlValue;

  const riskAmountUsd = isLiveBinance
    ? liveRiskAmountUsd
    : testnetRiskAmountUsd;
  const setRiskAmountUsd = isLiveBinance
    ? setLiveRiskAmountUsd
    : setTestnetRiskAmountUsd;

  const maxOpenPositions = isTokoForm
    ? tokocryptoMaxOpenPositions
    : isLiveBinance
      ? liveMaxOpenPositions
      : testnetMaxOpenPositions;
  const setMaxOpenPositions = isTokoForm
    ? setTokocryptoMaxOpenPositions
    : isLiveBinance
      ? setLiveMaxOpenPositions
      : setTestnetMaxOpenPositions;

  const coinFilterMode = isTokoForm
    ? tokocryptoCoinFilterMode
    : isLiveBinance
      ? liveCoinFilterMode
      : testnetCoinFilterMode;
  const setCoinFilterMode = isTokoForm
    ? setTokocryptoCoinFilterMode
    : isLiveBinance
      ? setLiveCoinFilterMode
      : setTestnetCoinFilterMode;

  const targetCoins = isTokoForm
    ? tokocryptoTargetCoins
    : isLiveBinance
      ? liveTargetCoins
      : testnetTargetCoins;
  const setTargetCoins = isTokoForm
    ? setTokocryptoTargetCoins
    : isLiveBinance
      ? setLiveTargetCoins
      : setTestnetTargetCoins;

  const dryRun = tokocryptoDryRun;
  const setDryRun = setTokocryptoDryRun;

  const activeTestResult = isTokoForm
    ? tokocryptoTestResult
    : isLiveBinance
      ? liveTestResult
      : testnetTestResult;

  // 1. Muat konfigurasi dari database lokal SQLite
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await authFetch("/api/config");
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const d = json.data;
            setToken(d.clientToken || "");
            const rawEx = (d.targetExchange || "BINANCE").toUpperCase();
            const loadedExchange: "BINANCE" | "TOKOCRYPTO" | "BOTH" =
              rawEx === "TOKOCRYPTO" || rawEx === "BOTH" ? rawEx : "BINANCE";
            setTargetExchange(loadedExchange);

            if (forcedExchange) {
              setActiveExchangeForm(forcedExchange);
            } else {
              setActiveExchangeForm(
                loadedExchange === "TOKOCRYPTO" ? "TOKOCRYPTO" : "BINANCE",
              );
            }
            if (d.environment === "LIVE") {
              setBinanceSubTab("LIVE");
            } else {
              setBinanceSubTab("TESTNET");
            }

            // 🧪 Binance Testnet Settings
            setTestnetApiKey(
              d.testnetApiKey ||
                (d.environment === "TESTNET" ? d.binanceApiKey : "") ||
                "",
            );
            setTestnetApiSecret(
              d.testnetApiSecret ||
                (d.environment === "TESTNET" ? d.binanceApiSecret : "") ||
                "",
            );
            setTestnetAutoExecute(
              Boolean(
                d.testnetAutoExecute ??
                (d.environment === "TESTNET" ? d.binanceAutoExecute : false),
              ),
            );
            setTestnetMarginType(
              d.testnetMarginType || d.marginType || "ISOLATED",
            );
            setTestnetLeverage(d.testnetLeverage || d.leverage || 10);
            setTestnetRiskMode(
              toRiskMode(
                d.testnetRiskMode ||
                d.binanceRiskMode ||
                d.riskMode ||
                "PERCENTAGE"
              ),
            );
            setTestnetRiskAmountUsd(
              Number(
                d.testnetRiskAmountUsd ??
                  d.binanceRiskAmountUsd ??
                  d.riskAmountUsd ??
                  10.0,
              ),
            );
            setTestnetRiskPerTradePct(
              d.testnetRiskPerTradePct ?? d.binanceRiskPerTradePct ?? 2.0,
            );
            setTestnetMaxOpenPositions(
              d.testnetMaxOpenPositions ?? d.binanceMaxOpenPositions ?? 3,
            );
            setTestnetCoinFilterMode(
              d.testnetCoinFilterMode || d.binanceCoinFilterMode || "ALL",
            );
            setTestnetTargetCoins(
              d.testnetTargetCoins || d.binanceTargetCoins || "",
            );
            const loadedTestDir = (
              d.testnetTradeDirection ||
              d.binanceTradeDirection ||
              "BOTH"
            ).toUpperCase();
            setTestnetTradeDirection(
              loadedTestDir === "LONG_ONLY" || loadedTestDir === "SHORT_ONLY"
                ? loadedTestDir
                : "BOTH",
            );
            setTestnetMinScore(
              Number(d.testnetMinScore ?? d.binanceMinScore ?? 0),
            );
            setTestnetBlockLongOnBtcBearish(
              d.testnetBlockLongOnBtcBearish !== undefined
                ? Boolean(d.testnetBlockLongOnBtcBearish)
                : Boolean(d.binanceBlockLongOnBtcBearish ?? true),
            );

            // 🚀 Binance Live Settings
            setLiveApiKey(
              d.liveApiKey ||
                (d.environment === "LIVE" ? d.binanceApiKey : "") ||
                "",
            );
            setLiveApiSecret(
              d.liveApiSecret ||
                (d.environment === "LIVE" ? d.binanceApiSecret : "") ||
                "",
            );
            setLiveAutoExecute(
              Boolean(
                d.liveAutoExecute ??
                (d.environment === "LIVE" ? d.binanceAutoExecute : false),
              ),
            );
            setLiveMarginType(d.liveMarginType || d.marginType || "ISOLATED");
            setLiveLeverage(d.liveLeverage || d.leverage || 10);
            setLiveRiskMode(
              toRiskMode(
                d.liveRiskMode ||
                d.binanceRiskMode ||
                d.riskMode ||
                "PERCENTAGE"
              ),
            );
            setLiveRiskAmountUsd(
              Number(
                d.liveRiskAmountUsd ??
                  d.binanceRiskAmountUsd ??
                  d.riskAmountUsd ??
                  10.0,
              ),
            );
            setLiveRiskPerTradePct(
              d.liveRiskPerTradePct ?? d.binanceRiskPerTradePct ?? 2.0,
            );
            setLiveMaxOpenPositions(
              d.liveMaxOpenPositions ?? d.binanceMaxOpenPositions ?? 3,
            );
            setLiveCoinFilterMode(
              d.liveCoinFilterMode || d.binanceCoinFilterMode || "ALL",
            );
            setLiveTargetCoins(d.liveTargetCoins || d.binanceTargetCoins || "");
            const loadedLiveDir = (
              d.liveTradeDirection ||
              d.binanceTradeDirection ||
              "BOTH"
            ).toUpperCase();
            setLiveTradeDirection(
              loadedLiveDir === "LONG_ONLY" || loadedLiveDir === "SHORT_ONLY"
                ? loadedLiveDir
                : "BOTH",
            );
            setLiveMinScore(Number(d.liveMinScore ?? d.binanceMinScore ?? 0));
            setLiveBlockLongOnBtcBearish(
              d.liveBlockLongOnBtcBearish !== undefined
                ? Boolean(d.liveBlockLongOnBtcBearish)
                : Boolean(d.binanceBlockLongOnBtcBearish ?? true),
            );

            // Tokocrypto Config
            setTokocryptoApiKey(d.tokocryptoApiKey || "");
            setTokocryptoApiSecret(d.tokocryptoApiSecret || "");
            const tokoQuote =
              d.tokocryptoQuoteAsset === "BIDR" ? "BIDR" : "USDT";
            setTokocryptoQuoteAsset(tokoQuote);
            setTokocryptoAutoExecute(
              d.tokocryptoAutoExecute === 1 || d.tokocryptoAutoExecute === true,
            );
            setTokocryptoDryRun(
              d.tokocryptoDryRun === 1 ||
                d.tokocryptoDryRun === true ||
                d.dryRun === 1 ||
                d.dryRun === true,
            );
            setTokocryptoRiskPerTradePct(d.tokocryptoRiskPerTradePct ?? 10.0);
            setTokocryptoMaxOpenPositions(d.tokocryptoMaxOpenPositions ?? 5);
            setTokocryptoCoinFilterMode(d.tokocryptoCoinFilterMode || "ALL");
            setTokocryptoTargetCoins(d.tokocryptoTargetCoins || "");

            // 🎯 Load Take Profit Modes
            setTestnetTpMode(d.testnetTpMode || "MULTI_TP");
            setTestnetCustomTpRoiPct(Number(d.testnetCustomTpRoiPct || 10.0));
            setTestnetCustomTpSplitRatio(Number(d.testnetCustomTpSplitRatio ?? 70));
            setLiveTpMode(d.liveTpMode || "MULTI_TP");
            setLiveCustomTpRoiPct(Number(d.liveCustomTpRoiPct || 10.0));
            setLiveCustomTpSplitRatio(Number(d.liveCustomTpSplitRatio ?? 70));
            setTokocryptoTpMode(d.tokocryptoTpMode || "MULTI_TP");
            setTokocryptoCustomTpRoiPct(Number(d.tokocryptoCustomTpRoiPct || 3.5));
            setTokocryptoCustomTpSplitRatio(Number(d.tokocryptoCustomTpSplitRatio ?? 70));

            // 🛡️ Load Stop Loss Modes
            setTestnetSlMode(d.testnetSlMode || "SIGNAL_SL");
            setTestnetCustomSlValue(Number(d.testnetCustomSlValue ?? 15.0));
            setLiveSlMode(d.liveSlMode || "SIGNAL_SL");
            setLiveCustomSlValue(Number(d.liveCustomSlValue ?? 15.0));
            setTokocryptoSlMode(d.tokocryptoSlMode || "SIGNAL_SL");
            setTokocryptoCustomSlValue(Number(d.tokocryptoCustomSlValue ?? 2.5));

            // Auto-fetch balances if credentials exist
            try {
              const [resTestnet, resLive, resToko] = await Promise.all([
                authFetch("/api/positions?exchange=BINANCE_TESTNET"),
                authFetch("/api/positions?exchange=BINANCE_LIVE"),
                authFetch("/api/positions?exchange=TOKOCRYPTO"),
              ]);
              if (resTestnet.ok) {
                const j = await resTestnet.json();
                if (
                  j.success &&
                  typeof j.account?.totalWalletBalance === "number"
                ) {
                  setTestnetTestResult({
                    success: true,
                    message: "Current Binance Testnet Balance",
                    balance: j.account.totalWalletBalance,
                    quoteAsset: "USDT",
                  });
                }
              }
              if (resLive.ok) {
                const j = await resLive.json();
                if (
                  j.success &&
                  typeof j.account?.totalWalletBalance === "number"
                ) {
                  setLiveTestResult({
                    success: true,
                    message: "Current Binance Live Balance",
                    balance: j.account.totalWalletBalance,
                    quoteAsset: "USDT",
                  });
                }
              }
              if (resToko.ok) {
                const j = await resToko.json();
                if (
                  j.success &&
                  typeof j.account?.totalWalletBalance === "number"
                ) {
                  setTokocryptoTestResult({
                    success: true,
                    message: "Current Tokocrypto Spot Balance",
                    balance: j.account.totalWalletBalance,
                    quoteAsset: tokoQuote,
                  });
                }
              }
            } catch {}
          }
        }
      } catch (err: any) {
        console.error("Failed to load configuration from backend:", err);
      }
    };

    fetchConfig();
  }, []);

  // 2. Fungsi Tes Koneksi API (Binance atau Tokocrypto)
  const handleTestConnection = async () => {
    if (activeExchangeForm === "TOKOCRYPTO") {
      if (!tokocryptoApiKey.trim() || !tokocryptoApiSecret.trim()) {
        toast.error("Validation Failed", {
          description: "Please enter Tokocrypto API Key and API Secret first.",
        });
        return;
      }

      try {
        setTestingConnection(true);
        setTokocryptoTestResult(null);

        const res = await authFetch("/api/config/test-tokocrypto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: tokocryptoApiKey.trim(),
            apiSecret: tokocryptoApiSecret.trim(),
            quoteAsset: tokocryptoQuoteAsset,
          }),
        });

        const data = await res.json();
        const rawBal =
          typeof data.balance === "number" ? data.balance : data.balance?.free;
        const bal = typeof rawBal === "number" ? rawBal : undefined;
        setTokocryptoTestResult({
          success: Boolean(data.success),
          message: data.message,
          balance: bal,
          quoteAsset: tokocryptoQuoteAsset,
        });

        if (data.success) {
          toast.success("Tokocrypto Connection Successful!", {
            description: data.message,
          });
        } else {
          toast.error("Tokocrypto Connection Failed", {
            description: data.message,
          });
        }
      } catch (err: any) {
        toast.error("Failed to Test Connection", {
          description:
            err.message || "Make sure local backend is running on port 3030.",
        });
      } finally {
        setTestingConnection(false);
      }
      return;
    }

    // Default: Binance Futures (Testnet vs Live based on binanceSubTab)
    const isTestnet = binanceSubTab === "TESTNET";
    const currentKey = isTestnet ? testnetApiKey : liveApiKey;
    const currentSecret = isTestnet ? testnetApiSecret : liveApiSecret;

    if (!currentKey.trim() || !currentSecret.trim()) {
      toast.error("Validation Failed", {
        description: `Please enter Binance (${isTestnet ? "Testnet" : "Live"}) API Key and Secret first.`,
      });
      return;
    }

    try {
      setTestingConnection(true);
      if (isTestnet) setTestnetTestResult(null);
      else setLiveTestResult(null);

      const res = await authFetch("/api/config/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: currentKey.trim(),
          apiSecret: currentSecret.trim(),
          environment: binanceSubTab,
        }),
      });

      const data = await res.json();
      const bal = typeof data.balance === "number" ? data.balance : undefined;
      const resObj = {
        ...data,
        balance: bal,
        quoteAsset: "USDT",
      };
      if (isTestnet) setTestnetTestResult(resObj);
      else setLiveTestResult(resObj);

      if (data.success) {
        toast.success(`Binance ${binanceSubTab} Connection Successful!`, {
          description: data.message,
        });
      } else {
        toast.error(`Binance ${binanceSubTab} Connection Failed`, {
          description: data.message,
        });
      }
    } catch (err: any) {
      toast.error("Failed to Test Connection", {
        description:
          err.message || "Make sure local backend is running on port 3030.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // 3. Save Configuration ke Database Lokal
  const handleSave = async () => {
    try {
      setIsSaving(true);

      let finalTargetCoins = targetCoins.trim();
      if (coinInput.trim()) {
        let clean = coinInput.trim().toUpperCase();
        if (
          targetExchange === "TOKOCRYPTO" ||
          activeExchangeForm === "TOKOCRYPTO"
        ) {
          // Normalize for Tokocrypto if user types coin
          const quote = tokocryptoQuoteAsset;
          if (!clean.includes("_")) {
            clean = clean.endsWith(quote)
              ? `${clean.slice(0, -quote.length)}_${quote}`
              : `${clean}_${quote}`;
          }
        } else if (!clean.endsWith("USDT")) {
          clean = `${clean}USDT`;
        }
        const existingList = finalTargetCoins
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean);
        if (!existingList.includes(clean)) {
          finalTargetCoins = [...existingList, clean].join(",");
          setTargetCoins(finalTargetCoins);
        }
        setCoinInput("");
      }

      const activeBinanceKey =
        binanceSubTab === "LIVE" ? liveApiKey : testnetApiKey;
      const activeBinanceSecret =
        binanceSubTab === "LIVE" ? liveApiSecret : testnetApiSecret;

      const payload = {
        targetExchange,
        clientToken: token.trim(),

        // 🧪 Binance Testnet Dedicated Fields
        testnetApiKey: testnetApiKey.trim(),
        testnetApiSecret: testnetApiSecret.trim(),
        testnetAutoExecute,
        testnetMarginType,
        testnetLeverage: Number(testnetLeverage),
        testnetTradeDirection,
        testnetMinScore: Number(testnetMinScore),
        testnetBlockLongOnBtcBearish: Boolean(testnetBlockLongOnBtcBearish),
        testnetTpMode,
        testnetCustomTpRoiPct: Number(testnetCustomTpRoiPct),
        testnetCustomTpSplitRatio: Number(testnetCustomTpSplitRatio),
        testnetSlMode,
        testnetCustomSlValue: Number(testnetCustomSlValue),
        testnetRiskMode:
          !isTokoForm && binanceSubTab === "TESTNET"
            ? riskMode
            : testnetRiskMode,
        testnetRiskAmountUsd:
          !isTokoForm && binanceSubTab === "TESTNET"
            ? Number(riskAmountUsd)
            : Number(testnetRiskAmountUsd),
        testnetRiskPerTradePct: Number(testnetRiskPerTradePct),
        testnetMaxOpenPositions: Number(testnetMaxOpenPositions),
        testnetCoinFilterMode:
          !isTokoForm && binanceSubTab === "TESTNET"
            ? coinFilterMode
            : testnetCoinFilterMode,
        testnetTargetCoins:
          !isTokoForm && binanceSubTab === "TESTNET"
            ? finalTargetCoins
            : testnetTargetCoins,

        // 🚀 Binance Live Dedicated Fields
        liveApiKey: liveApiKey.trim(),
        liveApiSecret: liveApiSecret.trim(),
        liveAutoExecute,
        liveMarginType,
        liveLeverage: Number(liveLeverage),
        liveTradeDirection,
        liveMinScore: Number(liveMinScore),
        liveBlockLongOnBtcBearish: Boolean(liveBlockLongOnBtcBearish),
        liveTpMode,
        liveCustomTpRoiPct: Number(liveCustomTpRoiPct),
        liveCustomTpSplitRatio: Number(liveCustomTpSplitRatio),
        liveSlMode,
        liveCustomSlValue: Number(liveCustomSlValue),
        liveRiskMode:
          !isTokoForm && binanceSubTab === "LIVE" ? riskMode : liveRiskMode,
        liveRiskAmountUsd:
          !isTokoForm && binanceSubTab === "LIVE"
            ? Number(riskAmountUsd)
            : Number(liveRiskAmountUsd),
        liveRiskPerTradePct: Number(liveRiskPerTradePct),
        liveMaxOpenPositions: Number(liveMaxOpenPositions),
        liveCoinFilterMode:
          !isTokoForm && binanceSubTab === "LIVE"
            ? coinFilterMode
            : liveCoinFilterMode,
        liveTargetCoins:
          !isTokoForm && binanceSubTab === "LIVE"
            ? finalTargetCoins
            : liveTargetCoins,

        // Tokocrypto Dedicated Fields
        tokocryptoApiKey: tokocryptoApiKey.trim(),
        tokocryptoApiSecret: tokocryptoApiSecret.trim(),
        tokocryptoQuoteAsset,
        tokocryptoAutoExecute,
        tokocryptoDryRun,
        tokocryptoRiskPerTradePct: Number(tokocryptoRiskPerTradePct),
        tokocryptoMaxOpenPositions: Number(tokocryptoMaxOpenPositions),
        tokocryptoCoinFilterMode: isTokoForm
          ? coinFilterMode
          : tokocryptoCoinFilterMode,
        tokocryptoTargetCoins: isTokoForm
          ? finalTargetCoins
          : tokocryptoTargetCoins,
        tokocryptoTpMode,
        tokocryptoCustomTpRoiPct: Number(tokocryptoCustomTpRoiPct),
        tokocryptoCustomTpSplitRatio: Number(tokocryptoCustomTpSplitRatio),
        tokocryptoSlMode,
        tokocryptoCustomSlValue: Number(tokocryptoCustomSlValue),

        // Legacy Binance Sync
        environment: binanceSubTab,
        binanceApiKey: activeBinanceKey.trim(),
        binanceApiSecret: activeBinanceSecret.trim(),
        binanceAutoExecute:
          binanceSubTab === "LIVE" ? liveAutoExecute : testnetAutoExecute,
        marginType,
        leverage: Number(leverage),
        binanceTradeDirection: tradeDirection,
        binanceMinScore: Number(minScore),
        binanceBlockLongOnBtcBearish: Boolean(blockLongOnBtcBearish),
        binanceRiskMode: riskMode,
        binanceRiskAmountUsd: Number(riskAmountUsd),
        binanceRiskPerTradePct: Number(riskPerTradePct),
        binanceMaxOpenPositions: Number(maxOpenPositions),
        binanceCoinFilterMode: coinFilterMode,
        binanceTargetCoins: finalTargetCoins,
      };

      const res = await authFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Saved!", {
          description:
            "Bot credentials and configuration successfully saved to local SQLite.",
        });
        setIsConfirmModalOpen(false);
      } else {
        toast.error("Failed to Save", { description: data.message });
      }
    } catch (err: any) {
      toast.error("Network Error", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const getRiskLevel = (totalPct: number) => {
    if (totalPct <= 5.0) {
      return {
        label: "Low Risk (Safe)",
        color: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
      };
    }
    if (totalPct <= 10.0) {
      return {
        label: "Moderate Risk",
        color: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
      };
    }
    return {
      label: "High Risk (Danger)",
      color: "text-destructive dark:text-red-400",
      bg: "bg-destructive/10",
      border: "border-destructive/20",
    };
  };

  const binanceTotalRiskPct =
    riskMode === "FIXED_USD" &&
    typeof activeTestResult?.balance === "number" &&
    activeTestResult.balance > 0
      ? ((Number(riskAmountUsd) * Number(maxOpenPositions)) /
          activeTestResult.balance) *
        100
      : Number(riskPerTradePct) * Number(maxOpenPositions);
  const binanceRiskInfo = getRiskLevel(binanceTotalRiskPct);

  const tokoTotalCapital =
    Number(tokocryptoRiskPerTradePct) * Number(tokocryptoMaxOpenPositions);

  const coinList = targetCoins
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const handleAddCoin = (symbol: string) => {
    let clean = symbol.trim().toUpperCase();
    if (!clean) return;
    if (activeExchangeForm === "TOKOCRYPTO") {
      const quote = tokocryptoQuoteAsset;
      if (!clean.includes("_")) {
        clean = clean.endsWith(quote)
          ? `${clean.slice(0, -quote.length)}_${quote}`
          : `${clean}_${quote}`;
      }
    } else {
      if (!clean.endsWith("USDT")) {
        clean = `${clean}USDT`;
      }
    }
    if (!coinList.includes(clean)) {
      const updated = [...coinList, clean].join(",");
      setTargetCoins(updated);
    }
    setCoinInput("");
  };

  const handleRemoveCoin = (symbol: string) => {
    const updated = coinList.filter((c) => c !== symbol).join(",");
    setTargetCoins(updated);
  };

  const handleSetPreset = (preset: string[]) => {
    if (activeExchangeForm === "TOKOCRYPTO") {
      const quote = tokocryptoQuoteAsset;
      const formatted = preset.map((c) => {
        let sym = c.trim().toUpperCase();
        if (sym.startsWith("1000")) {
          sym = sym.slice(4);
        }
        if (sym.endsWith("USDT")) {
          sym = sym.slice(0, -4);
        } else if (sym.endsWith("BIDR")) {
          sym = sym.slice(0, -4);
        }
        return `${sym}_${quote}`;
      });
      setTargetCoins(formatted.join(","));
    } else {
      setTargetCoins(preset.join(","));
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {activeExchangeForm === "TOKOCRYPTO" ? (
              <>
                <Coins className="size-6 text-amber-500" />
                Tokocrypto Spot Configuration
              </>
            ) : (
              <>
                <Layers className="size-6 text-primary" />
                Binance Futures Configuration
              </>
            )}
          </h2>
          <p className="text-sm text-muted-foreground hidden sm:block">
            {activeExchangeForm === "TOKOCRYPTO"
              ? "OpenAPI v1 credentials, quote asset, simulation mode, and spot filters for Tokocrypto."
              : "API keys, license token, leverage, margin settings, and trading filters for Binance Futures."}
          </p>
        </div>

        {forcedExchange ? (
          <Badge
            variant="outline"
            className={`text-xs px-3 py-1.5 gap-1.5 font-medium w-fit ${
              activeExchangeForm === "TOKOCRYPTO"
                ? "border-amber-500/30 bg-amber-500/5 text-amber-600"
                : "border-primary/30 bg-primary/5 text-primary"
            }`}
          >
            {activeExchangeForm === "TOKOCRYPTO" ? (
              <>
                <Coins className="size-3.5 text-amber-500" />
                Tokocrypto Spot
              </>
            ) : (
              <>
                <Layers className="size-3.5" />
                Binance Futures
              </>
            )}
          </Badge>
        ) : (
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg border w-fit">
            <Button
              type="button"
              size="sm"
              variant={activeExchangeForm === "BINANCE" ? "default" : "ghost"}
              onClick={() => {
                setActiveExchangeForm("BINANCE");
              }}
              className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <Layers className="size-3.5" />
              Binance Futures
            </Button>
            <Button
              type="button"
              size="sm"
              variant={
                activeExchangeForm === "TOKOCRYPTO" ? "default" : "ghost"
              }
              onClick={() => {
                setActiveExchangeForm("TOKOCRYPTO");
              }}
              className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <Coins className="size-3.5 text-amber-500" />
              Tokocrypto Spot
            </Button>
          </div>
        )}
      </div>

      {/* Binance Sub-Tab Switcher (Testnet vs Live) */}
      {activeExchangeForm === "BINANCE" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-xl border bg-muted/30">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={binanceSubTab === "TESTNET" ? "default" : "outline"}
              onClick={() => setBinanceSubTab("TESTNET")}
              className={`h-8 text-xs font-semibold gap-1.5 cursor-pointer ${
                binanceSubTab === "TESTNET"
                  ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                  : "border-border"
              }`}
            >
              <FlaskConicalIcon className="size-3.5 text-amber-500" />
              Binance Testnet (Demo)
              {testnetAutoExecute && (
                <Badge className="bg-emerald-500 text-white text-[9px] px-1 py-0 h-3.5 ml-1">
                  AUTO ON
                </Badge>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={binanceSubTab === "LIVE" ? "default" : "outline"}
              onClick={() => setBinanceSubTab("LIVE")}
              className={`h-8 text-xs font-semibold gap-1.5 cursor-pointer ${
                binanceSubTab === "LIVE"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                  : "border-border"
              }`}
            >
              <GlobeIcon className="size-3.5 text-emerald-500" />
              Binance Live (Real Funds)
              {liveAutoExecute && (
                <Badge className="bg-red-500 text-white text-[9px] px-1 py-0 h-3.5 ml-1">
                  AUTO LIVE
                </Badge>
              )}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="font-medium text-foreground">
              Active Configuration:
            </span>
            <Badge
              variant="outline"
              className={
                binanceSubTab === "LIVE"
                  ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10 font-mono text-[10px]"
                  : "border-amber-500/40 text-amber-600 bg-amber-500/10 font-mono text-[10px]"
              }
            >
              {binanceSubTab === "LIVE"
                ? "🚀 LIVE REAL TRADING"
                : "🧪 TESTNET DEMO"}
            </Badge>
          </div>
        </div>
      )}

      {/* Baris 1: Grid 2 Kolom Seimbang (Kredensial & Manajemen Risiko) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        {/* Card 1: Kredensial Exchange Aktif */}
        {activeExchangeForm === "BINANCE" ? (
          <Card className="shadow-sm flex flex-col justify-between">
            <CardHeader className="p-3.5 sm:p-6 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyIcon className="size-4 text-primary" />
                  Binance {binanceSubTab === "LIVE" ? "Live" : "Testnet"}{" "}
                  Credentials
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    binanceSubTab === "LIVE"
                      ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                      : "border-amber-500/30 text-amber-600 bg-amber-500/5"
                  }`}
                >
                  {binanceSubTab === "LIVE"
                    ? "Futures Real Funds"
                    : "Futures Testnet Demo"}
                </Badge>
              </div>
              <CardDescription className="text-xs hidden sm:block">
                {binanceSubTab === "LIVE"
                  ? "Binance Futures Live API credentials with futures trading permissions."
                  : "Binance Futures Testnet API credentials from testnet.binancefuture.com."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-6 pt-0 sm:pt-0 space-y-4 sm:space-y-5 flex-1">
              {/* Client Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="client-token"
                    className="text-xs font-semibold"
                  >
                    Client Token (CryptoSpike License)
                  </Label>
                  {token && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-500/30"
                    >
                      Token Installed
                    </Badge>
                  )}
                </div>
                <Input
                  id="client-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="border-t pt-4 space-y-4">
                {binanceSubTab === "TESTNET" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-amber-600 dark:text-amber-500">
                        Binance Testnet API Key
                      </Label>
                      <Input
                        value={testnetApiKey}
                        onChange={(e) => setTestnetApiKey(e.target.value)}
                        placeholder="Enter Binance Testnet API Key..."
                        className="font-mono text-xs border-amber-500/30 focus-visible:ring-amber-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-amber-600 dark:text-amber-500">
                          Binance Testnet API Secret
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-100/50"
                          onClick={() =>
                            setShowTestnetSecret(!showTestnetSecret)
                          }
                        >
                          {showTestnetSecret ? "Hide" : "Show"}
                        </Button>
                      </div>
                      <Input
                        type={showTestnetSecret ? "text" : "password"}
                        value={testnetApiSecret}
                        onChange={(e) => setTestnetApiSecret(e.target.value)}
                        placeholder="Enter Binance Testnet API Secret..."
                        className="font-mono text-xs border-amber-500/30 focus-visible:ring-amber-500"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-emerald-600 dark:text-emerald-500">
                        Binance Live API Key
                      </Label>
                      <Input
                        value={liveApiKey}
                        onChange={(e) => setLiveApiKey(e.target.value)}
                        placeholder="Enter Binance Live API Key..."
                        className="font-mono text-xs border-emerald-500/30 focus-visible:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-emerald-600 dark:text-emerald-500">
                          Binance Live API Secret
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/50"
                          onClick={() => setShowLiveSecret(!showLiveSecret)}
                        >
                          {showLiveSecret ? "Hide" : "Show"}
                        </Button>
                      </div>
                      <Input
                        type={showLiveSecret ? "text" : "password"}
                        value={liveApiSecret}
                        onChange={(e) => setLiveApiSecret(e.target.value)}
                        placeholder="Enter Binance Live API Secret..."
                        className="font-mono text-xs border-emerald-500/30 focus-visible:ring-emerald-500"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Feedback Hasil Test Connection */}
              {(binanceSubTab === "LIVE"
                ? liveTestResult
                : testnetTestResult) && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    (binanceSubTab === "LIVE"
                      ? liveTestResult
                      : testnetTestResult)!.success
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {(binanceSubTab === "LIVE"
                    ? liveTestResult
                    : testnetTestResult)!.success ? (
                    <ShieldCheck className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {(binanceSubTab === "LIVE"
                        ? liveTestResult
                        : testnetTestResult)!.success
                        ? `Binance ${binanceSubTab} Verified`
                        : "Verification Failed"}
                    </p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {
                        (binanceSubTab === "LIVE"
                          ? liveTestResult
                          : testnetTestResult)!.message
                      }
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm flex flex-col justify-between">
            <CardHeader className="p-3.5 sm:p-6 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyIcon className="size-4 text-amber-500" />
                  Tokocrypto Spot Credentials
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] text-amber-600 border-amber-500/30 bg-amber-500/5"
                >
                  Spot Market
                </Badge>
              </div>
              <CardDescription className="text-xs hidden sm:block">
                Tokocrypto OpenAPI v1 credentials using HMAC-SHA256 signature.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-6 pt-0 sm:pt-0 space-y-4 flex-1">
              {/* Client Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="client-token"
                    className="text-xs font-semibold"
                  >
                    Client Token (CryptoSpike License)
                  </Label>
                  {token && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-500/30"
                    >
                      Token Installed
                    </Badge>
                  )}
                </div>
                <Input
                  id="client-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="border-t pt-3 space-y-3">
                {/* Tokocrypto API Key */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-amber-600 dark:text-amber-500">
                    Tokocrypto API Key
                  </Label>
                  <Input
                    value={tokocryptoApiKey}
                    onChange={(e) => setTokocryptoApiKey(e.target.value)}
                    placeholder="Enter Tokocrypto API Key..."
                    className="font-mono text-xs border-amber-500/30 focus-visible:ring-amber-500"
                  />
                </div>

                {/* Tokocrypto API Secret */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-amber-600 dark:text-amber-500">
                      Tokocrypto API Secret
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-100/50"
                      onClick={() =>
                        setShowTokocryptoSecret(!showTokocryptoSecret)
                      }
                    >
                      {showTokocryptoSecret ? "Hide" : "Show"}
                    </Button>
                  </div>
                  <Input
                    type={showTokocryptoSecret ? "text" : "password"}
                    value={tokocryptoApiSecret}
                    onChange={(e) => setTokocryptoApiSecret(e.target.value)}
                    placeholder="Enter Tokocrypto API Secret..."
                    className="font-mono text-xs border-amber-500/30 focus-visible:ring-amber-500"
                  />
                </div>

                {/* Quote Asset Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Quote Trading Asset
                  </Label>
                  <select
                    value={tokocryptoQuoteAsset}
                    onChange={(e) =>
                      setTokocryptoQuoteAsset(e.target.value as "USDT" | "BIDR")
                    }
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="USDT" className="text-black">
                      USDT (Tether USD) — e.g. BTC_USDT, ETH_USDT
                    </option>
                    <option value="BIDR" className="text-black">
                      BIDR (Binance Indonesia Rupiah) — e.g. BTC_BIDR
                    </option>
                  </select>
                </div>
              </div>

              {/* Feedback Hasil Test Connection Tokocrypto */}
              {tokocryptoTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    tokocryptoTestResult.success
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {tokocryptoTestResult.success ? (
                    <ShieldCheck className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {tokocryptoTestResult.success
                        ? "Tokocrypto Verified"
                        : "Verification Failed"}
                    </p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {tokocryptoTestResult.message}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Card 2: Pengaturan Risiko & Eksekusi Bot */}
        <Card className="shadow-sm flex flex-col justify-between">
          <CardHeader className="p-3.5 sm:p-6 pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckIcon className="size-4 text-primary" />
                Risk & Execution Management
              </CardTitle>
              {activeExchangeForm === "TOKOCRYPTO" ? (
                <Badge
                  variant="outline"
                  className="text-[10px] text-amber-600 border-amber-500/30"
                >
                  Spot Execution
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] text-primary border-primary/30"
                >
                  Futures Execution
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs hidden sm:block">
              {activeExchangeForm === "TOKOCRYPTO"
                ? "Spot trading execution parameters with Multi-Stage TP (50/30/20) & Smart Merge."
                : "Execution parameters when a signal is received on Binance Futures."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-6 pt-0 sm:pt-0 space-y-4 text-xs flex-1">
            {/* Auto Execute Switch */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
              <div className="space-y-0.5">
                <Label
                  htmlFor="auto-exec"
                  className="text-xs font-semibold cursor-pointer"
                >
                  Auto-Trade
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {activeExchangeForm === "TOKOCRYPTO"
                    ? "Auto-buy LONG signals & 4s TP/SL monitor (turn OFF to HOLD assets)"
                    : "Automatic execution of Binance Futures signals"}
                </p>
              </div>
              <Switch
                id="auto-exec"
                checked={autoExecute}
                onCheckedChange={setAutoExecute}
              />
            </div>

            {/* Dry-Run Simulation Switch (Tokocrypto Spot) */}
            {activeExchangeForm === "TOKOCRYPTO" && (
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Label
                      htmlFor="dry-run"
                      className="text-xs font-semibold cursor-pointer text-amber-600 dark:text-amber-500"
                    >
                      Tokocrypto Dry-Run Mode (Simulation)
                    </Label>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 h-3.5 border-amber-500/40 text-amber-600"
                    >
                      Paper Trading
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Simulate spot buy & TP/SL monitoring locally without real
                    funds.
                  </p>
                </div>
                <Switch
                  id="dry-run"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                />
              </div>
            )}

            {/* Margin Type & Leverage (Only relevant for Binance Futures) */}
            {activeExchangeForm === "BINANCE" ? (
              <>
                <div className="space-y-1.5 mt-2">
                  <Label htmlFor="margin-type" className="text-xs font-medium">
                    Margin Type
                  </Label>
                  <select
                    id="margin-type"
                    value={marginType}
                    onChange={(e) =>
                      setMarginType(e.target.value as "ISOLATED" | "CROSSED")
                    }
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="ISOLATED" className="text-black">
                      ISOLATED
                    </option>
                    <option value="CROSSED" className="text-black">
                      CROSS
                    </option>
                  </select>
                </div>

                <div className="space-y-1.5 mt-2">
                  <Label htmlFor="leverage" className="text-xs font-medium">
                    Default Leverage (x)
                  </Label>
                  <Input
                    id="leverage"
                    type="number"
                    min={1}
                    max={125}
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="trade-direction"
                      className="text-xs font-medium"
                    >
                      Allowed Position Side
                    </Label>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                        tradeDirection === "LONG_ONLY"
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : tradeDirection === "SHORT_ONLY"
                            ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            : "bg-primary/10 text-primary border border-primary/20"
                      }`}
                    >
                      {tradeDirection === "LONG_ONLY"
                        ? "LONG ONLY"
                        : tradeDirection === "SHORT_ONLY"
                          ? "SHORT ONLY"
                          : "BOTH SIDES"}
                    </span>
                  </div>
                  <select
                    id="trade-direction"
                    value={tradeDirection}
                    onChange={(e) =>
                      setTradeDirection(
                        e.target.value as "BOTH" | "LONG_ONLY" | "SHORT_ONLY",
                      )
                    }
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="BOTH" className="text-black">
                      Both Sides (Long &amp; Short)
                    </option>
                    <option value="LONG_ONLY" className="text-black">
                      Long Only
                    </option>
                    <option value="SHORT_ONLY" className="text-black">
                      Short Only
                    </option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    Filter bot execution to Long, Short, or both positions on
                    Binance {binanceSubTab === "LIVE" ? "Live" : "Testnet"}.
                  </p>
                </div>

                {/* Minimum Signal Score Filter */}
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="min-score" className="text-xs font-medium">
                      Minimum Signal Score
                    </Label>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                      {minScore > 0 ? `>= ${minScore}` : "ALL SIGNALS"}
                    </span>
                  </div>
                  <select
                    id="min-score"
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value={0} className="text-black">
                      All Scores (No Minimum Filter - Default)
                    </option>
                    <option value={80} className="text-black">
                      Score 80+ (Standard Quality)
                    </option>
                    <option value={90} className="text-black">
                      Score 90+ (High Quality)
                    </option>
                    <option value={95} className="text-black">
                      Score 95+ (Elite Signals)
                    </option>
                    <option value={99} className="text-black">
                      Score 99 (Perfect Only)
                    </option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    Only execute signals with a quality score meeting or
                    exceeding this threshold.
                  </p>
                </div>

                {/* Block LONG on BTC Bearish/Choppy */}
                <div className="space-y-1.5 mt-2 p-2.5 rounded-lg border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="btc-trend-guard"
                      className="text-xs font-medium flex items-center gap-1.5"
                    >
                      <ShieldCheck className="size-3.5 text-emerald-500" />
                      Block LONG on BTC Bearish / Choppy
                    </Label>
                    <Switch
                      id="btc-trend-guard"
                      checked={blockLongOnBtcBearish}
                      onCheckedChange={setBlockLongOnBtcBearish}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Automatically protects against market dumps by rejecting
                    LONG positions when BTC macro trend is Bearish or Choppy.
                    SHORT positions remain active.
                  </p>
                </div>
              </>
            ) : (
              <div className="p-2.5 rounded-lg border bg-muted/30 text-[11px] text-muted-foreground space-y-1">
                <span className="font-semibold text-foreground block">
                  Market: Spot 1x Cash-Only
                </span>
                <p>
                  Tokocrypto Spot operates without leverage or margin
                  liquidation risks. Each buy position is monitored
                  automatically with targets of{" "}
                  <strong>Multi-Stage TP (50/30/20)</strong> with{" "}
                  <strong>Smart Merge & Stop Loss</strong>.
                </p>
              </div>
            )}

            {/* Risk Allocation Mode (Only relevant for Binance Futures) */}
            {activeExchangeForm !== "TOKOCRYPTO" && (
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="risk-mode" className="text-xs font-medium">
                    Risk Allocation Mode
                  </Label>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                    {riskMode === "FIXED_USD"
                      ? "FIXED USD ($)"
                      : riskMode === "RISK_AT_SL"
                        ? "RISK AT SL (%)"
                        : "PERCENTAGE (%)"}
                  </span>
                </div>
                <select
                  id="risk-mode"
                  value={riskMode}
                  onChange={(e) =>
                    setRiskMode(e.target.value as RiskMode)
                  }
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="PERCENTAGE" className="text-black">
                    Percentage (% of Wallet Balance)
                  </option>
                  <option value="FIXED_USD" className="text-black">
                    Fixed USD Amount ($ Margin per Trade)
                  </option>
                  <option value="RISK_AT_SL" className="text-black">
                    Risk at Stop Loss (% of Wallet Lost if SL Hits)
                  </option>
                </select>
                <p className="text-[10px] text-muted-foreground">
                  {riskMode === "FIXED_USD"
                    ? "Allocate a locked dollar margin per trade (ideal for small balances)."
                    : riskMode === "RISK_AT_SL"
                      ? "Position size follows the signal SL distance so every stop loss costs the same % of balance (wider SL = smaller position). Margin per trade is capped at 20% of balance."
                      : "Dynamically calculate margin based on a percentage of available wallet balance."}
                </p>
              </div>
            )}

            {/* Risk / Allocation Numeric Input */}
            <div className="space-y-1.5 mt-2">
              <Label
                htmlFor={
                  activeExchangeForm !== "TOKOCRYPTO" &&
                  riskMode === "FIXED_USD"
                    ? "risk-usd"
                    : "risk-pct"
                }
                className="text-xs font-medium"
              >
                {activeExchangeForm === "TOKOCRYPTO"
                  ? `Allocation Per Trade (${tokocryptoQuoteAsset === "BIDR" ? "Rp BIDR" : "$ USDT"} Cash)`
                  : riskMode === "FIXED_USD"
                    ? "Fixed Margin Amount ($ USDT)"
                    : riskMode === "RISK_AT_SL"
                      ? "Loss at Stop Loss (% Wallet Balance)"
                      : "Risk Per Trade (% Wallet Balance)"}
              </Label>

              {activeExchangeForm !== "TOKOCRYPTO" &&
              riskMode === "FIXED_USD" ? (
                <>
                  <Input
                    id="risk-usd"
                    type="number"
                    step="1"
                    min="1"
                    max="100000"
                    value={riskAmountUsd}
                    onChange={(e) => setRiskAmountUsd(Number(e.target.value))}
                    className="h-8 text-xs font-mono"
                    placeholder="e.g. 10.0"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    * Margin per trade is locked at{" "}
                    <strong>${Number(riskAmountUsd).toFixed(2)} USDT</strong>{" "}
                    regardless of balance changes.
                  </p>
                </>
              ) : (
                <Input
                  id="risk-pct"
                  type="number"
                  step={
                    activeExchangeForm === "TOKOCRYPTO"
                      ? tokocryptoQuoteAsset === "BIDR"
                        ? "10000"
                        : "0.5"
                      : "0.1"
                  }
                  min={
                    activeExchangeForm === "TOKOCRYPTO"
                      ? tokocryptoQuoteAsset === "BIDR"
                        ? "50000"
                        : "5"
                      : "0.1"
                  }
                  max={
                    activeExchangeForm === "TOKOCRYPTO"
                      ? tokocryptoQuoteAsset === "BIDR"
                        ? "100000000"
                        : "100000"
                      : "100"
                  }
                  value={riskPerTradePct}
                  onChange={(e) => setRiskPerTradePct(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. 2.0"
                />
              )}

              {activeExchangeForm === "TOKOCRYPTO" && (
                <p className="text-[10px] text-muted-foreground">
                  * Minimum Tokocrypto:{" "}
                  {tokocryptoQuoteAsset === "BIDR"
                    ? "Rp 100.000"
                    : "$5.00 USDT"}{" "}
                  per order spot.
                </p>
              )}
              {typeof activeTestResult?.balance === "number" ? (
                activeExchangeForm === "TOKOCRYPTO" ? (
                  <div className="text-[10px] sm:text-xs bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 p-2.5 rounded-md mt-2 space-y-1.5">
                    <div className="flex items-center justify-between font-medium pb-1 border-b border-amber-500/20">
                      <span className="text-muted-foreground">
                        Available Cash:
                      </span>
                      <span className="font-mono font-semibold">
                        {activeTestResult.balance.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || tokocryptoQuoteAsset}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Order Allocation:
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        {tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}
                        {Number(riskPerTradePct).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || tokocryptoQuoteAsset}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Max Capital Needed ({maxOpenPositions} Coins):
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        {tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}
                        {tokoTotalCapital.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || tokocryptoQuoteAsset}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-amber-500/20">
                      <span className="text-muted-foreground">
                        Remaining Cash Reserve:
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          activeTestResult.balance - tokoTotalCapital >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive dark:text-red-400"
                        }`}
                      >
                        {tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}
                        {(
                          activeTestResult.balance - tokoTotalCapital
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || tokocryptoQuoteAsset}
                      </span>
                    </div>
                    {tokoTotalCapital > activeTestResult.balance && (
                      <p className="text-[10px] text-destructive dark:text-red-400 font-semibold pt-1 border-t border-destructive/20">
                        * Warning: Total allocation (
                        {tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}
                        {tokoTotalCapital.toLocaleString()}) exceeds current
                        cash balance (
                        {tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}
                        {activeTestResult.balance.toLocaleString()}).
                      </p>
                    )}
                  </div>
                ) : (
                  <div
                    className={`text-[10px] sm:text-xs ${binanceRiskInfo.color} ${binanceRiskInfo.bg} p-2.5 rounded-md border ${binanceRiskInfo.border} mt-2 space-y-1.5`}
                  >
                    <div className="flex items-center justify-between font-medium pb-1 border-b border-current/10">
                      <span className="text-muted-foreground">
                        Futures Risk Level:
                      </span>
                      <span className="font-semibold">
                        {binanceRiskInfo.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Wallet Balance:
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        {activeTestResult.balance.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || "USDT"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {riskMode === "FIXED_USD"
                          ? "Margin per Trade (Fixed):"
                          : `Margin per Trade (${riskPerTradePct}%):`}
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        ~
                        {riskMode === "FIXED_USD"
                          ? Number(riskAmountUsd).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : (
                              (activeTestResult.balance *
                                Number(riskPerTradePct)) /
                              100
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{" "}
                        {activeTestResult.quoteAsset || "USDT"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Est. Contract Size ({leverage}x Lev):
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        ~
                        {riskMode === "FIXED_USD"
                          ? (Number(riskAmountUsd) * leverage).toLocaleString(
                              undefined,
                              {
                                maximumFractionDigits: 2,
                              },
                            )
                          : (
                              ((activeTestResult.balance *
                                Number(riskPerTradePct)) /
                                100) *
                              leverage
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{" "}
                        {activeTestResult.quoteAsset || "USDT"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-current/10">
                      <span className="text-muted-foreground">
                        Worst Case ({maxOpenPositions} Pos):
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        ~
                        {riskMode === "FIXED_USD"
                          ? (
                              Number(riskAmountUsd) * Number(maxOpenPositions)
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : (
                              (activeTestResult.balance * binanceTotalRiskPct) /
                              100
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{" "}
                        {activeTestResult.quoteAsset || "USDT"} (
                        {binanceTotalRiskPct.toFixed(1)}%)
                      </span>
                    </div>
                    {binanceTotalRiskPct > 100 && (
                      <p className="text-[10px] text-destructive dark:text-red-400 font-semibold pt-1 border-t border-destructive/20">
                        * Warning: Total margin allocation (
                        {binanceTotalRiskPct.toFixed(1)}
                        %) exceeds 100% of wallet balance. Reduce Risk per Trade
                        or Max Open Positions.
                      </p>
                    )}
                  </div>
                )
              ) : (
                <p className="text-[10px] text-muted-foreground italic mt-1">
                  * Please run 'Test Connection' first to see estimated
                  allocation amount.
                </p>
              )}
            </div>

            {/* Max Open Positions */}
            <div className="space-y-1.5">
              <Label htmlFor="max-pos" className="text-xs font-medium">
                Max Open Positions
              </Label>
              <Input
                id="max-pos"
                type="number"
                min={1}
                max={20}
                value={maxOpenPositions}
                onChange={(e) => setMaxOpenPositions(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>

            {/* 🎯 Take Profit Execution Mode (Intercept TP) */}
            <div className="space-y-2 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <Label htmlFor="tp-mode" className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="size-3.5 text-primary" />
                  Take Profit Target Mode
                </Label>
                <Badge variant="outline" className="text-[10px] font-mono font-semibold uppercase">
                  {tpMode === "TP1_ONLY"
                    ? "100% TP1"
                    : tpMode === "TP2_ONLY"
                      ? "50% TP1 + 50% TP2"
                      : tpMode === "CUSTOM_ROI"
                        ? "Custom ROI (+" + customTpRoiPct + "%)"
                        : tpMode === "CUSTOM_SPLIT"
                          ? "Split " + customTpSplitRatio + "% @ +" + customTpRoiPct + "% ROI"
                          : "Multi-TP (50/30/20)"}
                </Badge>
              </div>

              <select
                id="tp-mode"
                value={tpMode}
                onChange={(e) =>
                  setTpMode(
                    e.target.value as "MULTI_TP" | "TP1_ONLY" | "TP2_ONLY" | "CUSTOM_ROI" | "CUSTOM_SPLIT" | "CUSTOM_SPLIT",
                  )
                }
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="MULTI_TP" className="text-black">
                  Multi-Stage (50% TP1, 30% TP2, 20% Moonbag/Trailing) [Default]
                </option>
                <option value="CUSTOM_SPLIT" className="text-black">
                  Custom Split (e.g. 70% at Target ROI + 30% Moonbag with Auto-BEP)
                </option>
                <option value="TP1_ONLY" className="text-black">
                  100% Sell at TP1 Only (Scalper Hit & Run / Fast Profit Lock)
                </option>
                <option value="TP2_ONLY" className="text-black">
                  50% at TP1 + 50% Full Sell at TP2 (Balanced Target)
                </option>
                <option value="CUSTOM_ROI" className="text-black">
                  100% Sell at Custom Target ROI % (Fixed Target Return)
                </option>
              </select>

              {/* TP Mode Information Cards */}
              {tpMode === "TP1_ONLY" && (
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  ⚡ <strong>Fast Profit Lock:</strong> 100% of position size is placed as a limit order at <strong>TP1</strong> price. Once TP1 is reached, the entire position is closed immediately and profit is secured with zero residual exposure.
                </div>
              )}

              {tpMode === "TP2_ONLY" && (
                <div className="p-2 rounded bg-primary/10 border border-primary/20 text-[10px] text-primary leading-relaxed">
                  🎯 <strong>Balanced Target:</strong> 50% of the position is closed at <strong>TP1</strong>, and the remaining 50% is fully closed at <strong>TP2</strong>. Once TP1 is achieved, Stop Loss automatically adjusts to Break-Even (BEP).
                </div>
              )}

              {tpMode === "CUSTOM_SPLIT" && (
                <div className="space-y-2 p-2.5 rounded bg-primary/10 border border-primary/20">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="custom-split-ratio" className="text-[10px] font-semibold text-primary">
                        First Exit Size (%)
                      </Label>
                      <Input
                        id="custom-split-ratio"
                        type="number"
                        min="10"
                        max="95"
                        step="5"
                        value={customTpSplitRatio}
                        onChange={(e) => setCustomTpSplitRatio(Number(e.target.value))}
                        className="h-7 text-xs font-mono"
                        placeholder="e.g. 70"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="custom-split-roi" className="text-[10px] font-semibold text-primary">
                        First Target ROI (%)
                      </Label>
                      <Input
                        id="custom-split-roi"
                        type="number"
                        min="1"
                        max="1000"
                        step="0.5"
                        value={customTpRoiPct}
                        onChange={(e) => setCustomTpRoiPct(Number(e.target.value))}
                        className="h-7 text-xs font-mono"
                        placeholder="e.g. 10.0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-primary/20">
                    <span className="text-muted-foreground">Price Movement to First Target:</span>
                    <span className="font-mono font-bold text-primary">
                      ~{((Number(customTpRoiPct) || 10) / (isTokoForm ? 1 : leverage)).toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    ⚡ <strong>Asymmetric Profit Lock:</strong> <strong>{customTpSplitRatio}%</strong> of your position is automatically closed at <strong>+{customTpRoiPct}% ROI</strong>. The remaining <strong>{100 - customTpSplitRatio}%</strong> is kept open for extended gains while Auto-BEP shifts Stop Loss to entry price, creating a 100% risk-free moonbag.
                  </p>
                </div>
              )}

              {tpMode === "CUSTOM_ROI" && (
                <div className="space-y-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="custom-tp-roi" className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                      Target Return on Equity (ROI %)
                    </Label>
                    <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300">
                      ~{((Number(customTpRoiPct) || 15) / (isTokoForm ? 1 : leverage)).toFixed(2)}% Price Movement
                    </span>
                  </div>
                  <Input
                    id="custom-tp-roi"
                    type="number"
                    min="1"
                    max="1000"
                    step="0.5"
                    value={customTpRoiPct}
                    onChange={(e) => setCustomTpRoiPct(Number(e.target.value))}
                    className="h-7 text-xs font-mono"
                    placeholder="e.g. 15.0"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    100% of the position will be closed at the price target yielding <strong>+{customTpRoiPct}% ROI</strong> (automatically calculated based on {leverage}x leverage).
                  </p>
                </div>
              )}

              {tpMode === "MULTI_TP" && (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Standard CryptoSpike allocation: 50% TP1, 30% TP2, and 20% Moonbag Trailing Stop Runner with Auto Break-Even protection.
                </p>
              )}
            </div>

            {/* 🛡️ Stop Loss Guard Mode (Custom SL) */}
            <div className="space-y-2 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <Label htmlFor="sl-mode" className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="size-3.5 text-destructive" />
                  Stop Loss Guard Mode
                </Label>
                <Badge variant="outline" className="text-[10px] font-mono font-semibold uppercase">
                  {slMode === "MAX_LOSS_ROI"
                    ? "Max Loss ROI (-" + customSlValue + "%)"
                    : slMode === "FIXED_PCT"
                      ? "Fixed Drop (-" + customSlValue + "%)"
                      : "Signal SL (AI)"}
                </Badge>
              </div>

              <select
                id="sl-mode"
                value={slMode}
                onChange={(e) =>
                  setSlMode(
                    e.target.value as "SIGNAL_SL" | "FIXED_PCT" | "MAX_LOSS_ROI",
                  )
                }
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="SIGNAL_SL" className="text-black">
                  Signal AI Structural SL (Dynamic S/R &amp; ATR Guard) [Recommended]
                </option>
                <option value="MAX_LOSS_ROI" className="text-black">
                  Max Margin Loss ROI % (Wallet Protection — Divided by Leverage)
                </option>
                <option value="FIXED_PCT" className="text-black">
                  Fixed Price Drop % (Chart Candlestick Movement)
                </option>
              </select>

              {/* Penjelasan Komparasi Detail Mode SL */}
              {slMode === "SIGNAL_SL" && (
                <div className="p-2 rounded bg-muted/40 border text-[10px] text-muted-foreground leading-relaxed">
                  🧠 <strong>AI Structural Guard:</strong> Stop Loss is dynamically placed at the key structural level calculated by CryptoSpike (below swing low for LONG / above swing high for SHORT with ATR wick buffer).
                </div>
              )}

              {slMode === "MAX_LOSS_ROI" && (
                <div className="space-y-1.5 p-2 rounded bg-destructive/10 border border-destructive/20">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="custom-sl-roi" className="text-[10px] font-semibold text-destructive dark:text-red-300">
                      Maximum Loss Tolerance (% of Margin)
                    </Label>
                    <span className="text-[10px] font-mono font-bold text-destructive dark:text-red-300">
                      ~{((Number(customSlValue) || 15) / (isTokoForm ? 1 : leverage)).toFixed(2)}% Price Drop on Chart
                    </span>
                  </div>
                  <Input
                    id="custom-sl-roi"
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    value={customSlValue}
                    onChange={(e) => setCustomSlValue(Number(e.target.value))}
                    className="h-7 text-xs font-mono"
                    placeholder="e.g. 15.0"
                  />
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>
                      💰 <strong>Wallet-Centric Protection:</strong> Limits maximum loss to <strong>-{customSlValue}%</strong> of your allocated trade margin.
                    </p>
                    <p className="text-foreground font-medium">
                      * Calculation: On {leverage}x leverage, the Stop Loss order is automatically placed at <strong>~{((Number(customSlValue) || 15) / (isTokoForm ? 1 : leverage)).toFixed(2)}%</strong> price movement ({customSlValue}% ÷ {leverage}x), capping your wallet loss budget.
                    </p>
                  </div>
                </div>
              )}

              {slMode === "FIXED_PCT" && (
                <div className="space-y-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="custom-sl-pct" className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                      Chart Price Drop Tolerance (%)
                    </Label>
                    <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300">
                      -{(Number(customSlValue) * (isTokoForm ? 1 : leverage)).toFixed(1)}% ROI Impact on Margin
                    </span>
                  </div>
                  <Input
                    id="custom-sl-pct"
                    type="number"
                    min="0.2"
                    max="50"
                    step="0.1"
                    value={customSlValue}
                    onChange={(e) => setCustomSlValue(Number(e.target.value))}
                    className="h-7 text-xs font-mono"
                    placeholder="e.g. 1.8"
                  />
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>
                      📊 <strong>Chart-Centric Protection:</strong> Stop Loss is placed exactly <strong>-{customSlValue}%</strong> away from your entry price on the candlestick chart.
                    </p>
                    <p className="text-foreground font-medium">
                      * Calculation: On {leverage}x leverage, a -{customSlValue}% price drop will result in a <strong>-{(Number(customSlValue) * (isTokoForm ? 1 : leverage)).toFixed(1)}% ROI</strong> loss on your margin ({customSlValue}% × {leverage}x).
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Baris 2: Kartu Penuh untuk Filter Koin (Trading Scope) */}
      <Card className="shadow-sm w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FilterIcon className="size-4 text-primary" />
            Coin Filter (Scope) —{" "}
            {activeExchangeForm === "TOKOCRYPTO"
              ? "Tokocrypto Spot"
              : binanceSubTab === "LIVE"
                ? "Binance Live (Real)"
                : "Binance Testnet (Demo)"}
          </CardTitle>
          <CardDescription className="text-xs hidden sm:block">
            Filter which coins your bot is allowed to execute.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          {/* Mode Selector */}
          <div className="space-y-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Label htmlFor="filter-mode" className="text-xs font-medium">
                Filter Mode
              </Label>
              <select
                id="filter-mode"
                value={coinFilterMode}
                onChange={(e) =>
                  setCoinFilterMode(
                    e.target.value as "ALL" | "WHITELIST" | "BLACKLIST",
                  )
                }
                className="flex h-8 w-full sm:w-72 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL" className="text-black">
                  All Market (No Filter)
                </option>
                <option value="WHITELIST" className="text-black">
                  Whitelist (Only Selected Coins)
                </option>
                <option value="BLACKLIST" className="text-black">
                  Blacklist (Exclude Selected Coins)
                </option>
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed hidden sm:block">
              {coinFilterMode === "ALL" &&
                "Bot will execute signals for any coin received from CryptoSpike."}
              {coinFilterMode === "WHITELIST" &&
                "Bot will ONLY execute signals matching your selected coins below."}
              {coinFilterMode === "BLACKLIST" &&
                "Bot will execute all signals EXCEPT the coins in your blacklist below."}
            </p>
          </div>

          {coinFilterMode !== "ALL" && (
            <div className="space-y-3.5 pt-3 border-t border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Label className="text-xs font-semibold">
                  {coinFilterMode === "WHITELIST"
                    ? "Allowed Coins"
                    : "Blocked Coins"}{" "}
                  ({coinList.length})
                </Label>

                {/* Add coin input */}
                <div className="flex gap-1.5 w-full sm:w-72">
                  <Input
                    placeholder={
                      activeExchangeForm === "TOKOCRYPTO"
                        ? `e.g. BTC, ETH, BTC_${tokocryptoQuoteAsset}`
                        : "e.g. BTC, ETH, ADAUSDT"
                    }
                    value={coinInput}
                    onChange={(e) => setCoinInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCoin(coinInput);
                      }
                    }}
                    className="h-8 text-xs font-mono uppercase"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAddCoin(coinInput)}
                    className="h-8 px-2.5 text-xs cursor-pointer shrink-0"
                  >
                    <PlusIcon className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Preset quick buttons */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Quick Presets:
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] px-1 text-muted-foreground hover:text-destructive cursor-pointer"
                    onClick={() => setTargetCoins("")}
                  >
                    Clear All
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 sm:flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 py-0 cursor-pointer shrink-0"
                    onClick={() =>
                      handleSetPreset([
                        "BTCUSDT",
                        "ETHUSDT",
                        "SOLUSDT",
                        "BNBUSDT",
                        "XRPUSDT",
                      ])
                    }
                  >
                    Bluechips
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 py-0 cursor-pointer shrink-0"
                    onClick={() =>
                      handleSetPreset([
                        "ADAUSDT",
                        "AVAXUSDT",
                        "NEARUSDT",
                        "SUIUSDT",
                        "DOTUSDT",
                      ])
                    }
                  >
                    Top L1
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 py-0 cursor-pointer text-amber-600 dark:text-amber-500 border-amber-500/30 hover:bg-amber-500/10 shrink-0"
                    onClick={() => handleSetPreset(TOP_50_CMC)}
                  >
                    Top 50 CMC
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 py-0 cursor-pointer text-primary border-primary/30 hover:bg-primary/10 shrink-0"
                    onClick={() => handleSetPreset(TOP_100_CMC)}
                  >
                    Top 100 CMC
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 py-0 cursor-pointer text-emerald-600 dark:text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 shrink-0"
                    onClick={() => handleSetPreset(TOP_50_NO_MEME)}
                  >
                    Top 50 (No Memes)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 py-0 cursor-pointer text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/10 shrink-0"
                    onClick={() => handleSetPreset(TOP_100_NO_MEME)}
                  >
                    Top 100 (No Memes)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 py-0 cursor-pointer text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/10 shrink-0"
                    onClick={() => handleSetPreset(MEMECOINS)}
                  >
                    Memecoins
                  </Button>
                </div>
              </div>

              {/* Badges container */}
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 rounded-md border bg-muted/20">
                {coinList.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground italic">
                    No coins specified. Type a symbol above or select a preset.
                  </span>
                ) : (
                  coinList.map((coin) => (
                    <Badge
                      key={coin}
                      variant="secondary"
                      className="text-[10px] font-mono font-medium pl-1.5 pr-1 py-0 gap-1 bg-background border hover:bg-muted"
                    >
                      {coin}
                      <button
                        type="button"
                        onClick={() => handleRemoveCoin(coin)}
                        className="hover:text-destructive transition-colors cursor-pointer"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 mt-6 border-t border-border/50">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTestConnection}
          disabled={testingConnection}
          className="w-full sm:w-auto gap-2 text-xs border-border cursor-pointer hover:border-emerald-500/50"
        >
          {testingConnection ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Testing Connection...
            </>
          ) : (
            <>
              <ActivityIcon className="size-3.5 text-primary" />
              Test Connection
            </>
          )}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={() => setIsConfirmModalOpen(true)}
          className="w-full sm:w-auto gap-2 text-xs cursor-pointer"
        >
          <SaveIcon className="size-3.5" />
          Save Configuration
        </Button>
      </div>

      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Configuration Confirmation
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Please review your bot configuration summary before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">
                Configuration Target:
              </span>
              <span className="font-semibold text-primary">
                {activeExchangeForm === "TOKOCRYPTO"
                  ? "Tokocrypto (Spot Market)"
                  : "Binance (Futures Market)"}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Active Bot Routing:</span>
              <span className="font-semibold">
                {targetExchange === "BOTH"
                  ? "Dual Mode (Binance Futures & Tokocrypto Spot)"
                  : targetExchange === "TOKOCRYPTO"
                    ? "Tokocrypto Spot Only"
                    : "Binance Futures Only"}
              </span>
            </div>
            {activeExchangeForm === "TOKOCRYPTO" ? (
              <>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Quote Asset:</span>
                  <span className="font-semibold">{tokocryptoQuoteAsset}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Execution Mode:</span>
                  <span
                    className={`font-semibold ${dryRun ? "text-amber-500" : "text-emerald-500"}`}
                  >
                    {dryRun ? "Paper Trading (Dry-Run)" : "Live Spot Order"}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Target TP / SL:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Multi-Stage TP (50/30/20) / Dynamic SL
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Environment:</span>
                  <span className="font-semibold">{binanceSubTab}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">
                    Leverage & Margin:
                  </span>
                  <span className="font-semibold">
                    {leverage}x ({marginType})
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Auto-Trade:</span>
              <span
                className={`font-semibold ${autoExecute ? "text-emerald-500" : "text-destructive"}`}
              >
                {autoExecute ? "ON" : "OFF"}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Max Open Positions:</span>
              <span className="font-semibold">{maxOpenPositions}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Coin Filter:</span>
              <span className="font-semibold text-right">
                {coinFilterMode === "ALL"
                  ? "All Market"
                  : `${coinFilterMode} (${coinList.length} coins)`}
              </span>
            </div>
            <div className="flex flex-col border-b pb-2 gap-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {activeExchangeForm === "TOKOCRYPTO"
                    ? "Max Total Capital:"
                    : "Total Max Risk:"}
                </span>
                <span
                  className={`font-bold ${
                    activeExchangeForm === "TOKOCRYPTO"
                      ? "text-amber-600"
                      : binanceRiskInfo.color.split(" ")[0]
                  }`}
                >
                  {activeExchangeForm === "TOKOCRYPTO"
                    ? `${tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}${tokoTotalCapital.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokocryptoQuoteAsset}`
                    : `${binanceTotalRiskPct}%`}
                </span>
              </div>
              {typeof activeTestResult?.balance === "number" ? (
                activeExchangeForm === "TOKOCRYPTO" ? (
                  <div className="text-xs mt-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 leading-relaxed space-y-1">
                    <p>
                      <strong>Tokocrypto Cash Allocation:</strong> Each spot buy
                      order will allocate{" "}
                      <strong>
                        {tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}
                        {Number(riskPerTradePct).toLocaleString()}{" "}
                        {activeTestResult.quoteAsset || tokocryptoQuoteAsset}
                      </strong>{" "}
                      (Fixed Cash).
                    </p>
                    <p className="text-[11px] opacity-90">
                      Total required for {maxOpenPositions} positions:{" "}
                      <strong>
                        {tokocryptoQuoteAsset === "BIDR" ? "Rp " : "$"}
                        {tokoTotalCapital.toLocaleString()}{" "}
                        {activeTestResult.quoteAsset || tokocryptoQuoteAsset}
                      </strong>{" "}
                      (Available:{" "}
                      {activeTestResult.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {activeTestResult.quoteAsset || tokocryptoQuoteAsset})
                    </p>
                  </div>
                ) : (
                  <div
                    className={`text-xs mt-2 p-2.5 rounded-md ${binanceRiskInfo.bg} border ${binanceRiskInfo.border} ${binanceRiskInfo.color} leading-relaxed space-y-2`}
                  >
                    <p>
                      <strong>
                        Balance Preview [{binanceRiskInfo.label}]:
                      </strong>{" "}
                      Out of your available balance of{" "}
                      <strong>
                        {activeTestResult.balance.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || "USDT"}
                      </strong>
                      , margin per trade is approximately{" "}
                      <strong>
                        ~
                        {(
                          (activeTestResult.balance * Number(riskPerTradePct)) /
                          100
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || "USDT"}
                      </strong>{" "}
                      (Position Size ~
                      {(
                        ((activeTestResult.balance * Number(riskPerTradePct)) /
                          100) *
                        leverage
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      USDT with {leverage}x leverage).
                    </p>
                  </div>
                )
              ) : (
                <div className="text-xs mt-2 p-2.5 rounded-md bg-muted text-muted-foreground leading-relaxed italic">
                  * Please run 'Test Connection' first to see the estimated
                  allocation amount.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => setIsConfirmModalOpen(false)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={handleSave}
              className="text-xs cursor-pointer gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <SaveIcon className="size-3.5" />
                  Confirm & Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
