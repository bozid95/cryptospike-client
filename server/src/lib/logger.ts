import fs from "fs";
import path from "path";

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export interface AppLogItem {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
}

const MAX_LOGS = 1000;
const logBuffer: AppLogItem[] = [];

// Lokasi penyimpanan persisten log di folder data
const logFilePath = path.join(process.cwd(), "data", "app_activity.jsonl");

/**
 * Muat riwayat log lama dari file lokal saat server booting
 */
function initPersistentLogs(): void {
  try {
    const dataDir = path.dirname(logFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(logFilePath)) {
      const content = fs.readFileSync(logFilePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      // Ambil hingga MAX_LOGS baris terakhir
      const recentLines = lines.slice(-MAX_LOGS);
      for (const line of recentLines) {
        try {
          const item = JSON.parse(line) as AppLogItem;
          // Masukkan ke logBuffer (unshift agar item terbaru berada di posisi awal [0])
          logBuffer.unshift(item);
        } catch {}
      }
    }
  } catch (err) {
    console.error("Failed to initialize persistent logs:", err);
  }
}

// Jalankan inisialisasi awal saat modul dimuat
initPersistentLogs();

let appendCounter = 0;

/**
 * Tulis item log baru ke file log lokal secara asynchronous
 */
function persistLogItem(item: AppLogItem): void {
  try {
    const line = JSON.stringify(item) + "\n";
    fs.appendFile(logFilePath, line, () => {});

    appendCounter++;
    // Kompaksi file setiap 500 log baru agar ukuran file tetap terjaga (< 1.000 log)
    if (appendCounter > 500) {
      appendCounter = 0;
      compactLogFile();
    }
  } catch {}
}

/**
 * Kompaksi file log agar hanya menyimpan log yang masih ada di circular buffer
 */
function compactLogFile(): void {
  try {
    // Balik urutan logBuffer agar kronologis (lama ke baru) saat ditulis ke file
    const lines =
      [...logBuffer]
        .reverse()
        .map((item) => JSON.stringify(item))
        .join("\n") + "\n";
    fs.writeFile(logFilePath, lines, () => {});
  } catch {}
}

/**
 * Catat log ke konsol, circular buffer memori, dan file log persisten
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

  // Tulis ke file persisten
  persistLogItem(item);

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
export function getAppLogs(limit = 1000): AppLogItem[] {
  return logBuffer.slice(0, limit);
}

/**
 * Bersihkan daftar log di memori dan file lokal
 */
export function clearAppLogs(): void {
  logBuffer.length = 0;
  try {
    if (fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, "");
    }
  } catch {}
}
