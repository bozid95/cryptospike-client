import fs from "fs";
import path from "path";

/**
 * Daftar posisi Binance Futures yang DIBUKA OLEH CLIENT INI (bukan posisi manual pengguna).
 *
 * Auto-BEP, stagnation cutoff, dan pembersihan order hanya boleh menyentuh posisi di daftar ini, sehingga
 * pengguna tetap bisa trading manual di akun yang sama tanpa posisinya ditutup/diubah oleh Client.
 * Disimpan ke file JSON (bukan database) agar bertahan saat restart tanpa mengubah skema.
 */
export type BinanceEnv = "TESTNET" | "LIVE";

export interface OwnedPosition {
  env: BinanceEnv;
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  /** Waktu entry (ms) — dipakai stagnation cutoff, tetap benar setelah Client restart. */
  openedAt: number;
}

const DEFAULT_PATH = path.resolve(process.cwd(), "data/owned_positions.json");

let cache: Record<string, OwnedPosition> | null = null;
let cachePath: string | null = null;

function filePath(): string {
  return process.env.OWNED_POSITIONS_PATH || DEFAULT_PATH;
}

const keyOf = (env: BinanceEnv, symbol: string) => `${env}:${symbol}`;

function load(): Record<string, OwnedPosition> {
  const p = filePath();
  if (cache && cachePath === p) return cache;
  cachePath = p;
  try {
    cache = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function persist(): void {
  const p = filePath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache || {}, null, 2), "utf-8");
  } catch {
    // Gagal menulis tidak boleh menghentikan eksekusi; daftar di memori tetap dipakai
  }
}

/** Catat posisi yang baru saja dibuka Client (dipanggil setelah market entry berhasil). */
export function markOwnedPosition(pos: OwnedPosition): void {
  const all = load();
  all[keyOf(pos.env, pos.symbol)] = pos;
  persist();
}

export function getOwnedPosition(
  env: BinanceEnv,
  symbol: string,
): OwnedPosition | null {
  return load()[keyOf(env, symbol)] || null;
}

export function isOwnedPosition(env: BinanceEnv, symbol: string): boolean {
  return Boolean(getOwnedPosition(env, symbol));
}

/** Hapus dari daftar saat posisi sudah tertutup. */
export function releaseOwnedPosition(env: BinanceEnv, symbol: string): void {
  const all = load();
  const k = keyOf(env, symbol);
  if (!(k in all)) return;
  delete all[k];
  persist();
}

export function listOwnedPositions(env: BinanceEnv): OwnedPosition[] {
  return Object.values(load()).filter((p) => p.env === env);
}

/** Untuk test: buang cache agar file dibaca ulang. */
export function resetOwnedPositionsCache(): void {
  cache = null;
  cachePath = null;
}
