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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [environment, setEnvironment] = useState<"TESTNET" | "LIVE">("TESTNET");

  // Sync with forcedExchange prop when tab changes
  useEffect(() => {
    if (forcedExchange) {
      setActiveExchangeForm(forcedExchange);
    }
  }, [forcedExchange]);

  // Binance Credentials
  const [testnetApiKey, setTestnetApiKey] = useState("");
  const [testnetApiSecret, setTestnetApiSecret] = useState("");
  const [showTestnetSecret, setShowTestnetSecret] = useState(false);

  const [liveApiKey, setLiveApiKey] = useState("");
  const [liveApiSecret, setLiveApiSecret] = useState("");
  const [showLiveSecret, setShowLiveSecret] = useState(false);

  // Tokocrypto Credentials
  const [tokocryptoApiKey, setTokocryptoApiKey] = useState("");
  const [tokocryptoApiSecret, setTokocryptoApiSecret] = useState("");
  const [showTokocryptoSecret, setShowTokocryptoSecret] = useState(false);
  const [tokocryptoQuoteAsset, setTokocryptoQuoteAsset] = useState<
    "USDT" | "BIDR"
  >("USDT");

  // Binance Dedicated Risk & Execution
  const [binanceAutoExecute, setBinanceAutoExecute] = useState(false);
  const [marginType, setMarginType] = useState<"ISOLATED" | "CROSSED">(
    "ISOLATED",
  );
  const [leverage, setLeverage] = useState(10);
  const [binanceRiskPerTradePct, setBinanceRiskPerTradePct] = useState(2.0);
  const [binanceMaxOpenPositions, setBinanceMaxOpenPositions] = useState(3);
  const [binanceCoinFilterMode, setBinanceCoinFilterMode] = useState<
    "ALL" | "WHITELIST" | "BLACKLIST"
  >("ALL");
  const [binanceTargetCoins, setBinanceTargetCoins] = useState("");
  const [binanceTradeDirection, setBinanceTradeDirection] = useState<
    "BOTH" | "LONG_ONLY" | "SHORT_ONLY"
  >("BOTH");
  const [binanceMinScore, setBinanceMinScore] = useState<number>(0);
  const [binanceBlockLongOnBtcBearish, setBinanceBlockLongOnBtcBearish] =
    useState<boolean>(true);

  // Tokocrypto Dedicated Risk & Execution
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

  const [binanceTestResult, setBinanceTestResult] =
    useState<TestResultType | null>(null);
  const [tokocryptoTestResult, setTokocryptoTestResult] =
    useState<TestResultType | null>(null);

  // Active form getters and setters
  const isTokoForm = activeExchangeForm === "TOKOCRYPTO";
  const autoExecute = isTokoForm ? tokocryptoAutoExecute : binanceAutoExecute;
  const setAutoExecute = isTokoForm
    ? setTokocryptoAutoExecute
    : setBinanceAutoExecute;

  const riskPerTradePct = isTokoForm
    ? tokocryptoRiskPerTradePct
    : binanceRiskPerTradePct;
  const setRiskPerTradePct = isTokoForm
    ? setTokocryptoRiskPerTradePct
    : setBinanceRiskPerTradePct;

  const maxOpenPositions = isTokoForm
    ? tokocryptoMaxOpenPositions
    : binanceMaxOpenPositions;
  const setMaxOpenPositions = isTokoForm
    ? setTokocryptoMaxOpenPositions
    : setBinanceMaxOpenPositions;

  const coinFilterMode = isTokoForm
    ? tokocryptoCoinFilterMode
    : binanceCoinFilterMode;
  const setCoinFilterMode = isTokoForm
    ? setTokocryptoCoinFilterMode
    : setBinanceCoinFilterMode;

  const targetCoins = isTokoForm ? tokocryptoTargetCoins : binanceTargetCoins;
  const setTargetCoins = isTokoForm
    ? setTokocryptoTargetCoins
    : setBinanceTargetCoins;

  const dryRun = tokocryptoDryRun;
  const setDryRun = setTokocryptoDryRun;

  const activeTestResult = isTokoForm
    ? tokocryptoTestResult
    : binanceTestResult;

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
            const env = d.environment === "LIVE" ? "LIVE" : "TESTNET";
            setEnvironment(env);
            if (env === "TESTNET") {
              setTestnetApiKey(d.binanceApiKey || "");
              setTestnetApiSecret(d.binanceApiSecret || "");
            } else {
              setLiveApiKey(d.binanceApiKey || "");
              setLiveApiSecret(d.binanceApiSecret || "");
            }

            // Binance Config
            setBinanceAutoExecute(
              d.binanceAutoExecute === 1 ||
                d.binanceAutoExecute === true ||
                d.autoExecute === 1 ||
                d.autoExecute === true,
            );
            setMarginType(d.marginType || "ISOLATED");
            setLeverage(d.leverage || 10);
            setBinanceRiskPerTradePct(
              d.binanceRiskPerTradePct ?? d.riskPerTradePct ?? 2.0,
            );
            setBinanceMaxOpenPositions(
              d.binanceMaxOpenPositions ?? d.maxOpenPositions ?? 3,
            );
            setBinanceCoinFilterMode(
              d.binanceCoinFilterMode || d.coinFilterMode || "ALL",
            );
            setBinanceTargetCoins(d.binanceTargetCoins || d.targetCoins || "");
            const loadedDir = (
              d.binanceTradeDirection ||
              d.tradeDirection ||
              "BOTH"
            ).toUpperCase();
            setBinanceTradeDirection(
              loadedDir === "LONG_ONLY" || loadedDir === "SHORT_ONLY"
                ? loadedDir
                : "BOTH",
            );
            setBinanceMinScore(Number(d.binanceMinScore ?? d.minScore ?? 0));
            setBinanceBlockLongOnBtcBearish(
              d.binanceBlockLongOnBtcBearish !== undefined
                ? Boolean(d.binanceBlockLongOnBtcBearish)
                : d.blockLongOnBtcBearish !== undefined
                  ? Boolean(d.blockLongOnBtcBearish)
                  : true,
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

            // Auto-fetch balances if credentials exist
            try {
              const [resB, resT] = await Promise.all([
                authFetch("/api/positions?exchange=BINANCE"),
                authFetch("/api/positions?exchange=TOKOCRYPTO"),
              ]);
              if (resB.ok) {
                const jB = await resB.json();
                if (jB.success && typeof jB.totalWalletBalance === "number") {
                  setBinanceTestResult({
                    success: true,
                    message: "Current Binance Futures Balance",
                    balance: jB.totalWalletBalance,
                    quoteAsset: "USDT",
                  });
                }
              }
              if (resT.ok) {
                const jT = await resT.json();
                if (jT.success && typeof jT.totalWalletBalance === "number") {
                  setTokocryptoTestResult({
                    success: true,
                    message: "Current Tokocrypto Spot Balance",
                    balance: jT.totalWalletBalance,
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

    // Default: Binance Futures
    const isTestnet = environment === "TESTNET";
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
      setBinanceTestResult(null);

      const res = await authFetch("/api/config/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: currentKey.trim(),
          apiSecret: currentSecret.trim(),
          environment,
        }),
      });

      const data = await res.json();
      const bal = typeof data.balance === "number" ? data.balance : undefined;
      setBinanceTestResult({
        ...data,
        balance: bal,
        quoteAsset: "USDT",
      });

      if (data.success) {
        toast.success("Connection Successful!", {
          description: data.message,
        });
      } else {
        toast.error("Binance Connection Failed", {
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
      const isTestnet = environment === "TESTNET";
      const currentKey = isTestnet ? testnetApiKey : liveApiKey;
      const currentSecret = isTestnet ? testnetApiSecret : liveApiSecret;

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

      const payload = {
        targetExchange,
        clientToken: token.trim(),
        // Binance Dedicated Fields
        binanceApiKey: currentKey.trim(),
        binanceApiSecret: currentSecret.trim(),
        environment,
        binanceAutoExecute,
        marginType,
        leverage: Number(leverage),
        binanceTradeDirection,
        binanceMinScore: Number(binanceMinScore),
        binanceBlockLongOnBtcBearish: Boolean(binanceBlockLongOnBtcBearish),
        binanceRiskPerTradePct: Number(binanceRiskPerTradePct),
        binanceMaxOpenPositions: Number(binanceMaxOpenPositions),
        binanceCoinFilterMode: isTokoForm
          ? binanceCoinFilterMode
          : coinFilterMode,
        binanceTargetCoins: isTokoForm ? binanceTargetCoins : finalTargetCoins,
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
    Number(binanceRiskPerTradePct) * Number(binanceMaxOpenPositions);
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

      {/* Baris 1: Grid 2 Kolom Seimbang (Kredensial & Manajemen Risiko) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        {/* Card 1: Kredensial Exchange Aktif */}
        {activeExchangeForm === "BINANCE" ? (
          <Card className="shadow-sm flex flex-col justify-between">
            <CardHeader className="p-3.5 sm:p-6 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyIcon className="size-4 text-primary" />
                  Binance Futures Credentials
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] text-primary border-primary/30"
                >
                  Futures Market
                </Badge>
              </div>
              <CardDescription className="text-xs hidden sm:block">
                API keys are stored and encrypted locally in the SQLite
                database.
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

              <div className="border-t pt-4" />

              {/* Environment Tabs */}
              <Tabs
                value={environment.toLowerCase()}
                onValueChange={(val) =>
                  setEnvironment(val.toUpperCase() as "TESTNET" | "LIVE")
                }
                className="w-full"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Select API Environment
                  </Label>
                  <TabsList className="grid w-full sm:w-[220px] grid-cols-2">
                    <TabsTrigger value="testnet" className="text-xs gap-1.5">
                      <FlaskConicalIcon className="size-3.5 text-amber-500" />
                      Testnet
                    </TabsTrigger>
                    <TabsTrigger value="live" className="text-xs gap-1.5">
                      <GlobeIcon className="size-3.5 text-emerald-500" />
                      Live
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab Testnet */}
                <TabsContent value="testnet" className="space-y-4 pt-1">
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
                        onClick={() => setShowTestnetSecret(!showTestnetSecret)}
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
                </TabsContent>

                {/* Tab Live */}
                <TabsContent value="live" className="space-y-4 pt-1">
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
                </TabsContent>
              </Tabs>

              {/* Feedback Hasil Test Connection */}
              {binanceTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    binanceTestResult.success
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {binanceTestResult.success ? (
                    <ShieldCheck className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {binanceTestResult.success
                        ? "Status Verified"
                        : "Verification Failed"}
                    </p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {binanceTestResult.message}
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
                        binanceTradeDirection === "LONG_ONLY"
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : binanceTradeDirection === "SHORT_ONLY"
                            ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            : "bg-primary/10 text-primary border border-primary/20"
                      }`}
                    >
                      {binanceTradeDirection === "LONG_ONLY"
                        ? "LONG ONLY"
                        : binanceTradeDirection === "SHORT_ONLY"
                          ? "SHORT ONLY"
                          : "BOTH SIDES"}
                    </span>
                  </div>
                  <select
                    id="trade-direction"
                    value={binanceTradeDirection}
                    onChange={(e) =>
                      setBinanceTradeDirection(
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
                    Binance Futures.
                  </p>
                </div>

                {/* Minimum Signal Score Filter */}
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="min-score" className="text-xs font-medium">
                      Minimum Signal Score
                    </Label>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                      {binanceMinScore > 0
                        ? `>= ${binanceMinScore}`
                        : "ALL SIGNALS"}
                    </span>
                  </div>
                  <select
                    id="min-score"
                    value={binanceMinScore}
                    onChange={(e) => setBinanceMinScore(Number(e.target.value))}
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
                      checked={binanceBlockLongOnBtcBearish}
                      onCheckedChange={setBinanceBlockLongOnBtcBearish}
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

            {/* Risk / Allocation Input */}
            <div className="space-y-1.5">
              <Label htmlFor="risk-pct" className="text-xs font-medium">
                {activeExchangeForm === "TOKOCRYPTO"
                  ? `Allocation Per Trade (${tokocryptoQuoteAsset === "BIDR" ? "Rp BIDR" : "$ USDT"} Cash)`
                  : "Risk Per Trade (% Wallet)"}
              </Label>
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
              />
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
                        Margin per Trade ({binanceRiskPerTradePct}%):
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        ~
                        {(
                          (activeTestResult.balance *
                            Number(binanceRiskPerTradePct)) /
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
                        {(
                          ((activeTestResult.balance *
                            Number(binanceRiskPerTradePct)) /
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
                        Worst Case ({binanceMaxOpenPositions} Pos):
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        ~
                        {(
                          (activeTestResult.balance * binanceTotalRiskPct) /
                          100
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || "USDT"} (
                        {binanceTotalRiskPct}%)
                      </span>
                    </div>
                    {binanceTotalRiskPct > 100 && (
                      <p className="text-[10px] text-destructive dark:text-red-400 font-semibold pt-1 border-t border-destructive/20">
                        * Warning: Total margin allocation (
                        {binanceTotalRiskPct}
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
          </CardContent>
        </Card>
      </div>

      {/* Baris 2: Kartu Penuh untuk Filter Koin (Trading Scope) */}
      <Card className="shadow-sm w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FilterIcon className="size-4 text-primary" />
            Coin Filter (Scope)
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
                  <span className="font-semibold">{environment}</span>
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
                          (activeTestResult.balance *
                            Number(binanceRiskPerTradePct)) /
                          100
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {activeTestResult.quoteAsset || "USDT"}
                      </strong>{" "}
                      (Position Size ~
                      {(
                        ((activeTestResult.balance *
                          Number(binanceRiskPerTradePct)) /
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
