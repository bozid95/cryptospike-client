import { useState, useEffect } from "react";
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

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export type LogItem = {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
};

export function AppLogsView() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const res = await authFetch("/api/logs?limit=150");
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

  const handleClearLogs = async () => {
    if (!confirm("Clear all application activity logs?")) return;
    try {
      await authFetch("/api/logs", { method: "DELETE" });
      setLogs([]);
      toast.success("Application logs have been cleared.");
    } catch {
      toast.error("Failed to clear logs.");
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

  return (
    <div className="space-y-6">
      {/* 1. Ringkasan Statistik Log */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="border-border/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              Total Events
            </p>
            <p className="text-2xl font-bold font-mono mt-1">{totalCount}</p>
          </div>
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Terminal className="size-5" />
          </div>
        </Card>

        <Card className="border-border/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              Success Orders
            </p>
            <p className="text-2xl font-bold font-mono text-emerald-500 mt-1">
              {successCount}
            </p>
          </div>
          <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="size-5" />
          </div>
        </Card>

        <Card className="border-border/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              Warnings
            </p>
            <p className="text-2xl font-bold font-mono text-amber-500 mt-1">
              {warnCount}
            </p>
          </div>
          <div className="size-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <AlertTriangle className="size-5" />
          </div>
        </Card>

        <Card className="border-border/80 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Errors</p>
            <p className="text-2xl font-bold font-mono text-red-500 mt-1">
              {errorCount}
            </p>
          </div>
          <div className="size-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
            <XCircle className="size-5" />
          </div>
        </Card>
      </div>

      {/* 2. Terminal Log Container */}
      <Card className="border-border shadow-sm">
        <CardHeader className="p-4 sm:p-6 pb-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Terminal className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold leading-tight">
                  Bot Application Logs
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Real-time event stream for incoming signals, order executions,
                  and system events.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                className={`h-8 text-xs cursor-pointer flex-1 sm:flex-none ${
                  isAutoRefresh
                    ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : "text-muted-foreground"
                }`}
              >
                {isAutoRefresh ? (
                  <>
                    <Pause className="size-3.5 mr-1" />
                    Live (Auto)
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 mr-1" />
                    Paused
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={isLoading}
                className="h-8 text-xs cursor-pointer flex-1 sm:flex-none"
              >
                <RefreshCw
                  className={`size-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearLogs}
                className="h-8 text-xs cursor-pointer flex-1 sm:flex-none"
              >
                <Trash2 className="size-3.5 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search log messages or modules (e.g. SignalEngine, Binance)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <Filter className="size-3.5 text-muted-foreground ml-1 mr-0.5 shrink-0" />
              {["ALL", "SUCCESS", "INFO", "WARN", "ERROR"].map((lvl) => (
                <Button
                  key={lvl}
                  type="button"
                  variant={filterLevel === lvl ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterLevel(lvl)}
                  className={`h-7 text-xs px-2.5 cursor-pointer font-mono ${
                    filterLevel === lvl
                      ? "font-bold text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {lvl}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="bg-zinc-950 p-3 sm:p-4 font-mono text-xs text-zinc-300 min-h-[420px] max-h-[620px] overflow-y-auto space-y-1 rounded-b-xl border-t border-zinc-900 select-text">
            {filteredLogs.length === 0 ? (
              <div className="text-zinc-500 text-center py-20 flex flex-col items-center gap-2">
                <Info className="size-6 text-zinc-600" />
                <span>
                  {logs.length === 0
                    ? "No bot activity logs recorded yet."
                    : "No log events match the search filter."}
                </span>
              </div>
            ) : (
              filteredLogs.map((log) => {
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

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 py-1 px-1.5 sm:px-2 rounded border border-transparent hover:border-zinc-800 hover:bg-zinc-900/50 transition-colors"
                  >
                    <span className="text-zinc-500 text-[11px] shrink-0 pt-0.5 select-none font-mono">
                      <span className="hidden sm:inline">{date} </span>
                      {time}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 h-4 font-mono font-semibold shrink-0 ${badgeClass}`}
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
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
