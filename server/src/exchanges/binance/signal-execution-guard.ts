import fs from "fs";
import path from "path";

/**
 * Pengaman eksekusi ganda per environment (TESTNET / LIVE):
 *  - ID sinyal yang sama hanya diproses sekali (dicatat sebelum eksekusi, disimpan ke disk agar tahan restart).
 *  - Eksekusi untuk simbol yang sama dijalankan berurutan, sehingga cek "posisi sudah terbuka?" → order
 *    tidak bisa balapan (race condition) antar sinyal yang datang bersamaan.
 */
export interface SignalExecutionGuardOptions {
  /** File JSON penyimpanan ID sinyal; null = hanya di memori. */
  storePath?: string | null;
  /** Lama ID disimpan (default 24 jam). */
  ttlMs?: number;
  now?: () => number;
}

export type GuardRunResult<T> =
  | { ran: true; value: T }
  | { ran: false; reason: string };

export const DEFAULT_SIGNAL_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

export function signalIdOf(signal: any): string | null {
  const id = signal?.id ?? signal?.signalId;
  if (id === undefined || id === null) return null;
  const s = String(id).trim();
  return s.length > 0 ? s : null;
}

export function createSignalExecutionGuard(
  opts: SignalExecutionGuardOptions = {},
) {
  const ttlMs = opts.ttlMs ?? DEFAULT_SIGNAL_DEDUPE_TTL_MS;
  const now = opts.now ?? Date.now;
  const storePath = opts.storePath ?? null;
  const processed = new Map<string, number>(); // `${env}:${signalId}` -> waktu klaim
  const locks = new Map<string, Promise<void>>();

  const prune = () => {
    const threshold = now() - ttlMs;
    for (const [k, t] of processed) if (t < threshold) processed.delete(k);
  };

  const load = () => {
    if (!storePath) return;
    try {
      if (!fs.existsSync(storePath)) return;
      const raw = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      if (raw && typeof raw === "object") {
        for (const [k, t] of Object.entries(raw)) {
          if (typeof t === "number" && Number.isFinite(t)) processed.set(k, t);
        }
      }
      prune();
    } catch {
      // File rusak → mulai kosong (lebih baik daripada gagal start)
    }
  };

  const persist = () => {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(processed)));
      fs.renameSync(tmp, storePath);
    } catch {
      // Gagal tulis disk tidak boleh menghentikan eksekusi; dedupe memori tetap berlaku
    }
  };

  async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((r) => (release = r));
    const chain = prev.then(() => current);
    locks.set(key, chain);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(key) === chain) locks.delete(key);
    }
  }

  load();

  return {
    async run<T>(
      environment: string,
      signal: any,
      fn: () => Promise<T>,
    ): Promise<GuardRunResult<T>> {
      const env = String(environment || "").toUpperCase();
      const id = signalIdOf(signal);
      if (id) {
        prune();
        const key = `${env}:${id}`;
        if (processed.has(key)) {
          return {
            ran: false,
            reason: `duplicate signal ${id} already processed on ${env}`,
          };
        }
        // Klaim sebelum eksekusi: salinan yang datang bersamaan langsung ditolak
        processed.set(key, now());
        persist();
      }
      const symbol = String(signal?.symbol ?? "").toUpperCase();
      const value = await withLock(`${env}:${symbol}`, fn);
      return { ran: true, value };
    },
    hasProcessed(environment: string, signalId: string): boolean {
      prune();
      return processed.has(`${String(environment).toUpperCase()}:${signalId}`);
    },
  };
}
