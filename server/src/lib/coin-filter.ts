export interface CoinFilterResult {
  allowed: boolean;
  reason: string;
  cleanSignal: string;
}

/**
 * Logika evaluasi filter koin (Whitelist / Blacklist / All Market)
 * Mendukung dual-match (format dengan/tanpa USDT, slash, strip, dan multiplier 1000x untuk memecoin).
 */
export function evaluateCoinFilter(
  rawSymbol: string,
  filterMode: string = "ALL",
  rawTargetCoins: string = "",
): CoinFilterResult {
  const mode = (filterMode || "ALL").toUpperCase();
  const cleanSignal = (rawSymbol || "")
    .toString()
    .trim()
    .replace(/[\/\-_\s]/g, "")
    .toUpperCase();

  const signalBase = cleanSignal.endsWith("USDT")
    ? cleanSignal.slice(0, -4)
    : cleanSignal;
  const signalWithUsdt = cleanSignal.endsWith("USDT")
    ? cleanSignal
    : `${cleanSignal}USDT`;

  if (mode === "ALL") {
    return {
      allowed: true,
      reason: "Mode ALL: semua koin diizinkan.",
      cleanSignal,
    };
  }

  const coinList = (rawTargetCoins || "")
    .split(/[,;\s]+/)
    .map((c) =>
      c
        .trim()
        .replace(/[\/\-_\s]/g, "")
        .toUpperCase(),
    )
    .filter(Boolean);

  const strip1000 = (s: string) => (s.startsWith("1000") ? s.slice(4) : s);
  const signalPure = strip1000(signalBase);

  const isMatch = coinList.some((target) => {
    const targetBase = target.endsWith("USDT") ? target.slice(0, -4) : target;
    const targetWithUsdt = target.endsWith("USDT") ? target : `${target}USDT`;
    const targetPure = strip1000(targetBase);

    return (
      cleanSignal === target ||
      cleanSignal === targetWithUsdt ||
      signalBase === targetBase ||
      signalWithUsdt === targetWithUsdt ||
      signalPure === targetPure
    );
  });

  if (mode === "WHITELIST") {
    if (!isMatch) {
      return {
        allowed: false,
        reason: `[WHITELIST BLOCKED] Sinyal ${cleanSignal} dilewati karena TIDAK ADA di Whitelist Anda (${coinList.join(", ") || "Kosong"}).`,
        cleanSignal,
      };
    }
    return {
      allowed: true,
      reason: `[WHITELIST MATCH] Sinyal ${cleanSignal} diizinkan karena cocok dengan Whitelist Anda.`,
      cleanSignal,
    };
  }

  if (mode === "BLACKLIST") {
    if (isMatch) {
      return {
        allowed: false,
        reason: `[BLACKLIST BLOCKED] Sinyal ${cleanSignal} dilewati karena ADA dalam Blacklist Anda (${coinList.join(", ")}).`,
        cleanSignal,
      };
    }
    return {
      allowed: true,
      reason: `[BLACKLIST PASS] Sinyal ${cleanSignal} diizinkan karena tidak termasuk dalam Blacklist.`,
      cleanSignal,
    };
  }

  return {
    allowed: true,
    reason: "Filter mode tidak dikenali, default diizinkan.",
    cleanSignal,
  };
}
