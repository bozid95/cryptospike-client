/**
 * Pengaman eksekusi sinyal Binance Futures (pure / dependency-injected agar mudah diuji).
 *
 *  - resolveStopLossPrice : harga SL efektif sesuai mode SL Client (SIGNAL_SL / FIXED_PCT / MAX_LOSS_ROI).
 *  - evaluateEntryGuard   : tolak entry jika harga mark sudah melewati SL/TP1 atau menyimpang jauh dari harga sinyal.
 *  - ensureStopLossOrExit : pasang SL (2 lapis); jika keduanya gagal, posisi ditutup — tidak pernah dibiarkan tanpa SL.
 */
export type TradeSide = "LONG" | "SHORT";

export interface StopLossConfig {
  slMode?: string | undefined;
  customSlValue?: number | undefined;
}

export function resolveStopLossPrice(
  config: StopLossConfig,
  side: TradeSide,
  entryPrice: number,
  signalSl: number | undefined,
  leverage: number,
): { price: number; mode: string; fallback: boolean } {
  const mode = (config.slMode || "SIGNAL_SL").toUpperCase();
  const isLong = side === "LONG";
  if (mode === "FIXED_PCT") {
    const dropPct = Math.max(0.1, Number(config.customSlValue || 1.5)) / 100;
    return {
      price: isLong ? entryPrice * (1 - dropPct) : entryPrice * (1 + dropPct),
      mode,
      fallback: false,
    };
  }
  if (mode === "MAX_LOSS_ROI") {
    const maxRoi = Math.max(1.0, Number(config.customSlValue || 15.0));
    const priceDeltaPct = maxRoi / leverage / 100;
    return {
      price: isLong
        ? entryPrice * (1 - priceDeltaPct)
        : entryPrice * (1 + priceDeltaPct),
      mode,
      fallback: false,
    };
  }
  if (signalSl) return { price: signalSl, mode, fallback: false };
  return { price: entryPrice * (isLong ? 0.98 : 1.02), mode, fallback: true };
}

/** Penyimpangan maksimum harga mark dari harga sinyal, dalam kelipatan jarak SL (env BINANCE_MAX_ENTRY_DEVIATION_R). */
export function maxEntryDeviationR(): number {
  const raw = parseFloat(process.env.BINANCE_MAX_ENTRY_DEVIATION_R || "0.5");
  return Number.isFinite(raw) && raw > 0 ? raw : 0.5;
}

/** Alasan menolak entry, atau null jika entry aman. */
export function evaluateEntryGuard(params: {
  side: TradeSide;
  signalEntry: number;
  markPrice: number;
  sl: number;
  tp1?: number | undefined;
  maxDeviationR: number;
}): string | null {
  const { side, signalEntry, markPrice, sl, tp1, maxDeviationR } = params;
  if (!(markPrice > 0) || !(signalEntry > 0) || !(sl > 0)) return null;
  const isLong = side === "LONG";

  if (isLong ? markPrice <= sl : markPrice >= sl) {
    return `mark price ${markPrice} already beyond SL ${sl}`;
  }
  if (tp1 && (isLong ? markPrice >= tp1 : markPrice <= tp1)) {
    return `mark price ${markPrice} already beyond TP1 ${tp1}`;
  }
  const slDist = Math.abs(signalEntry - sl);
  if (slDist > 0) {
    const devR = Math.abs(markPrice - signalEntry) / slDist;
    if (devR > maxDeviationR) {
      return `mark price ${markPrice} deviates ${devR.toFixed(2)}R from signal entry ${signalEntry} (max ${maxDeviationR}R)`;
    }
  }
  return null;
}

export type StopLossOutcome = "PRIMARY" | "FALLBACK" | "ALREADY_PROTECTED" | "EMERGENCY_CLOSED" | "UNPROTECTED";

/**
 * Pasang SL dengan dua lapis. Jika keduanya gagal, tutup posisi (emergencyClose).
 * Hasil "UNPROTECTED" hanya terjadi bila penutupan darurat juga gagal — wajib ditinjau manual.
 */
export async function ensureStopLossOrExit(deps: {
  placePrimary: () => Promise<unknown>;
  placeFallback: () => Promise<unknown>;
  emergencyClose: () => Promise<unknown>;
  log: (level: "INFO" | "WARN" | "ERROR", message: string) => void;
  retryDelayMs?: number;
}): Promise<StopLossOutcome> {
  try {
    await deps.placePrimary();
    return "PRIMARY";
  } catch (err: any) {
    deps.log("WARN", `Primary closePosition Stop Loss rejected (${err?.message}). Retrying with explicit quantity fallback...`);
  }

  if (deps.retryDelayMs) await new Promise((r) => setTimeout(r, deps.retryDelayMs));
  try {
    await deps.placeFallback();
    return "FALLBACK";
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("already protected") || msg.includes("existing") || msg.includes("-4130")) {
      deps.log("INFO", "Position already protected by an active stop order on Binance.");
      return "ALREADY_PROTECTED";
    }
    deps.log("ERROR", `CRITICAL: Failed to place fallback Stop Loss (${msg}). Closing position at MARKET to avoid an unprotected trade...`);
  }

  try {
    await deps.emergencyClose();
    deps.log("WARN", "Position closed at MARKET because no Stop Loss could be placed.");
    return "EMERGENCY_CLOSED";
  } catch (err: any) {
    deps.log("ERROR", `CRITICAL: Emergency close FAILED (${err?.message}). Position is OPEN WITHOUT STOP LOSS — review manually NOW.`);
    return "UNPROTECTED";
  }
}

/** Batas pengaman mode RISK_AT_SL (env): jarak SL minimum (%) & margin maksimum per trade (% saldo). */
export function riskAtSlLimits(): { minSlPct: number; maxMarginPct: number } {
  const minSl = parseFloat(process.env.BINANCE_RISK_MIN_SL_PCT || "0.5");
  const maxMargin = parseFloat(process.env.BINANCE_RISK_MAX_MARGIN_PCT || "20");
  return {
    minSlPct: Number.isFinite(minSl) && minSl > 0 ? minSl : 0.5,
    maxMarginPct:
      Number.isFinite(maxMargin) && maxMargin > 0 && maxMargin <= 100 ? maxMargin : 20,
  };
}

export interface RiskAtSlSizing {
  margin: number;
  notional: number;
  /** Kerugian USD bila SL kena (setelah pembatasan margin). */
  riskUsd: number;
  slDistPct: number;
  capped: boolean;
}

/**
 * Mode RISK_AT_SL: ukuran posisi dihitung agar kerugian saat SL = riskPct % saldo.
 *   notional = (saldo × riskPct%) ÷ jarak SL%   ;   margin = notional ÷ leverage
 * Margin dibatasi maxMarginPct % saldo (risiko efektif ikut turun). Mengembalikan alasan penolakan bila tidak aman.
 */
export function computeRiskAtSlSizing(params: {
  walletBalance: number;
  riskPct: number;
  entryPrice: number;
  slPrice: number;
  leverage: number;
  minSlPct: number;
  maxMarginPct: number;
}): RiskAtSlSizing | { error: string } {
  const { walletBalance, riskPct, entryPrice, slPrice, leverage, minSlPct, maxMarginPct } = params;
  if (!(walletBalance > 0) || !(entryPrice > 0) || !(slPrice > 0) || !(leverage > 0) || !(riskPct > 0)) {
    return { error: "invalid sizing inputs" };
  }
  const slDistPct = (Math.abs(entryPrice - slPrice) / entryPrice) * 100;
  if (slDistPct < minSlPct) {
    return {
      error: `SL distance ${slDistPct.toFixed(2)}% below minimum ${minSlPct}% (position would be oversized)`,
    };
  }
  let notional = (walletBalance * riskPct) / 100 / (slDistPct / 100);
  let margin = notional / leverage;
  const maxMargin = (walletBalance * maxMarginPct) / 100;
  let capped = false;
  if (margin > maxMargin) {
    margin = maxMargin;
    notional = margin * leverage;
    capped = true;
  }
  return { margin, notional, riskUsd: notional * (slDistPct / 100), slDistPct, capped };
}
