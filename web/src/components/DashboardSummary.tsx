import { useState, useEffect } from "react";
import {
  Layers,
  Coins,
  BotIcon,
  Terminal,
  ArrowRight,
  ShieldCheck,
  SlidersIcon,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { authFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DashboardSummaryProps {
  onNavigate: (tab: string) => void;
  botConnected: boolean;
}

export function DashboardSummary({
  onNavigate,
  botConnected,
}: DashboardSummaryProps) {
  const [config, setConfig] = useState<any>(null);
  const [binanceData, setBinanceData] = useState<{
    account?: any;
    positions: any[];
  }>({ positions: [] });
  const [tokocryptoData, setTokocryptoData] = useState<{
    account?: any;
    positions: any[];
  }>({ positions: [] });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllSummary = async () => {
    try {
      // 1. Fetch Config
      const configRes = await authFetch("/api/config");
      if (configRes.ok) {
        const cJson = await configRes.json();
        if (cJson.success && cJson.data) {
          setConfig(cJson.data);
        }
      }

      // 2. Fetch Binance Positions & Balance
      const binanceRes = await authFetch("/api/positions?exchange=BINANCE");
      if (binanceRes.ok) {
        const bJson = await binanceRes.json();
        if (bJson.success) {
          setBinanceData({
            account: bJson.account,
            positions: bJson.positions || [],
          });
        }
      }

      // 3. Fetch Tokocrypto Spot Positions & Balance
      const tokoRes = await authFetch("/api/positions?exchange=TOKOCRYPTO");
      if (tokoRes.ok) {
        const tJson = await tokoRes.json();
        if (tJson.success) {
          setTokocryptoData({
            account: tJson.account,
            positions: tJson.positions || [],
          });
        }
      }

      // 4. Fetch Recent Logs (last 4)
      const logsRes = await authFetch("/api/logs?limit=4");
      if (logsRes.ok) {
        const lJson = await logsRes.json();
        if (lJson.success && Array.isArray(lJson.logs)) {
          setRecentLogs(lJson.logs.slice(0, 4));
        }
      }
    } catch (err) {
      console.error("Failed to fetch dashboard summary:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSummary();
    const interval = setInterval(fetchAllSummary, 4000);
    return () => clearInterval(interval);
  }, []);

  const targetExchange = (config?.targetExchange || "BINANCE").toUpperCase();
  const isTokocrypto = targetExchange === "TOKOCRYPTO";
  const isDual = targetExchange === "BOTH";
  const binanceAuto = Boolean(
    config?.binanceAutoExecute ?? config?.autoExecute,
  );
  const tokocryptoAuto = Boolean(config?.tokocryptoAutoExecute);
  const autoTrade = isDual
    ? binanceAuto || tokocryptoAuto
    : isTokocrypto
      ? tokocryptoAuto
      : binanceAuto;
  const isDryRun = Boolean(config?.tokocryptoDryRun ?? config?.dryRun);

  const binancePnl = binanceData.positions.reduce(
    (acc, p) => acc + (p.unRealizedProfit || 0),
    0,
  );
  const tokocryptoPnl = tokocryptoData.positions.reduce(
    (acc, p) => acc + (p.unRealizedProfit || 0),
    0,
  );

  const [isUpdatingMode, setIsUpdatingMode] = useState(false);

  const handleUpdateTargetExchange = async (
    newExchange: "BINANCE" | "TOKOCRYPTO" | "BOTH",
  ) => {
    if (isUpdatingMode || !config) return;
    try {
      setIsUpdatingMode(true);
      const res = await authFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetExchange: newExchange }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig((prev: any) => ({ ...prev, targetExchange: newExchange }));
        const label =
          newExchange === "BOTH"
            ? "Dual Mode (Binance Futures & Tokocrypto Spot)"
            : newExchange === "TOKOCRYPTO"
              ? "Tokocrypto Spot Only"
              : "Binance Futures Only";
        toast.success("Bot Trading Mode Updated", {
          description: `Active execution target: ${label}`,
        });
        await fetchAllSummary();
      } else {
        toast.error("Failed to Update Bot Mode", {
          description: data.message || "An error occurred while saving mode.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to Update Bot Mode", {
        description: err.message || "Failed to connect to local server.",
      });
    } finally {
      setIsUpdatingMode(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* 1. HEADER & SYSTEM STATUS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Dashboard Summary
          </h2>
          <p className="text-sm text-muted-foreground">
            Live operational status across Binance Futures and Tokocrypto Spot.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={`text-xs px-2.5 py-1 gap-1.5 font-medium ${
              botConnected
                ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                : "border-red-500/40 text-red-600 bg-red-500/10"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                botConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            Socket: {botConnected ? "Connected" : "Disconnected"}
          </Badge>

          {isDual ? (
            <>
              <Badge
                variant="outline"
                className={`text-xs px-2.5 py-1 gap-1.5 font-medium ${
                  binanceAuto
                    ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-600 bg-amber-500/10"
                }`}
              >
                Binance: {binanceAuto ? "ACTIVE" : "PAUSED"}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs px-2.5 py-1 gap-1.5 font-medium ${
                  tokocryptoAuto
                    ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-600 bg-amber-500/10"
                }`}
              >
                Tokocrypto: {tokocryptoAuto ? "ACTIVE" : "PAUSED"}
              </Badge>
            </>
          ) : (
            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-1 gap-1.5 font-medium ${
                autoTrade
                  ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                  : "border-amber-500/40 text-amber-600 bg-amber-500/10"
              }`}
            >
              Auto-Trade: {autoTrade ? "ACTIVE" : "PAUSED"}
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={fetchAllSummary}
            disabled={isLoading}
            className="h-8 text-xs cursor-pointer gap-1.5"
          >
            <RefreshCw
              className={`size-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. ACTIVE EXCHANGE MODE CONTROLLER (1-CLICK) */}
      <Card className="border-primary/20 bg-primary/5 shadow-sm">
        <CardContent className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <BotIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">
                  Trading Execution Target:
                </span>
                <Badge
                  variant="outline"
                  className={`text-[11px] font-bold px-2 py-0.5 ${
                    isDual
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : isTokocrypto
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {isDual
                    ? "Dual Mode (Binance Futures & Tokocrypto Spot)"
                    : isTokocrypto
                      ? "Tokocrypto Spot Only"
                      : "Binance Futures Only"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isDual
                  ? "Signals are executed simultaneously on Binance Futures (LONG & SHORT) and Tokocrypto Spot (LONG Only)."
                  : isTokocrypto
                    ? "Signals are executed exclusively on Tokocrypto Spot with 1x Cash and auto TP (+5%) / SL (-2.5%)."
                    : "Signals are executed exclusively on Binance Futures with leverage & isolated margin."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-background rounded-lg border shadow-xs shrink-0 self-start md:self-auto">
            <Button
              type="button"
              size="sm"
              variant={targetExchange === "BINANCE" ? "default" : "ghost"}
              onClick={() => handleUpdateTargetExchange("BINANCE")}
              disabled={isUpdatingMode}
              className="h-7 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <Layers className="size-3.5" />
              Binance Only
            </Button>
            <Button
              type="button"
              size="sm"
              variant={targetExchange === "TOKOCRYPTO" ? "default" : "ghost"}
              onClick={() => handleUpdateTargetExchange("TOKOCRYPTO")}
              disabled={isUpdatingMode}
              className="h-7 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <Coins className="size-3.5 text-amber-500" />
              Tokocrypto Only
            </Button>
            <Button
              type="button"
              size="sm"
              variant={targetExchange === "BOTH" ? "default" : "ghost"}
              onClick={() => handleUpdateTargetExchange("BOTH")}
              disabled={isUpdatingMode}
              className="h-7 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <span className="flex items-center gap-0.5">
                <Layers className="size-3" />
                <span className="text-[10px] text-muted-foreground">&</span>
                <Coins className="size-3 text-amber-500" />
              </span>
              Dual Mode
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. KARTU METRIK UTAMA (4 METRICS) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Active Routing Target */}
        <Card className="shadow-sm border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-primary">
              Active Signal Target
            </CardTitle>
            <BotIcon className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="text-xl font-bold tracking-tight">
              {isDual
                ? "Dual Mode (Both)"
                : isTokocrypto
                  ? "Tokocrypto Spot"
                  : "Binance Futures"}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Mode:</span>
              <span className="font-semibold text-foreground">
                {isDual
                  ? `Binance & Toko (${isDryRun ? "Dry-Run" : "Live"})`
                  : isTokocrypto
                    ? isDryRun
                      ? "Dry-Run (Paper)"
                      : "Live Spot"
                    : config?.environment || "TESTNET"}
              </span>
            </div>
            <div className="pt-2">
              {isDual ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate("binance-config")}
                    className="flex-1 h-7 text-[10px] gap-1 cursor-pointer bg-background"
                  >
                    <Layers className="size-3" />
                    Binance Config
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate("tokocrypto-config")}
                    className="flex-1 h-7 text-[10px] gap-1 cursor-pointer bg-background"
                  >
                    <Coins className="size-3 text-amber-500" />
                    Toko Config
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onNavigate(
                      isTokocrypto ? "tokocrypto-config" : "binance-config",
                    )
                  }
                  className="w-full h-7 text-[11px] gap-1 cursor-pointer bg-background"
                >
                  <SlidersIcon className="size-3" />
                  {isTokocrypto ? "Configure Tokocrypto" : "Configure Binance"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Binance Futures Overview */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="size-3.5 text-primary" />
              Binance Futures
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {binanceData.positions.length} Open
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xl font-bold font-mono tracking-tight">
              {binanceData.account
                ? `$${(binanceData.account.totalWalletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Unrealized PnL:</span>
              <span
                className={`font-mono font-medium ${
                  binancePnl >= 0 ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {binancePnl >= 0 ? "+" : ""}${binancePnl.toFixed(2)}
              </span>
            </div>
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("binance-positions")}
                className="w-full h-7 text-[11px] gap-1 cursor-pointer justify-between px-2 text-primary hover:text-primary"
              >
                <span>View Positions</span>
                <ArrowRight className="size-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Tokocrypto Spot Overview */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Coins className="size-3.5 text-amber-500" />
              Tokocrypto Spot
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {tokocryptoData.positions.length} Coins
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xl font-bold font-mono tracking-tight">
              {tokocryptoData.account
                ? `${tokocryptoData.account.quoteAsset === "BIDR" ? "Rp " : "$"}${(tokocryptoData.account.totalWalletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Spot PnL:</span>
              <span
                className={`font-mono font-medium ${
                  tokocryptoPnl >= 0 ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {tokocryptoPnl >= 0 ? "+" : ""}
                {tokocryptoData.account?.quoteAsset === "BIDR" ? "Rp " : "$"}
                {tokocryptoPnl.toFixed(2)}
              </span>
            </div>
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("tokocrypto-positions")}
                className="w-full h-7 text-[11px] gap-1 cursor-pointer justify-between px-2 text-primary hover:text-primary"
              >
                <span>View Spot Coins</span>
                <ArrowRight className="size-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Signal Receiver & License */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Client License & Filter
            </CardTitle>
            <ShieldCheck className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5">
              {config?.clientToken ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <span className="truncate">License Active</span>
                </>
              ) : (
                <>
                  <AlertCircle className="size-4 text-amber-500 shrink-0" />
                  <span>No License Token</span>
                </>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Coin Scope:</span>
              <span className="font-semibold text-foreground">
                {isDual
                  ? `Binance: ${config?.binanceCoinFilterMode || config?.coinFilterMode || "ALL"} • Toko: ${config?.tokocryptoCoinFilterMode || "ALL"}`
                  : isTokocrypto
                    ? `${config?.tokocryptoCoinFilterMode || "ALL"}`
                    : `${config?.binanceCoinFilterMode || config?.coinFilterMode || "ALL"}`}
              </span>
            </div>
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("logs")}
                className="w-full h-7 text-[11px] gap-1 cursor-pointer justify-between px-2 text-primary hover:text-primary"
              >
                <span>View System Logs</span>
                <ArrowRight className="size-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. SNAPSHOT DUA BURSA (SIDE-BY-SIDE SNAPSHOT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Binance Futures Snapshot */}
        <Card className="shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                Binance Futures Snapshot
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate("binance-positions")}
                className="h-7 text-xs gap-1 cursor-pointer"
              >
                Manage Positions
                <ArrowRight className="size-3" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Live open contracts with leverage and liquidation risk.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {binanceData.positions.length === 0 ? (
              <div className="h-32 rounded-lg border border-dashed flex flex-col items-center justify-center text-muted-foreground text-xs p-4 text-center">
                <p className="font-medium text-foreground">
                  No Active Futures Positions
                </p>
                <p className="text-[11px] mt-0.5">
                  Positions opened on Binance Futures will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {binanceData.positions.slice(0, 3).map((pos) => {
                  const isProfit = (pos.unRealizedProfit || 0) >= 0;
                  return (
                    <div
                      key={pos.symbol}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{pos.symbol}</span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-3.5"
                          >
                            {pos.side} {pos.leverage}x
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Entry: ${pos.entryPrice} • Liq: $
                          {pos.liquidationPrice}
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <span
                          className={`font-bold ${isProfit ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {isProfit ? "+" : ""}$
                          {(pos.unRealizedProfit || 0).toFixed(2)}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {(pos.roiPct || 0).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
                {binanceData.positions.length > 3 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-1">
                    +{binanceData.positions.length - 3} more open positions...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tokocrypto Spot Snapshot */}
        <Card className="shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="size-4 text-amber-500" />
                Tokocrypto Spot Snapshot
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate("tokocrypto-positions")}
                className="h-7 text-xs gap-1 cursor-pointer"
              >
                Manage Spot Coins
                <ArrowRight className="size-3" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Live spot coin holdings monitored with auto TP (+5%) & SL (-2.5%).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {tokocryptoData.positions.length === 0 ? (
              <div className="h-32 rounded-lg border border-dashed flex flex-col items-center justify-center text-muted-foreground text-xs p-4 text-center">
                <p className="font-medium text-foreground">
                  No Active Spot Coins
                </p>
                <p className="text-[11px] mt-0.5">
                  Spot purchases on Tokocrypto will be tracked here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tokocryptoData.positions.slice(0, 3).map((pos) => {
                  const isProfit = (pos.unRealizedProfit || 0) >= 0;
                  return (
                    <div
                      key={pos.id || pos.symbol}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{pos.symbol}</span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-3.5 border-amber-500/30 text-amber-600"
                          >
                            SPOT BUY
                          </Badge>
                          {pos.isDryRun && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 h-3.5 text-amber-500 border-amber-500/40"
                            >
                              SIMULASI
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          TP: ${pos.tpPrice} • SL: ${pos.slPrice}
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <span
                          className={`font-bold ${isProfit ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {isProfit ? "+" : ""}$
                          {(pos.unRealizedProfit || 0).toFixed(2)}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {(pos.roiPct || 0).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
                {tokocryptoData.positions.length > 3 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-1">
                    +{tokocryptoData.positions.length - 3} more spot coins...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. RECENT ACTIVITY LOGS SNIPPET */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="size-4 text-primary" />
              Recent Bot Activity
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("logs")}
              className="h-7 text-xs gap-1 cursor-pointer"
            >
              Full Application Logs
              <ArrowRight className="size-3" />
            </Button>
          </div>
          <CardDescription className="text-xs">
            Latest operational events, signal validation, and execution results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-3 text-center">
              No recent activity logs recorded yet.
            </p>
          ) : (
            <div className="space-y-1.5 font-mono text-xs">
              {recentLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-2 rounded bg-muted/30 border border-border/40 text-[11px] leading-relaxed"
                >
                  <span className="text-muted-foreground shrink-0 text-[10px]">
                    [{log.time || new Date().toLocaleTimeString()}]
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1 py-0 h-4 shrink-0 ${
                      log.level === "ERROR"
                        ? "text-red-600 border-red-500/30 bg-red-500/10"
                        : log.level === "SUCCESS"
                          ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                          : log.level === "WARN"
                            ? "text-amber-600 border-amber-500/30 bg-amber-500/10"
                            : "text-primary border-primary/30"
                    }`}
                  >
                    {log.level || "INFO"}
                  </Badge>
                  <span className="text-foreground flex-1 break-all">
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
