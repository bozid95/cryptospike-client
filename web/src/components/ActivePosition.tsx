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

  const handleClosePosition = async (symbol: string) => {
    if (!confirm(`Tutup posisi ${symbol} di Binance Futures sekarang?`)) {
      return;
    }

    try {
      setIsClosingSymbol(symbol);
      const res = await authFetch("/api/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Posisi ${symbol} Berhasil Ditutup!`);
        fetchPositions();
      } else {
        toast.error(`Gagal Menutup Posisi ${symbol}`, {
          description: data.message,
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsClosingSymbol(null);
    }
  };

  const isNetProfit = (account?.totalUnrealizedProfit ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* 1. KARTU ANALITIK & METRIK BINANCE FUTURES */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            {isNetProfit ? (
              <ArrowUpRight className="size-4 text-emerald-500" />
            ) : (
              <ArrowDownRight className="size-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono tracking-tight ${
                isNetProfit ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {account
                ? `${account.totalUnrealizedProfit >= 0 ? "+" : ""}$${account.totalUnrealizedProfit.toFixed(2)}`
                : "$0.00"}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span>Margin Balance:</span>
              <span className="font-mono font-medium text-foreground">
                ${account ? account.totalMarginBalance.toFixed(2) : "0.00"}
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
                {account ? `${account.marginRatioPct.toFixed(2)}%` : "0.00%"}
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

      {/* 2. TABEL POSISI AKTIF LENGKAP */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
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
              Daftar posisi trading terbuka Binance Futures beserta detail
              harga, likuidasi, dan PnL riil
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchPositions}
            disabled={isLoadingPositions}
            className="h-8 text-xs cursor-pointer"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${isLoadingPositions ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <Table>
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
                  Liq. Price & Dist.
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
              {isLoadingPositions && positions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-muted-foreground text-sm"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      <span>Memuat data posisi dari Binance Futures...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : positions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-muted-foreground text-sm"
                  >
                    Tidak ada posisi aktif yang sedang terbuka di Binance
                    Futures.
                  </TableCell>
                </TableRow>
              ) : (
                positions.map((pos) => {
                  const isLong = pos.side === "LONG";
                  const isProfit = pos.unRealizedProfit >= 0;
                  const isClosing = isClosingSymbol === pos.symbol;

                  return (
                    <TableRow key={pos.symbol} className="hover:bg-muted/30">
                      <TableCell className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-sm tracking-tight">
                            {pos.symbol}
                          </span>
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
                          <span>Entry: {pos.entryPrice.toLocaleString()}</span>
                          <span className="text-muted-foreground">
                            Mark: {pos.markPrice.toLocaleString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex flex-col font-mono text-xs">
                          <span className="text-amber-500 font-medium">
                            {pos.liquidationPrice > 0
                              ? pos.liquidationPrice.toLocaleString()
                              : "Safe (Cross)"}
                          </span>
                          {pos.distanceToLiqPct > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {pos.distanceToLiqPct.toFixed(1)}% away
                            </span>
                          )}
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
                            {pos.unRealizedProfit.toFixed(2)} USDT
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              isProfit ? "text-emerald-600" : "text-red-500"
                            }`}
                          >
                            ({pos.roiPct >= 0 ? "+" : ""}
                            {pos.roiPct.toFixed(2)}%)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isClosing}
                          className="h-7 text-xs px-2.5 cursor-pointer"
                          onClick={() => handleClosePosition(pos.symbol)}
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
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
