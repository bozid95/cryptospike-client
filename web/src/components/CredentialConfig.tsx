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
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "SHIBUSDT",
  "DOTUSDT",
  "NEARUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "UNIUSDT",
  "PEPEUSDT",
  "APTUSDT",
  "ICPUSDT",
  "TRXUSDT",
  "TAOUSDT",
  "FETUSDT",
  "RENDERUSDT",
  "XLMUSDT",
  "AAVEUSDT",
  "ETCUSDT",
  "POLUSDT",
  "ARBUSDT",
  "OPUSDT",
  "ATOMUSDT",
  "INJUSDT",
  "SEIUSDT",
  "FILUSDT",
  "RUNEUSDT",
  "TIAUSDT",
  "HBARUSDT",
  "IMXUSDT",
  "WIFUSDT",
  "BONKUSDT",
  "GRTUSDT",
  "STXUSDT",
  "FLOKIUSDT",
  "VETUSDT",
  "MKRUSDT",
  "ENAUSDT",
  "JUPUSDT",
  "ALGOUSDT",
  "FTMUSDT",
  "THETAUSDT",
  "ONDOUSDT",
];

const TOP_100_CMC: string[] = Array.from(
  new Set([
    ...TOP_50_CMC,
    "SANDUSDT",
    "MANAUSDT",
    "AXSUSDT",
    "GALAUSDT",
    "NEOUSDT",
    "CRVUSDT",
    "FLOWUSDT",
    "DYDXUSDT",
    "BEAMUSDT",
    "PENDLEUSDT",
    "KSMUSDT",
    "CHZUSDT",
    "ZECUSDT",
    "1INCHUSDT",
    "CFXUSDT",
    "EGLDUSDT",
    "EOSUSDT",
    "IOTAUSDT",
    "QNTUSDT",
    "SNXUSDT",
    "ROSEUSDT",
    "MINAUSDT",
    "CAKEUSDT",
    "LDOUSDT",
    "WLDUSDT",
    "PYTHUSDT",
    "STRKUSDT",
    "BLURUSDT",
    "ORDIUSDT",
    "MEMEUSDT",
    "ARKMUSDT",
    "JTOUSDT",
    "NOTUSDT",
    "WUSDT",
    "ZKUSDT",
    "IOUSDT",
    "ZROUSDT",
    "POPCATUSDT",
    "TURBOUSDT",
    "BRETTUSDT",
    "NEIROUSDT",
    "AEROUSDT",
    "KAVAUSDT",
    "COMPUSDT",
    "GMXUSDT",
    "DYMUSDT",
    "ALTUSDT",
    "PORTALUSDT",
    "PIXELUSDT",
  ]),
);

export default function CredentialConfig() {
  const [token, setToken] = useState("");
  const [environment, setEnvironment] = useState<"TESTNET" | "LIVE">("TESTNET");

  // Testnet Credentials
  const [testnetApiKey, setTestnetApiKey] = useState("");
  const [testnetApiSecret, setTestnetApiSecret] = useState("");
  const [showTestnetSecret, setShowTestnetSecret] = useState(false);

  // Live Credentials
  const [liveApiKey, setLiveApiKey] = useState("");
  const [liveApiSecret, setLiveApiSecret] = useState("");
  const [showLiveSecret, setShowLiveSecret] = useState(false);

  // Risk Management
  const [autoExecute, setAutoExecute] = useState(false);
  const [marginType, setMarginType] = useState<"ISOLATED" | "CROSSED">(
    "ISOLATED",
  );
  const [leverage, setLeverage] = useState(10);
  const [riskPerTradePct, setRiskPerTradePct] = useState(2.0);
  const [maxOpenPositions, setMaxOpenPositions] = useState(3);

  // Coin Filter State
  const [coinFilterMode, setCoinFilterMode] = useState<
    "ALL" | "WHITELIST" | "BLACKLIST"
  >("ALL");
  const [targetCoins, setTargetCoins] = useState("");
  const [coinInput, setCoinInput] = useState("");

  // Status State
  const [isSaving, setIsSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    balance?: number;
  } | null>(null);

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
            const env = d.environment === "LIVE" ? "LIVE" : "TESTNET";
            setEnvironment(env);
            if (env === "TESTNET") {
              setTestnetApiKey(d.binanceApiKey || "");
              setTestnetApiSecret(d.binanceApiSecret || "");
            } else {
              setLiveApiKey(d.binanceApiKey || "");
              setLiveApiSecret(d.binanceApiSecret || "");
            }
            setAutoExecute(d.autoExecute === 1 || d.autoExecute === true);
            setMarginType(d.marginType || "ISOLATED");
            setLeverage(d.leverage || 10);
            setRiskPerTradePct(d.riskPerTradePct || 2.0);
            setMaxOpenPositions(d.maxOpenPositions || 3);
            setCoinFilterMode(d.coinFilterMode || "ALL");
            setTargetCoins(d.targetCoins || "");
          }
        }
      } catch (err: any) {
        console.error("Gagal memuat konfigurasi dari backend:", err);
      }
    };

    fetchConfig();
  }, []);

  // 2. Fungsi Tes Koneksi API Binance
  const handleTestConnection = async () => {
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
      setTestResult(null);

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
      setTestResult(data);

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

      const payload = {
        clientToken: token.trim(),
        binanceApiKey: currentKey.trim(),
        binanceApiSecret: currentSecret.trim(),
        environment,
        autoExecute,
        marginType,
        leverage: Number(leverage),
        riskPerTradePct: Number(riskPerTradePct),
        maxOpenPositions: Number(maxOpenPositions),
        coinFilterMode,
        targetCoins: targetCoins.trim(),
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

  const totalRiskPct = Number(riskPerTradePct) * Number(maxOpenPositions);
  const riskInfo = getRiskLevel(totalRiskPct);

  const coinList = targetCoins
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const handleAddCoin = (symbol: string) => {
    let clean = symbol.trim().toUpperCase();
    if (!clean) return;
    if (!clean.endsWith("USDT")) {
      clean = `${clean}USDT`;
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
    setTargetCoins(preset.join(","));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Bot Config & Credentials
        </h2>
        <p className="text-sm text-muted-foreground">
          Bot license, Binance API keys, and local execution risk management.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Kolom Kiri / Utama: Kredensial Binance & Token */}
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyIcon className="size-5 text-primary" />
                Binance Futures Credentials
              </CardTitle>
              <CardDescription className="text-xs">
                API keys are stored and encrypted locally in the SQLite
                database.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    testResult.success
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {testResult.success ? (
                    <ShieldCheck className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {testResult.success
                        ? "Status Verified"
                        : "Verification Failed"}
                    </p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {testResult.message}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Kolom Kanan: Pengaturan Risiko & Eksekusi Bot */}
        <div className="md:col-span-1 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckIcon className="size-4 text-primary" />
                Risk Management
              </CardTitle>
              <CardDescription className="text-xs">
                Execution parameters when a signal is received.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
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
                    Automatic execution
                  </p>
                </div>
                <Switch
                  id="auto-exec"
                  checked={autoExecute}
                  onCheckedChange={setAutoExecute}
                />
              </div>

              {/* Margin Type */}
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

              {/* Leverage */}
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

              {/* Risk Per Trade % */}
              <div className="space-y-1.5">
                <Label htmlFor="risk-pct" className="text-xs font-medium">
                  Risk Per Trade (% Wallet)
                </Label>
                <Input
                  id="risk-pct"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={riskPerTradePct}
                  onChange={(e) => setRiskPerTradePct(Number(e.target.value))}
                  className="h-8 text-xs"
                />
                {testResult?.balance ? (
                  <div
                    className={`text-[10px] ${riskInfo.color} ${riskInfo.bg} p-2.5 rounded-md border ${riskInfo.border} leading-relaxed mt-2 space-y-1.5`}
                  >
                    <p>
                      <strong>Risk Preview [{riskInfo.label}]:</strong> You are
                      authorizing the bot to risk a maximum of{" "}
                      <strong>
                        ~$
                        {(
                          (testResult.balance * Number(riskPerTradePct)) /
                          100
                        ).toFixed(2)}{" "}
                        USD
                      </strong>{" "}
                      per single trade.
                    </p>
                    <p className="opacity-90">
                      <strong>Worst-Case Scenario:</strong> If all{" "}
                      <strong>{maxOpenPositions}</strong> allowed positions hit
                      Stop Loss simultaneously, your total potential loss is up
                      to{" "}
                      <strong>
                        ~$
                        {((testResult.balance * totalRiskPct) / 100).toFixed(
                          2,
                        )}{" "}
                        USD ({totalRiskPct}%)
                      </strong>{" "}
                      of your balance.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic mt-1">
                    * Please run 'Test Connection' first to see the estimated
                    risk amount (USD) per trade.
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

          {/* Card Coin Filter */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FilterIcon className="size-4 text-primary" />
                Coin Filter (Scope)
              </CardTitle>
              <CardDescription className="text-xs">
                Filter which coins your bot is allowed to execute.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs">
              {/* Mode Selector */}
              <div className="space-y-1.5">
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
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {coinFilterMode === "ALL" &&
                    "Bot will execute signals for any coin received from CryptoSpike."}
                  {coinFilterMode === "WHITELIST" &&
                    "Bot will ONLY execute signals matching your selected coins below."}
                  {coinFilterMode === "BLACKLIST" &&
                    "Bot will execute all signals EXCEPT the coins in your blacklist below."}
                </p>
              </div>

              {coinFilterMode !== "ALL" && (
                <div className="space-y-2.5 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      {coinFilterMode === "WHITELIST"
                        ? "Allowed Coins"
                        : "Blocked Coins"}{" "}
                      ({coinList.length})
                    </Label>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 py-0 cursor-pointer"
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
                      className="h-6 text-[10px] px-2 py-0 cursor-pointer"
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
                      className="h-6 text-[10px] px-2 py-0 cursor-pointer text-amber-600 dark:text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => handleSetPreset(TOP_50_CMC)}
                    >
                      Top 50 CMC
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 py-0 cursor-pointer text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => handleSetPreset(TOP_100_CMC)}
                    >
                      Top 100 CMC
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-1.5 py-0 text-muted-foreground hover:text-destructive cursor-pointer"
                      onClick={() => setTargetCoins("")}
                    >
                      Clear
                    </Button>
                  </div>

                  {/* Add coin input */}
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="e.g. BTC, ETH, ADAUSDT"
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
                      className="h-8 px-2.5 text-xs cursor-pointer"
                    >
                      <PlusIcon className="size-3.5" />
                    </Button>
                  </div>

                  {/* Badges container */}
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-md border bg-muted/20">
                    {coinList.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground italic">
                        No coins specified. Type a symbol above or select a
                        preset.
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
        </div>
      </div>

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
              <span className="text-muted-foreground">Environment:</span>
              <span className="font-semibold">{environment}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Auto-Trade:</span>
              <span
                className={`font-semibold ${autoExecute ? "text-emerald-500" : "text-destructive"}`}
              >
                {autoExecute ? "ON" : "OFF"}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Leverage:</span>
              <span className="font-semibold">
                {leverage}x ({marginType})
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
                <span className="text-muted-foreground">Total Max Risk:</span>
                <span className={`font-bold ${riskInfo.color.split(" ")[0]}`}>
                  {totalRiskPct}%
                </span>
              </div>
              {testResult?.balance ? (
                <div
                  className={`text-xs mt-2 p-2.5 rounded-md ${riskInfo.bg} border ${riskInfo.border} ${riskInfo.color} leading-relaxed space-y-2`}
                >
                  <p>
                    <strong>Risk Warning [{riskInfo.label}]:</strong> Out of
                    your total balance of{" "}
                    <strong>${testResult.balance.toFixed(2)}</strong>, the
                    potential loss per trade is approximately{" "}
                    <strong>
                      ~$
                      {(
                        (testResult.balance * Number(riskPerTradePct)) /
                        100
                      ).toFixed(2)}{" "}
                      USD
                    </strong>
                    .
                  </p>
                  <p className="opacity-90 border-t border-current/20 pt-1.5">
                    <strong>Worst-Case Scenario:</strong> If {maxOpenPositions}{" "}
                    positions hit Stop Loss simultaneously, you could lose up to{" "}
                    <strong>
                      ~$
                      {((testResult.balance * totalRiskPct) / 100).toFixed(
                        2,
                      )}{" "}
                      USD ({totalRiskPct}%)
                    </strong>
                    .
                  </p>
                </div>
              ) : (
                <div className="text-xs mt-2 p-2.5 rounded-md bg-muted text-muted-foreground leading-relaxed italic">
                  * Please run 'Test Connection' first to see the estimated risk
                  amount (USD).
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
