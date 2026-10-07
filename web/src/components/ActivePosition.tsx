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
  marginType?: "ISOLATED" | "CROSSED" | string;
};

export type AccountOverview = {
  totalWalletBalance: number;
  totalUnrealizedProfit: number;
  totalMarginBalance: number;
  availableBalance: number;
  totalMaintMargin: number;
  marginRatioPct: number;
  openPositionsCount: number;
  totalExposureUsd: number;
};

interface ActivePositionProps {
  onPositionsCountChange?: (count: number) => void;
}

export default function ActivePosition({
  onPositionsCountChange,
}: ActivePositionProps = {}) {
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [isLoadingPositions, setIsLoadingPositions] = useState(true);
  const [isClosingSymbol, setIsClosingSymbol] = useState<string | null>(null);
  const [symbolToClose, setSymbolToClose] = useState<string | null>(null);

  const [environment, setEnvironment] = useState<string>("");
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // Ambil data posisi & ringkasan akun live dari Binance
  const fetchPositions = async () => {
    try {
      const res = await authFetch("/api/positions");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.positions)) {
            setPositions(data.positions);
            onPositionsCountChange?.(data.positions.length);
          }
          if (data.account) {
            setAccount(data.account);
          }
          if (data.environment) {
            setEnvironment(data.environment);
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

  // Live WebSocket untuk Mark Price All Symbols
  useEffect(() => {
    if (!environment) return;
    // Menggunakan Live Websocket sesuai permintaan
    const wsUrl = "wss://fstream.binance.com/ws/!markPrice@arr@1s";

    const ws = new WebSocket(wsUrl);
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
    return () => ws.close();
  }, [environment]);

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
    if (!symbolToClose) return;
    const symbol = symbolToClose;

    try {
      setIsClosingSymbol(symbol);
      const res = await authFetch("/api/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Position ${symbol} successfully closed!`);
        fetchPositions();
        setSymbolToClose(null);
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
    const isLong = pos.side === "LONG";
    const currentMarkPrice = livePrices[pos.symbol] || pos.markPrice;

    // Kalkulasi perbedaan PnL berdasarkan pergerakan mark price sejak polling terakhir
    const originalPnlDiff = isLong
      ? (pos.markPrice - pos.entryPrice) * pos.positionAmt
      : (pos.entryPrice - pos.markPrice) * pos.positionAmt;
    const currentPnlDiff = isLong
      ? (currentMarkPrice - pos.entryPrice) * pos.positionAmt
      : (pos.entryPrice - currentMarkPrice) * pos.positionAmt;

    const liveUnRealizedProfit =
      pos.unRealizedProfit + (currentPnlDiff - originalPnlDiff);

    // Kalkulasi ROI
    const initialMargin = (pos.entryPrice * pos.positionAmt) / pos.leverage;
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
    ? account.totalWalletBalance + liveTotalUnrealizedProfit
    : 0;
  const liveMarginRatioPct =
    liveTotalMarginBalance > 0 && account
      ? (account.totalMaintMargin / liveTotalMarginBalance) * 100
      : account?.marginRatioPct || 0;
  const isLiveNetProfit = liveTotalUnrealizedProfit >= 0;

  return (
    <div className="space-y-6">
      {/* 1. KARTU ANALITIK & METRIK BINANCE FUTURES */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Saldo Dompet */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Wallet Balance
            </CardTitle>
            <Wallet className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight">
              {account
                ? `$${account.totalWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>Available:</span>
              <span className="font-mono font-medium text-foreground">
                $
                {account
                  ? account.availableBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "0.00"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Unrealized PnL Akumulatif */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Unrealized PnL
            </CardTitle>
            {isLiveNetProfit ? (
              <ArrowUpRight className="size-4 text-emerald-500" />
            ) : (
              <ArrowDownRight className="size-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono tracking-tight ${
                isLiveNetProfit ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {account
                ? `${liveTotalUnrealizedProfit >= 0 ? "+" : ""}$${liveTotalUnrealizedProfit.toFixed(2)}`
                : "$0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>Margin Balance:</span>
              <span className="font-mono font-medium text-foreground">
                ${account ? liveTotalMarginBalance.toFixed(2) : "0.00"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Margin Health & Risk Ratio */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Margin Ratio (Risk)
            </CardTitle>
            <ShieldCheck className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {account ? `${liveMarginRatioPct.toFixed(2)}%` : "0.00%"}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-mono border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
              >
                HEALTHY
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>Maint. Margin:</span>
              <span className="font-mono font-medium text-foreground">
                ${account ? account.totalMaintMargin.toFixed(2) : "0.00"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Notional Exposure & Active Positions */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Market Exposure
            </CardTitle>
            <Layers className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight">
              $
              {account
                ? account.totalExposureUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>Active Contracts:</span>
              <span className="font-mono font-medium text-foreground">
                {positions.length} Positions
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. TABEL / KARTU POSISI AKTIF */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2">
              <Coins className="size-4 text-primary" />
              <h3 className="font-semibold text-lg leading-none tracking-tight">
                Active Positions
              </h3>
              <Badge variant="outline" className="text-[11px] font-mono">
                {positions.length} Open
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              List of open Binance Futures positions with real-time entry,
              liquidation, and PnL.
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
                Close All
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
            <span>Loading position data from Binance Futures...</span>
          </div>
        ) : positions.length === 0 ? (
          <div className="h-32 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground text-sm p-4 text-center">
            <p className="font-medium text-foreground">No Active Positions</p>
            <p className="text-xs">
              There are currently no open positions on Binance Futures.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< sm) */}
            <div className="sm:hidden space-y-3">
              {livePositions.map((pos) => {
                const isLong = pos.side === "LONG";
                const isProfit = pos.liveUnRealizedProfit >= 0;
                const isClosing = isClosingSymbol === pos.symbol;

                return (
                  <div
                    key={pos.symbol}
                    className="p-3.5 rounded-lg border bg-muted/20 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-sm tracking-tight">
                          {pos.symbol}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant={isLong ? "default" : "destructive"}
                            className={`text-[10px] px-1.5 py-0 h-4 font-semibold ${
                              isLong
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                : "bg-red-500/10 text-red-500 border-red-500/30"
                            }`}
                          >
                            {isLong ? (
                              <TrendingUpIcon className="mr-1 h-3 w-3" />
                            ) : (
                              <TrendingDownIcon className="mr-1 h-3 w-3" />
                            )}
                            {pos.side} {pos.leverage}x
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 h-4 font-mono font-medium text-muted-foreground border-border"
                          >
                            {pos.marginType === "CROSSED"
                              ? "CROSS"
                              : "ISOLATED"}
                          </Badge>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div
                          className={`text-sm font-bold leading-tight ${
                            isProfit ? "text-emerald-500" : "text-red-500"
                          }`}
                        >
                          {isProfit ? "+" : ""}
                          {pos.liveUnRealizedProfit.toFixed(2)} USDT
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
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
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          Size (Notional)
                        </span>
                        <span className="font-semibold">
                          {pos.positionAmt.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          (~${pos.notionalValue.toFixed(2)})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          Liq. Price
                        </span>
                        <span className="text-amber-500 font-medium">
                          {pos.liquidationPrice > 0
                            ? formatPrice(pos.liquidationPrice)
                            : "Safe (Cross)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          Entry Price
                        </span>
                        <span>{formatPrice(pos.entryPrice)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block font-sans">
                          Mark Price
                        </span>
                        <span className="text-muted-foreground">
                          {formatPrice(pos.liveMarkPrice)}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isClosing}
                      className="w-full h-8 text-xs cursor-pointer"
                      onClick={() => setSymbolToClose(pos.symbol)}
                    >
                      {isClosing ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin mr-1.5" />
                          Closing Position...
                        </>
                      ) : (
                        <>
                          <Trash2Icon className="h-3.5 w-3.5 mr-1.5" />
                          Close Position
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
                      Liq. Price
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
                    const isProfit = pos.liveUnRealizedProfit >= 0;
                    const isClosing = isClosingSymbol === pos.symbol;

                    return (
                      <TableRow key={pos.symbol} className="hover:bg-muted/30">
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
                                {pos.side} {pos.leverage}x
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 font-mono font-medium text-muted-foreground border-border"
                              >
                                {pos.marginType === "CROSSED"
                                  ? "CROSS"
                                  : "ISOLATED"}
                              </Badge>
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
                          <div className="flex flex-col font-mono text-xs">
                            <span className="text-amber-500 font-medium">
                              {pos.liquidationPrice > 0
                                ? formatPrice(pos.liquidationPrice)
                                : "Safe (Cross)"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-col font-mono">
                            <span
                              className={`text-sm font-bold ${
                                isProfit ? "text-emerald-500" : "text-red-500"
                              }`}
                            >
                              {isProfit ? "+" : ""}
                              {pos.liveUnRealizedProfit.toFixed(2)} USDT
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
                            onClick={() => setSymbolToClose(pos.symbol)}
                          >
                            {isClosing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2Icon className="h-3.5 w-3.5 mr-1" />
                                Close
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

      {/* Confirmation Popup Modal for Closing Position */}
      <Dialog
        open={Boolean(symbolToClose)}
        onOpenChange={(open) => {
          if (!open && !isClosingSymbol) setSymbolToClose(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Close Position Confirmation
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Are you sure you want to market close your open{" "}
              <span className="font-mono font-bold text-foreground">
                {symbolToClose}
              </span>{" "}
              position on Binance Futures? This action will execute immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={Boolean(isClosingSymbol)}
              onClick={() => setSymbolToClose(null)}
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
                  Closing Position...
                </>
              ) : (
                <>
                  <Trash2Icon className="size-3.5" />
                  Confirm Close
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
              Close ALL Positions Confirmation
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Are you sure you want to market close{" "}
              <strong>ALL {positions.length} open positions</strong> on Binance
              Futures? This action will execute immediately and cannot be
              undone.
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
                  Closing All...
                </>
              ) : (
                <>
                  <Trash2Icon className="size-3.5" />
                  Yes, Close All
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
