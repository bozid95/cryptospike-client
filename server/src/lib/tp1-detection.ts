/**
 * Deteksi "TP1 sudah terisi" untuk Auto-BEP pada monitor REST.
 *
 * Dulu: harga bergerak >= 1% ke arah profit + order LIMIT penutup tersisa <= 1 dianggap TP1 terisi. Itu salah bila
 * sejak awal hanya ada 1 order LIMIT (TP2 digabung ke TP1 karena di bawah minNotional, atau mode TP1 Only/Custom ROI):
 * SL pindah ke BEP padahal TP1 belum tersentuh (contoh log: "remaining qty: 48/48").
 *
 * Sekarang TP1 dianggap terisi hanya bila:
 *  (a) posisi benar-benar berkurang (<= 65% dari ukuran awal), atau
 *  (b) harga mark sudah melewati harga TP1 DAN order LIMIT penutup di harga TP1 sudah tidak ada.
 */
export interface Tp1CheckInput {
  side: "LONG" | "SHORT";
  initialQty: number;
  currentQty: number;
  markPrice: number;
  /** Harga TP1 yang dipasang Client (null bila tidak diketahui, mis. posisi lama). */
  tp1: number | null | undefined;
  /** Harga order LIMIT penutup yang masih terbuka (null = tidak diketahui/gagal diambil). */
  openExitLimitPrices: number[] | null;
}

export const QTY_REDUCED_RATIO = 0.65;
const PRICE_TOLERANCE = 0.001; // 0.1%

export function isQtyReduced(initialQty: number, currentQty: number): boolean {
  return initialQty > 0 && currentQty <= initialQty * QTY_REDUCED_RATIO;
}

export function isTp1Filled(i: Tp1CheckInput): boolean {
  if (isQtyReduced(i.initialQty, i.currentQty)) return true;
  if (!i.tp1 || !(i.tp1 > 0) || !(i.markPrice > 0)) return false;
  const crossed = i.side === "SHORT" ? i.markPrice <= i.tp1 : i.markPrice >= i.tp1;
  if (!crossed) return false;
  if (i.openExitLimitPrices === null) return false;
  const tp1OrderStillOpen = i.openExitLimitPrices.some(
    (p) => Math.abs(p - i.tp1!) / i.tp1! <= PRICE_TOLERANCE,
  );
  return !tp1OrderStillOpen;
}
