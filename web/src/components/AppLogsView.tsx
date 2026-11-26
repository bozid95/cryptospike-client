import { useState, useEffect, useRef } from "react";
import {
  Terminal,
  RefreshCw,
  Trash2,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Play,
  Pause,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export type LogItem = {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
};

const LEVEL_META: Record<
  string,
  { icon: typeof Info; tile: string }
> = {
  SUCCESS: {
    icon: CheckCircle2,
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  INFO: { icon: Info, tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  WARN: {
    icon: AlertTriangle,
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  ERROR: { icon: XCircle, tile: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

/** Kelompokkan log per hari (Today / Yesterday / tanggal), urutan tetap. */
function groupByDay(items: LogItem[]): [string, LogItem[]][] {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const groups: [string, LogItem[]][] = [];
  for (const item of items) {
    const d = new Date(item.timestamp);
    const label = same(d, today)
      ? "Today"
      : same(d, yesterday)
        ? "Yesterday"
        : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(item);
    else groups.push([label, [item]]);
  }
  return groups;
}

export function AppLogsView() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [mobileLimit, setMobileLimit] = useState(100);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const res = await authFetch("/api/logs?limit=1000");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      }
    } catch {
      // ignore poll error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!isAutoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  const handleConfirmClearLogs = async () => {
    try {
      setIsClearingLogs(true);
      await authFetch("/api/logs", { method: "DELETE" });
      setLogs([]);
      toast.success("Application logs have been cleared.");
      setIsClearDialogOpen(false);
    } catch {
      toast.error("Failed to clear logs.");
    } finally {
      setIsClearingLogs(false);
    }
  };

  // Statistik Log
  const totalCount = logs.length;
  const successCount = logs.filter((l) => l.level === "SUCCESS").length;
  const warnCount = logs.filter((l) => l.level === "WARN").length;
  const errorCount = logs.filter((l) => l.level === "ERROR").length;

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesFilter = filterLevel === "ALL" || log.level === filterLevel;
    const matchesSearch =
      searchQuery === "" ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const reversedLogs = [...filteredLogs].reverse();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reversedLogs.length]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Ringkasan Statistik Log */}
      <div className="hidden sm:grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="border-border/80 shadow-sm p-2.5 sm:p-4 flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
              Total Events
            </p>
            <p className="text-lg sm:text-2xl font-bold font-mono mt-0.5 sm:mt-1 truncate">
              {totalCount}
            </p>
          </div>
          <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Terminal className="size-4 sm:size-5" />
          </div>
        </Card>

        <Card className="border-border/80 shadow-sm p-2.5 sm:p-4 flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
              Success Orders
            </p>
            <p className="text-lg sm:text-2xl font-bold font-mono text-emerald-500 mt-0.5 sm:mt-1 truncate">
              {successCount}
            </p>
          </div>
          <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <CheckCircle2 className="size-4 sm:size-5" />
          </div>
        </Card>

        <Card className="border-border/80 shadow-sm p-2.5 sm:p-4 flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
              Warnings
            </p>
            <p className="text-lg sm:text-2xl font-bold font-mono text-amber-500 mt-0.5 sm:mt-1 truncate">
              {warnCount}
            </p>
          </div>
          <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-4 sm:size-5" />
          </div>
        </Card>

        <Card className="border-border/80 shadow-sm p-2.5 sm:p-4 flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
              Errors
            </p>
            <p className="text-lg sm:text-2xl font-bold font-mono text-red-500 mt-0.5 sm:mt-1 truncate">
              {errorCount}
            </p>
          </div>
          <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
            <XCircle className="size-4 sm:size-5" />
          </div>
        </Card>
      </div>

      {/* ===== MOBILE: daftar log ala feed (terbaru di atas) ===== */}
      {/* Tinggi = layar - header (3rem) - padding atas (0.75rem) - ruang bottom nav (5.5rem): halaman tidak memanjang, log di-scroll di dalam kartu */}
      <div className="sm:hidden !mt-0 flex h-[calc(100dvh-9.25rem-env(safe-area-inset-bottom))] flex-col gap-2.5">
        {/* Toolbar: cari + aksi + filter level */}
        <div className="shrink-0 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search logs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded-xl bg-card pl-9 text-sm placeholder:text-muted-foreground"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              aria-label={isAutoRefresh ? "Pause live stream" : "Resume live stream"}
              className={`size-10 shrink-0 rounded-xl bg-card cursor-pointer ${
                isAutoRefresh ? "text-primary border-primary/40" : "text-muted-foreground"
              }`}
            >
              {isAutoRefresh ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchLogs}
              disabled={isLoading}
              aria-label="Refresh"
              className="size-10 shrink-0 rounded-xl bg-card cursor-pointer"
            >
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsClearDialogOpen(true)}
              aria-label="Clear logs"
              className="size-10 shrink-0 rounded-xl bg-card text-red-500 cursor-pointer"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(
              [
                ["ALL", "All", totalCount, "bg-foreground"],
                ["SUCCESS", "Success", successCount, "bg-emerald-500"],
                ["INFO", "Info", logs.filter((l) => l.level === "INFO").length, "bg-sky-500"],
                ["WARN", "Warn", warnCount, "bg-amber-500"],
                ["ERROR", "Error", errorCount, "bg-red-500"],
              ] as const
            ).map(([lvl, label, count, dot]) => {
              const on = filterLevel === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setFilterLevel(lvl);
                    setMobileLimit(100);
                  }}
                  aria-pressed={on}
                  className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors cursor-pointer ${
                    on
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "bg-card text-foreground"
                  }`}
                >
                  <span className="text-sm font-semibold tabular-nums leading-none">
                    {count}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-[11px] leading-none ${on ? "text-primary-foreground/85" : "text-muted-foreground"}`}
                  >
                    {lvl !== "ALL" && (
                      <span className={`size-1.5 rounded-full ${on ? "bg-current" : dot}`} />
                    )}
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status stream */}
        <div className="flex shrink-0 items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
          <span
            className={`size-1.5 rounded-full ${isAutoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`}
          />
          {isAutoRefresh ? "Live · updates automatically" : "Paused"}
          <span className="ml-auto tabular-nums">
            {filteredLogs.length} {filteredLogs.length === 1 ? "event" : "events"}
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card text-center">
            <Info className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {logs.length === 0 ? "No activity yet" : "No matching logs"}
            </p>
            <p className="text-xs text-muted-foreground">
              {logs.length === 0
                ? "Bot events will appear here."
                : "Try another filter or search."}
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border bg-card shadow-sm">
            {groupByDay(filteredLogs.slice(0, mobileLimit)).map(([day, items]) => (
              <section key={day}>
                <p className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {day}
                </p>
                <div className="divide-y divide-border/60">
                  {items.map((log) => {
                    const meta = LEVEL_META[log.level] || LEVEL_META.INFO;
                    const Icon = meta.icon;
                    return (
                      <div key={log.id} className="flex gap-2.5 px-3.5 py-2.5">
                        <div
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${meta.tile}`}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold">
                              {log.source}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {new Date(log.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 break-words text-xs leading-relaxed text-foreground/80">
                            {log.message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {filteredLogs.length > mobileLimit && (
              <div className="border-t border-border/60 p-2">
                <Button
                  variant="ghost"
                  onClick={() => setMobileLimit((n) => n + 100)}
                  className="w-full text-sm text-primary cursor-pointer"
                >
                  Show more ({filteredLogs.length - mobileLimit} left)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Terminal Log Container (tablet & desktop) */}
      <Card className="hidden sm:block border-border shadow-sm overflow-hidden">
        <CardHeader className="p-3 sm:p-6 pb-3 border-b border-border/60 space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Terminal className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold leading-tight">
                  Bot Application Logs
                </CardTitle>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Real-time event stream for incoming signals, order executions,
                  and system events.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="sm:hidden mr-auto flex items-center gap-1.5 text-xs font-medium">
                <span className={`size-1.5 rounded-full ${isAutoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`} />
                {isAutoRefresh ? "Live stream" : "Paused"}
                <span className="text-muted-foreground font-normal">· {totalCount} events</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                aria-label={isAutoRefresh ? "Pause" : "Resume"}
                className={`h-8 max-sm:w-8 max-sm:px-0 text-[11px] sm:text-xs cursor-pointer ${
                  isAutoRefresh
                    ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : "text-muted-foreground"
                }`}
              >
                {isAutoRefresh ? (
                  <>
                    <Pause className="size-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Live (Auto)</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Paused</span>
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={isLoading}
                aria-label="Refresh"
                className="h-8 max-sm:w-8 max-sm:px-0 text-[11px] sm:text-xs cursor-pointer"
              >
                <RefreshCw
                  className={`size-3.5 sm:mr-1 ${isLoading ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsClearDialogOpen(true)}
                aria-label="Clear logs"
                className="h-8 max-sm:w-8 max-sm:px-0 text-[11px] sm:text-xs cursor-pointer max-sm:bg-red-500/10 max-sm:text-red-500 max-sm:shadow-none"
              >
                <Trash2 className="size-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search log messages or modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
              <Filter className="hidden sm:block size-3.5 text-muted-foreground ml-0.5 mr-0.5 shrink-0" />
              {["ALL", "SUCCESS", "INFO", "WARN", "ERROR"].map((lvl) => (
                <Button
                  key={lvl}
                  type="button"
                  variant={filterLevel === lvl ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterLevel(lvl)}
                  className={`h-7 text-[11px] sm:text-xs px-2.5 cursor-pointer sm:font-mono shrink-0 max-sm:rounded-full ${
                    filterLevel === lvl
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="sm:hidden">
                    {lvl === "ALL" ? "All" : lvl.charAt(0) + lvl.slice(1).toLowerCase()}
                  </span>
                  <span className="hidden sm:inline">{lvl}</span>
                  {lvl !== "ALL" && (
                    <span className="sm:hidden ml-1 tabular-nums text-muted-foreground">
                      {lvl === "SUCCESS" ? successCount : lvl === "WARN" ? warnCount : lvl === "ERROR" ? errorCount : logs.filter((l) => l.level === "INFO").length}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="bg-zinc-950 p-0 sm:p-4 sm:font-mono text-xs text-zinc-300 min-h-[300px] sm:min-h-[420px] max-h-[calc(100dvh-15rem)] sm:max-h-[620px] overflow-y-auto max-sm:divide-y max-sm:divide-zinc-900 sm:space-y-1 sm:rounded-b-xl border-t border-zinc-900 select-text scroll-smooth"
          >
            {reversedLogs.length === 0 ? (
              <div className="text-zinc-500 text-center py-20 flex flex-col items-center gap-2">
                <Info className="size-6 text-zinc-600" />
                <span>
                  {logs.length === 0
                    ? "No bot activity logs recorded yet."
                    : "No log events match the search filter."}
                </span>
              </div>
            ) : (
              reversedLogs.map((log) => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                const date = new Date(log.timestamp).toLocaleDateString();

                const badgeClass =
                  log.level === "SUCCESS"
                    ? "text-emerald-400 bg-emerald-950/60 border-emerald-800/50"
                    : log.level === "WARN"
                      ? "text-amber-400 bg-amber-950/60 border-amber-800/50"
                      : log.level === "ERROR"
                        ? "text-red-400 bg-red-950/60 border-red-800/50"
                        : "text-blue-400 bg-blue-950/60 border-blue-800/50";

                const dot =
                  log.level === "SUCCESS"
                    ? "bg-emerald-400"
                    : log.level === "WARN"
                      ? "bg-amber-400"
                      : log.level === "ERROR"
                        ? "bg-red-400"
                        : "bg-sky-400";

                return (
                  <div key={log.id}>
                  {/* Mobile: baris bertumpuk, mudah dibaca */}
                  <div className="sm:hidden flex gap-2.5 px-3 py-2.5">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span className="truncate font-medium text-zinc-400">{log.source}</span>
                        <span className="shrink-0 tabular-nums">{time}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-snug text-zinc-200 break-words">
                        {log.message}
                      </p>
                    </div>
                  </div>
                  <div
                    className="hidden sm:flex items-start gap-2 py-1 px-1.5 sm:px-2 rounded border border-transparent hover:border-zinc-800 hover:bg-zinc-900/50 transition-colors"
                  >
                    <span className="text-zinc-500 text-[11px] shrink-0 pt-0.5 select-none font-mono">
                      <span className="hidden sm:inline">{date} </span>
                      {time}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-1.5 py-0 h-4 font-mono font-semibold shrink-0 ${badgeClass}`}
                    >
                      {log.level}
                    </Badge>
                    <span className="text-zinc-400 font-semibold shrink-0 text-[11px]">
                      [{log.source}]
                    </span>
                    <span className="text-zinc-200 break-all leading-relaxed">
                      {log.message}
                    </span>
                  </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Popup Modal for Clearing Logs */}
      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Clear Activity Logs
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Are you sure you want to permanently clear all application
              activity logs? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isClearingLogs}
              onClick={() => setIsClearDialogOpen(false)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isClearingLogs}
              onClick={handleConfirmClearLogs}
              className="text-xs cursor-pointer gap-1.5"
            >
              {isClearingLogs ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Clearing Logs...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Clear Logs
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
