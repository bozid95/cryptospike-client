import { useState, useEffect } from "react";
import {
  TrendingUpIcon,
  TrendingDownIcon,
  Trash2Icon,
  Loader2,
  RefreshCw,
  Wallet,
  Coins,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { toast } from "sonner";

const formatPrice = (price: number) => {
  if (!price) return "0";
  return price.toLocaleString(undefined, { maximumFractionDigits: 8 });
};
import { authFetch } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PositionItem = {
  id?: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  positionAmt: number;
  leverage: number;
  unRealizedProfit: number;
  liquidationPrice: number;
  isolatedMargin: number;
  notionalValue: number;
  roiPct: number;
  distanceToLiqPct: number;
  marginType?: "ISOLATED" | "CROSSED" | "SPOT" | string;
  tpPrice?: number;
  slPrice?: number;
  status?: string;
  createdAt?: string;
  isDryRun?: boolean;
};

export type AccountOverview = {
  totalWalletBalance: number;
  totalUnrealizedProfit: number;
  totalMarginBalance?: number;
  availableBalance?: number;
  totalMaintMargin?: number;
  marginRatioPct?: number;
  openPositionsCount?: number;
  totalExposureUsd?: number;
  quoteAsset?: string;
};

interface ActivePositionProps {
  forcedExchange?: "BINANCE" | "TOKOCRYPTO";
  onPositionsCountChange?: (count: number) => void;
}

export default function ActivePosition({
  forcedExchange,
  onPositionsCountChange,
}: ActivePositionProps = {}) {
  const [activeExchange, setActiveExchange] = useState<
    "BINANCE" | "TOKOCRYPTO"
  >(forcedExchange || "BINANCE");
  const [quoteAsset, setQuoteAsset] = useState<string>("USDT");
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [isLoadingPositions, setIsLoadingPositions] = useState(true);
  const [isClosingSymbol, setIsClosingSymbol] = useState<string | null>(null);
  const [itemToClose, setItemToClose] = useState<PositionItem | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (forcedExchange) {
      setActiveExchange(forcedExchange);
    }
  }, [forcedExchange]);

  // Ambil data posisi & ringkasan akun live dari bursa aktif
  const fetchPositions = async () => {
    try {
      const url = forcedExchange
        ? `/api/positions?exchange=${forcedExchange}`
        : "/api/positions";
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (forcedExchange) {
            setActiveExchange(forcedExchange);
          } else if (data.exchange) {
            setActiveExchange(
              data.exchange.toUpperCase() === "TOKOCRYPTO"
                ? "TOKOCRYPTO"
                : "BINANCE",
            );
          }
          if (data.account?.quoteAsset) {
            setQuoteAsset(data.account.quoteAsset);
          }
          if (Array.isArray(data.positions)) {
            setPositions(data.positions);
            onPositionsCountChange?.(data.positions.length);
          }
          if (data.account) {
            setAccount(data.account);
          }
        }
      }
    } catch {
      // Background poll silently
    } finally {
      setIsLoadingPositions(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(() => {
      fetchPositions();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Live WebSocket untuk Mark Price Binance Futures
  useEffect(() => {
    if (activeExchange !== "BINANCE") return;

    const wsUrl = "wss://fstream.binance.com/ws/!markPrice@arr@1s";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("🟢 Binance WebSocket Connected:", wsUrl);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          setLivePrices((prev) => {
            const newPrices = { ...prev };
            data.forEach((item) => {
              if (item.s && item.p) {
                newPrices[item.s] = parseFloat(item.p);
              }
            });
            return newPrices;
          });
        }
      } catch (e) {
        // Abaikan error parse
      }
    };

    ws.onerror = (error) => {
      console.error("🔴 Binance WebSocket Error:", error);
    };

    ws.onclose = () => {
      console.log("⚪ Binance WebSocket Disconnected");
    };

    return () => ws.close();
  }, [activeExchange]);

  const [isCloseAllModalOpen, setIsCloseAllModalOpen] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);

  const handleCloseAll = async () => {
    try {
      setIsClosingAll(true);
      const res = await authFetch("/api/positions/close-all", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message);
        setIsCloseAllModalOpen(false);
        fetchPositions();
      } else {
        toast.error("Failed to close all positions", {
          description: data.message,
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsClosingAll(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!itemToClose) return;
    const { symbol, id } = itemToClose;

    try {
      setIsClosingSymbol(symbol);
      const res = await authFetch("/api/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, tradeId: id }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(
          data.message || `Position ${symbol} successfully closed!`,
        );
        fetchPositions();
        setItemToClose(null);
      } else {
        toast.error(`Failed to close position ${symbol}`, {
          description: data.message,
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsClosingSymbol(null);
    }
  };

  // Derivasi data live dari WebSocket vs Polling
  const livePositions = positions.map((pos) => {
    const isSpot = activeExchange === "TOKOCRYPTO" || pos.marginType === "SPOT";
    const currentMarkPrice =
      !isSpot && livePrices[pos.symbol]
        ? livePrices[pos.symbol]
        : pos.markPrice;

    if (isSpot) {
      const liveUnRealizedProfit =
        (currentMarkPrice - pos.entryPrice) * pos.positionAmt;
      const liveRoiPct =
        pos.entryPrice > 0
          ? ((currentMarkPrice - pos.entryPrice) / pos.entryPrice) * 100
          : 0;
      return {
        ...pos,
        liveMarkPrice: currentMarkPrice,
        liveUnRealizedProfit,
        liveRoiPct,
      };
    }

    const isLong = pos.side === "LONG";
    const originalPnlDiff = isLong
      ? (pos.markPrice - pos.entryPrice) * pos.positionAmt
      : (pos.entryPrice - pos.markPrice) * pos.positionAmt;
    const currentPnlDiff = isLong
      ? (currentMarkPrice - pos.entryPrice) * pos.positionAmt
      : (pos.entryPrice - currentMarkPrice) * pos.positionAmt;

    const liveUnRealizedProfit =
      pos.unRealizedProfit + (currentPnlDiff - originalPnlDiff);

    const initialMargin =
      (pos.entryPrice * pos.positionAmt) / (pos.leverage || 1);
    const liveRoiPct =
      initialMargin > 0
        ? (liveUnRealizedProfit / initialMargin) * 100
        : pos.roiPct;

    return {
      ...pos,
      liveMarkPrice: currentMarkPrice,
      liveUnRealizedProfit,
      liveRoiPct,
    };
  });

  // Agregasi Live Metrics untuk Kartu Akun
  const liveTotalUnrealizedProfit = livePositions.reduce(
    (acc, pos) => acc + pos.liveUnRealizedProfit,
    0,
  );
  const liveTotalMarginBalance = account
    ? (account.totalWalletBalance || 0) + liveTotalUnrealizedProfit
    : 0;
  const liveMarginRatioPct =
    liveTotalMarginBalance > 0 &&
    account &&
    account.totalMaintMargin !== undefined
      ? (account.totalMaintMargin / liveTotalMarginBalance) * 100
      : account?.marginRatioPct || 0;
  const isLiveNetProfit = liveTotalUnrealizedProfit >= 0;

  return (
    <div className="space-y-6">
      {/* 1. KARTU ANALITIK & METRIK (ADAPTIF UNTUK FUTURES / SPOT) */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Saldo Dompet */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {activeExchange === "TOKOCRYPTO"
                ? `Wallet Balance (${quoteAsset})`
                : "Total Wallet Balance"}
            </CardTitle>
            <Wallet className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold font-mono tracking-tight truncate">
              {account
                ? `${quoteAsset === "BIDR" ? "Rp " : "$"}${account.totalWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>
                {activeExchange === "TOKOCRYPTO"
                  ? "Quote Asset:"
                  : "Available:"}
              </span>
              <span className="font-mono font-medium text-foreground truncate max-w-[90px] sm:max-w-none text-right">
                {activeExchange === "TOKOCRYPTO"
                  ? quoteAsset
                  : `$${(account?.availableBalance || 0).toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Unrealized PnL Akumulatif */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {activeExchange === "TOKOCRYPTO"
                ? "Total Unrealized PnL"
                : "Total Unrealized PnL"}
            </CardTitle>
            {isLiveNetProfit ? (
              <ArrowUpRight className="size-4 text-emerald-500" />
            ) : (
              <ArrowDownRight className="size-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-lg sm:text-2xl font-bold font-mono tracking-tight truncate ${
                isLiveNetProfit ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {account
                ? `${liveTotalUnrealizedProfit >= 0 ? "+" : ""}${quoteAsset === "BIDR" ? "Rp " : "$"}${liveTotalUnrealizedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>
                {activeExchange === "TOKOCRYPTO"
                  ? "Position Type:"
                  : "Margin Balance:"}
              </span>
              <span className="font-mono font-medium text-foreground">
                {activeExchange === "TOKOCRYPTO"
                  ? "Open Spot Trades"
                  : `$${liveTotalMarginBalance.toFixed(2)}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Margin Health (Futures) vs Market Mode (Spot) */}
        {activeExchange === "TOKOCRYPTO" ? (
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Market & Safety
              </CardTitle>
              <ShieldCheck className="size-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-lg sm:text-2xl font-bold font-mono tracking-tight text-foreground truncate">
                  SPOT (1x)
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-4 font-mono border-emerald-500/40 text-emerald-500 bg-emerald-500/10 shrink-0"
                >
                  NO LIQ
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
                <span>Targets:</span>
                <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400 text-[11px] sm:text-xs">
                  +5% TP / -2.5% SL
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Margin Ratio (Risk)
              </CardTitle>
              <ShieldCheck className="size-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-lg sm:text-2xl font-bold font-mono tracking-tight text-foreground truncate">
                  {account ? `${liveMarginRatioPct.toFixed(2)}%` : "0.00%"}
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-4 font-mono border-emerald-500/40 text-emerald-500 bg-emerald-500/10 shrink-0"
                >
                  OK
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
                <span>Maint. Margin:</span>
                <span className="font-mono font-medium text-foreground">
                  $
                  {account
                    ? (account.totalMaintMargin || 0).toFixed(2)
                    : "0.00"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Card 4: Notional Exposure & Active Positions */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground truncate">
              {activeExchange === "TOKOCRYPTO"
                ? "Active Spot Coins"
                : "Market Exposure"}
            </CardTitle>
            <Layers className="size-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold font-mono tracking-tight truncate">
              {activeExchange === "TOKOCRYPTO"
                ? `${positions.length} Coins`
                : `$${(account?.totalExposureUsd || 0).toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    },
                  )}`}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>
                {activeExchange === "TOKOCRYPTO"
                  ? "Monitor:"
                  : "Active:"}
              </span>
              <span className="font-mono font-medium text-foreground">
                {activeExchange === "TOKOCRYPTO"
                  ? "Auto ON"
                  : `${positions.length} Pos`}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. TABEL / KARTU POSISI AKTIF */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-3.5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2">
              <Coins className="size-4 text-primary" />
              <h3 className="font-semibold text-base sm:text-lg leading-none tracking-tight">
                Active Positions
              </h3>
              <Badge variant="outline" className="text-[10px] sm:text-[11px] font-mono">
                {activeExchange === "TOKOCRYPTO"
                  ? "Tokocrypto Spot"
                  : "Binance Futures"}{" "}
                • {positions.length} Open
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {activeExchange === "TOKOCRYPTO"
                ? "List of active Tokocrypto Spot coin holdings with automated TP (+5%) and SL (-2.5%) monitoring."
                : "List of open Binance Futures positions with real-time entry, liquidation, and PnL."}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {positions.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsCloseAllModalOpen(true)}
                disabled={isClosingAll}
                className="h-8 text-xs cursor-pointer w-full sm:w-auto font-semibold"
              >
                <Trash2Icon className="mr-1.5 size-3.5" />
                {activeExchange === "TOKOCRYPTO"
                  ? "Sell All Coins"
                  : "Close All"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPositions}
              disabled={isLoadingPositions}
              className="h-8 text-xs cursor-pointer w-full sm:w-auto"
            >
              <RefreshCw
                className={`mr-1.5 size-3.5 ${isLoadingPositions ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {isLoadingPositions && positions.length === 0 ? (
          <div className="h-32 rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>
              Loading position data from{" "}
              {activeExchange === "TOKOCRYPTO"
                ? "Tokocrypto Spot"
                : "Binance Futures"}
              ...
            </span>
          </div>
        ) : positions.length === 0 ? (
          <div className="h-32 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground text-sm p-4 text-center">
            <p className="font-medium text-foreground">No Active Positions</p>
            <p className="text-xs">
              {activeExchange === "TOKOCRYPTO"
                ? "There are currently no open spot coin positions on Tokocrypto."
                : "There are currently no open positions on Binance Futures."}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< sm) */}
            <div className="sm:hidden space-y-3">
              {livePositions.map((pos) => {
                const isLong = pos.side === "LONG";
                const isSpot =
                  activeExchange === "TOKOCRYPTO" || pos.marginType === "SPOT";
                const isProfit = pos.liveUnRealizedProfit >= 0;
                const isClosing = isClosingSymbol === pos.symbol;

                return (
                  <div
                    key={pos.id || pos.symbol}
                    className="p-3.5 rounded-lg border bg-muted/20 space-y-3"
                    className="p-3 sm:p-3.5 rounded-lg border bg-muted/20 space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-sm tracking-tight">
                    {/* Header Row: Symbol & PnL */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <span className="font-bold text-sm tracking-tight block truncate">
                          {pos.symbol}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant={isLong ? "default" : "destructive"}
                            className={`text-[10px] px-1.5 py-0 h-4 font-semibold ${
                            className={`text-[9px] sm:text-[10px] px-1.5 py-0 h-4 font-semibold ${
                              isLong
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                : "bg-red-500/10 text-red-500 border-red-500/30"
                            }`}
                          >
                            {isLong ? (
                              <TrendingUpIcon className="mr-1 h-3 w-3" />
                              <TrendingUpIcon className="mr-0.5 h-2.5 w-2.5" />
                            ) : (
                              <TrendingDownIcon className="mr-1 h-3 w-3" />
                              <TrendingDownIcon className="mr-0.5 h-2.5 w-2.5" />
                            )}
                            {isSpot
                              ? "BUY (SPOT)"
                              ? "SPOT BUY"
                              : `${pos.side} ${pos.leverage}x`}
                          </Badge>
                          {isSpot ? (
                            pos.isDryRun && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 font-mono font-medium text-amber-500 border-amber-500/40 bg-amber-500/10"
                              >
                                SIMULASI
                              </Badge>
                            )
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 h-4 font-mono font-medium text-muted-foreground border-border"
                            >
                              {pos.marginType === "CROSSED"
                                ? "CROSS"
                                : "ISOLATED"}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-right font-mono">
                      <div className="text-right font-mono shrink-0">
                        <div
                          className={`text-sm font-bold leading-tight ${
                            isProfit ? "text-emerald-500" : "text-red-500"
                          }`}
                        >
                          {isProfit ? "+" : ""}
                          {pos.liveUnRealizedProfit.toFixed(2)}{" "}
                          {activeExchange === "TOKOCRYPTO"
                            ? quoteAsset
                            : "USDT"}
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
                          className={`text-[10px] sm:text-[11px] font-semibold ${
                            isProfit ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          ({pos.liveRoiPct >= 0 ? "+" : ""}
                          {pos.liveRoiPct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-background/50 p-2.5 rounded border border-border/50">
                      <div>
                    {/* 2x2 Grid: Clear values with labels */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-background/50 p-2.5 rounded-lg border border-border/50">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          Size & Value
                        </span>
                        <span className="font-semibold">
                        <span className="font-semibold block truncate">
                          {pos.positionAmt.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          (~${pos.notionalValue.toFixed(2)})
                        </span>
                      </div>
                      <div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          {isSpot ? "Target TP / SL" : "Liq. Price"}
                        </span>
                        {isSpot ? (
                          <span className="text-emerald-500 font-medium text-[11px]">
                            TP:{" "}
                            {formatPrice(pos.tpPrice || pos.entryPrice * 1.05)}
                          </span>
                          <div className="text-[10px] sm:text-[11px] font-mono leading-tight space-y-0.5">
                            <span className="text-emerald-500 block truncate">
                              TP: ${formatPrice(pos.tpPrice || pos.entryPrice * 1.05)}
                            </span>
                            <span className="text-red-500 block truncate">
                              SL: ${formatPrice(pos.slPrice || pos.entryPrice * 0.975)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-amber-500 font-medium">
                          <span className="text-amber-500 font-semibold block text-xs truncate">
                            {pos.liquidationPrice > 0
                              ? formatPrice(pos.liquidationPrice)
                              ? `$${formatPrice(pos.liquidationPrice)}`
                              : "Safe (Cross)"}
                          </span>
                        )}
                      </div>
                      <div>
                      <div className="space-y-0.5 pt-1 border-t border-border/30">
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          Entry Price
                        </span>
                        <span>{formatPrice(pos.entryPrice)}</span>
                        <span className="font-semibold block truncate">
                          ${formatPrice(pos.entryPrice)}
                        </span>
                      </div>
                      <div>
                      <div className="space-y-0.5 pt-1 border-t border-border/30">
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          Mark / Live
                          Mark Price
                        </span>
                        <span className="text-muted-foreground">
                          {formatPrice(pos.liveMarkPrice)}
                        <span className="text-muted-foreground block truncate">
                          ${formatPrice(pos.liveMarkPrice)}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isClosing}
                      className="w-full h-8 text-xs cursor-pointer"
                      className="w-full h-8 text-xs cursor-pointer font-semibold"
                      onClick={() => setItemToClose(pos)}
                    >
                      {isClosing ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin mr-1.5" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Trash2Icon className="h-3.5 w-3.5 mr-1.5" />
                          {isSpot ? "Sell Now" : "Close Position"}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= sm) */}
            <div className="hidden sm:block rounded-lg border overflow-x-auto">
              <Table className="min-w-[650px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[170px] px-4 py-3 font-semibold text-xs">
                      Pair / Direction
                    </TableHead>
                    <TableHead className="w-[130px] px-4 py-3 font-semibold text-xs">
                      Size & Notional
                    </TableHead>
                    <TableHead className="w-[140px] px-4 py-3 font-semibold text-xs">
                      Entry & Mark
                    </TableHead>
                    <TableHead className="w-[130px] px-4 py-3 font-semibold text-xs">
                      {activeExchange === "TOKOCRYPTO"
                        ? "Target TP / SL"
                        : "Liq. Price"}
                    </TableHead>
                    <TableHead className="w-[140px] px-4 py-3 font-semibold text-xs">
                      Unrealized PnL (ROI)
                    </TableHead>
                    <TableHead className="w-[100px] px-4 py-3 text-right font-semibold text-xs">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {livePositions.map((pos) => {
                    const isLong = pos.side === "LONG";
                    const isSpot =
                      activeExchange === "TOKOCRYPTO" ||
                      pos.marginType === "SPOT";
                    const isProfit = pos.liveUnRealizedProfit >= 0;
                    const isClosing = isClosingSymbol === pos.symbol;

                    return (
                      <TableRow
                        key={pos.id || pos.symbol}
                        className="hover:bg-muted/30"
                      >
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-sm tracking-tight">
                              {pos.symbol}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge
                                variant={isLong ? "default" : "destructive"}
                                className={`w-fit text-[10px] px-1.5 py-0 h-4 font-semibold ${
                                  isLong
                                    ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30"
                                    : "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30"
                                }`}
                              >
                                {isLong ? (
                                  <TrendingUpIcon className="mr-1 h-3 w-3" />
                                ) : (
                                  <TrendingDownIcon className="mr-1 h-3 w-3" />
                                )}
                                {isSpot
                                  ? "BUY (SPOT)"
                                  : `${pos.side} ${pos.leverage}x`}
                              </Badge>
                              {isSpot ? (
                                pos.isDryRun && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0 h-4 font-mono font-medium text-amber-500 border-amber-500/40 bg-amber-500/10"
                                  >
                                    SIMULASI
                                  </Badge>
                                )
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 h-4 font-mono font-medium text-muted-foreground border-border"
                                >
                                  {pos.marginType === "CROSSED"
                                    ? "CROSS"
                                    : "ISOLATED"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-col font-mono text-xs">
                            <span className="font-semibold text-foreground">
                              {pos.positionAmt.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground text-[11px]">
                              ~${pos.notionalValue.toFixed(2)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-col font-mono text-xs">
                            <span>Entry: {formatPrice(pos.entryPrice)}</span>
                            <span className="text-muted-foreground">
                              Mark: {formatPrice(pos.liveMarkPrice)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {isSpot ? (
                            <div className="flex flex-col font-mono text-xs">
                              <span className="text-emerald-500 font-medium">
                                TP:{" "}
                                {formatPrice(
                                  pos.tpPrice || pos.entryPrice * 1.05,
                                )}
                              </span>
                              <span className="text-red-400 text-[11px]">
                                SL:{" "}
                                {formatPrice(
                                  pos.slPrice || pos.entryPrice * 0.975,
                                )}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col font-mono text-xs">
                              <span className="text-amber-500 font-medium">
                                {pos.liquidationPrice > 0
                                  ? formatPrice(pos.liquidationPrice)
                                  : "Safe (Cross)"}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-col font-mono">
                            <span
                              className={`text-sm font-bold ${
                                isProfit ? "text-emerald-500" : "text-red-500"
                              }`}
                            >
                              {isProfit ? "+" : ""}
                              {pos.liveUnRealizedProfit.toFixed(2)}{" "}
                              {activeExchange === "TOKOCRYPTO"
                                ? quoteAsset
                                : "USDT"}
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                isProfit ? "text-emerald-600" : "text-red-500"
                              }`}
                            >
                              ({pos.liveRoiPct >= 0 ? "+" : ""}
                              {pos.liveRoiPct.toFixed(2)}%)
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isClosing}
                            className="h-7 text-xs px-2.5 cursor-pointer"
                            onClick={() => setItemToClose(pos)}
                          >
                            {isClosing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2Icon className="h-3.5 w-3.5 mr-1" />
                                {isSpot ? "Sell Now" : "Close"}
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Popup Modal for Closing / Selling Single Position */}
      <Dialog
        open={Boolean(itemToClose)}
        onOpenChange={(open) => {
          if (!open && !isClosingSymbol) setItemToClose(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {activeExchange === "TOKOCRYPTO"
                ? "Sell Spot Position Confirmation"
                : "Close Position Confirmation"}
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              {activeExchange === "TOKOCRYPTO" ? (
                <span>
                  Are you sure you want to sell your open spot holding of{" "}
                  <span className="font-mono font-bold text-foreground">
                    {itemToClose?.symbol}
                  </span>{" "}
                  back to {quoteAsset}? This action will execute immediately on
                  Tokocrypto.
                </span>
              ) : (
                <span>
                  Are you sure you want to market close your open{" "}
                  <span className="font-mono font-bold text-foreground">
                    {itemToClose?.symbol}
                  </span>{" "}
                  position on Binance Futures? This action will execute
                  immediately.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={Boolean(isClosingSymbol)}
              onClick={() => setItemToClose(null)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={Boolean(isClosingSymbol)}
              onClick={handleConfirmClose}
              className="text-xs cursor-pointer gap-1.5"
            >
              {isClosingSymbol ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {activeExchange === "TOKOCRYPTO"
                    ? "Selling..."
                    : "Closing Position..."}
                </>
              ) : (
                <>
                  <Trash2Icon className="size-3.5" />
                  {activeExchange === "TOKOCRYPTO"
                    ? "Confirm Sell"
                    : "Confirm Close"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Popup Modal for Closing ALL Positions */}
      <Dialog
        open={isCloseAllModalOpen}
        onOpenChange={(open) => {
          if (!open && !isClosingAll) setIsCloseAllModalOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-red-600 dark:text-red-500">
              {activeExchange === "TOKOCRYPTO"
                ? "Sell ALL Spot Positions Confirmation"
                : "Close ALL Positions Confirmation"}
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              {activeExchange === "TOKOCRYPTO" ? (
                <span>
                  Are you sure you want to market sell{" "}
                  <strong>ALL {positions.length} open spot positions</strong>{" "}
                  back to {quoteAsset}? This action will execute immediately and
                  cannot be undone.
                </span>
              ) : (
                <span>
                  Are you sure you want to market close{" "}
                  <strong>ALL {positions.length} open positions</strong> on
                  Binance Futures? This action will execute immediately and
                  cannot be undone.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isClosingAll}
              onClick={() => setIsCloseAllModalOpen(false)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isClosingAll}
              onClick={handleCloseAll}
              className="text-xs cursor-pointer gap-1.5"
            >
              {isClosingAll ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2Icon className="size-3.5" />
                  {activeExchange === "TOKOCRYPTO"
                    ? "Yes, Sell All Coins"
                    : "Yes, Close All"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
