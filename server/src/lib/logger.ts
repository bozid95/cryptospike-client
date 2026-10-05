export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export interface AppLogItem {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
}

const MAX_LOGS = 200;
const logBuffer: AppLogItem[] = [];

/**
 * Catat log ke konsol dan simpan di circular buffer memori aplikasi
 */
export function addAppLog(
  level: LogLevel,
  source: string,
  message: string,
  data?: any,
): AppLogItem {
  const item: AppLogItem = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    data,
  };

  logBuffer.unshift(item);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.pop();
  }

  // Tampilkan di konsol server
  const timeFormatted = new Date().toLocaleTimeString();
  const icon =
    level === "SUCCESS"
      ? "✅"
      : level === "WARN"
        ? "⚠️"
        : level === "ERROR"
          ? "❌"
          : "ℹ️";

  console.log(`[${timeFormatted}] ${icon} [${source}] ${message}`);
  if (data && level === "ERROR") {
    console.error(data);
  }

  return item;
}

/**
 * Ambil daftar log terbaru
 */
export function getAppLogs(limit = 100): AppLogItem[] {
  return logBuffer.slice(0, limit);
}

/**
 * Bersihkan daftar log
 */
export function clearAppLogs(): void {
  logBuffer.length = 0;
}
