import { addAppLog } from "../../lib/logger";

/**
 * Penjaga rate limit REST Binance (per host). Limit Binance dihitung per IP, jadi
 * header X-MBX-USED-WEIGHT-1M juga mencakup aplikasi lain di VPS yang sama (Signal Server).
 *
 * - 429 / 418 → semua request ke host tsb ditahan lokal sampai Retry-After / "banned until".
 *   Mengirim request selama 429/418 hanya memperpanjang ban.
 * - Weight >= SOFT_WEIGHT_LIMIT → request 'normal' (polling posisi/akun latar belakang) ditahan
 *   sampai menit berikutnya. Request 'critical' (alur order) tetap jalan sampai benar-benar 429.
 */
export type BinanceRequestPriority = "critical" | "normal";

const MINUTE_MS = 60 * 1000;

export class BinanceRateGuard {
  static readonly WEIGHT_LIMIT = 2400;
  static readonly SOFT_WEIGHT_LIMIT = 1800;
  static readonly DEFAULT_429_MS = 60 * 1000;
  static readonly DEFAULT_418_MS = 2 * 60 * 1000;

  private blocked = new Map<string, { until: number; reason: string }>();
  private weight = new Map<string, { minute: number; used: number }>();
  private peaks = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Alasan + waktu jika request harus ditahan lokal, null jika boleh dikirim. */
  check(
    host: string,
    priority: BinanceRequestPriority,
  ): { until: number; reason: string } | null {
    const now = this.now();
    const block = this.blocked.get(host);
    if (block && block.until > now) return block;

    if (priority === "normal") {
      const w = this.weight.get(host);
      const minute = Math.floor(now / MINUTE_MS);
      if (
        w &&
        w.minute === minute &&
        w.used >= BinanceRateGuard.SOFT_WEIGHT_LIMIT
      ) {
        return {
          until: (minute + 1) * MINUTE_MS,
          reason: `soft brake (used weight ${w.used}/${BinanceRateGuard.WEIGHT_LIMIT})`,
        };
      }
    }
    return null;
  }

  isPaused(host: string, priority: BinanceRequestPriority = "normal"): boolean {
    return this.check(host, priority) !== null;
  }

  /** Return true saat pertama kali melewati soft limit di menit ini. */
  recordWeight(host: string, header: string | null | undefined): boolean {
    const used = parseInt(header ?? "", 10);
    if (!Number.isFinite(used)) return false;

    const minute = Math.floor(this.now() / MINUTE_MS);
    const prev = this.weight.get(host);
    const prevUsed = prev && prev.minute === minute ? prev.used : 0;
    this.weight.set(host, { minute, used: Math.max(prevUsed, used) });
    this.peaks.set(host, Math.max(this.peaks.get(host) ?? 0, used));

    const soft = BinanceRateGuard.SOFT_WEIGHT_LIMIT;
    return prevUsed < soft && used >= soft;
  }

  /**
   * Catat respons 429/418. Return waktu blokir (ms epoch), atau null jika bukan rate limit.
   * Sumber waktu: "banned until <ms>" di pesan → Retry-After (detik) → default.
   */
  recordLimit(
    host: string,
    status: number,
    retryAfter?: string | null,
    message?: string,
  ): number | null {
    if (status !== 429 && status !== 418) return null;

    const now = this.now();
    let until: number | null = null;

    const banMatch = message?.match(/banned until (\d{12,})/i);
    if (banMatch?.[1]) until = parseInt(banMatch[1], 10);

    if (!until) {
      const sec = parseInt(retryAfter ?? "", 10);
      if (Number.isFinite(sec) && sec > 0) until = now + sec * 1000;
    }

    if (!until) {
      until =
        now +
        (status === 418
          ? BinanceRateGuard.DEFAULT_418_MS
          : BinanceRateGuard.DEFAULT_429_MS);
    }

    const prev = this.blocked.get(host);
    if (!prev || prev.until < until) {
      this.blocked.set(host, {
        until,
        reason: status === 418 ? "IP banned (418)" : "too many requests (429)",
      });
    }
    return this.blocked.get(host)!.until;
  }

  /** Weight tertinggi per host sejak pemanggilan terakhir, lalu di-reset. */
  drainPeaks(): Map<string, number> {
    const out = this.peaks;
    this.peaks = new Map();
    return out;
  }
}

export const binanceRateGuard = new BinanceRateGuard();

const LOG_TAG = "BinanceRateGuard";

/**
 * Pengganti `fetch` untuk semua REST Binance. Saat ditahan, mengembalikan respons sintetis
 * HTTP 429 berformat error Binance ({ code, msg }) sehingga penanganan error pemanggil tetap sama;
 * pesannya memuat "banned until <ms>" agar pemanggil bisa menunggu sampai waktu tsb.
 * Default "critical" (alur order); polling latar belakang memakai "normal" agar ikut rem weight.
 */
export async function binanceFetch(
  url: string,
  init?: RequestInit,
  priority: BinanceRequestPriority = "critical",
): Promise<Response> {
  const host = new URL(url).host;
  const blocked = binanceRateGuard.check(host, priority);
  if (blocked) {
    return new Response(
      JSON.stringify({
        code: -1003,
        msg: `Rate-limit guard: ${blocked.reason} on ${host}, banned until ${blocked.until}. Request not sent.`,
      }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  }

  const res = await fetch(url, init);

  const used = res.headers.get("x-mbx-used-weight-1m");
  if (binanceRateGuard.recordWeight(host, used)) {
    addAppLog(
      "WARN",
      LOG_TAG,
      `${host} used weight >= ${BinanceRateGuard.SOFT_WEIGHT_LIMIT}/${BinanceRateGuard.WEIGHT_LIMIT}. Pausing non-critical requests until next minute.`,
    );
  }

  if (res.status === 429 || res.status === 418) {
    let msg: string | undefined;
    try {
      msg = ((await res.clone().json()) as { msg?: string }).msg;
    } catch {}
    const wasPaused = binanceRateGuard.isPaused(host, "critical");
    const until = binanceRateGuard.recordLimit(
      host,
      res.status,
      res.headers.get("retry-after"),
      msg,
    );
    if (until && !wasPaused) {
      addAppLog(
        "ERROR",
        LOG_TAG,
        `Binance ${res.status} on ${host}: ${msg ?? ""}. All REST requests to this host paused until ${new Date(until).toLocaleTimeString()}.`,
      );
    }
  }

  return res;
}

/** True jika REST ke base URL Binance tsb sedang ditahan (ban atau soft brake). */
export function isBinanceRestPaused(baseUrl: string): boolean {
  return binanceRateGuard.isPaused(new URL(baseUrl).host);
}

// Laporan weight tertinggi tiap 5 menit (total weight IP VPS)
setInterval(
  () => {
    for (const [host, peak] of binanceRateGuard.drainPeaks()) {
      addAppLog(
        "INFO",
        LOG_TAG,
        `${host} peak weight 5m: ${peak}/${BinanceRateGuard.WEIGHT_LIMIT}`,
      );
    }
  },
  5 * 60 * 1000,
).unref();
