import fs from "fs";
import path from "path";

export type TpMode = "MULTI_TP" | "TP1_ONLY" | "TP2_ONLY" | "CUSTOM_ROI";

export interface TpConfigData {
  // Binance Futures Testnet
  testnetTpMode: TpMode;
  testnetCustomTpRoiPct: number;

  // Binance Futures Live
  liveTpMode: TpMode;
  liveCustomTpRoiPct: number;

  // Tokocrypto Spot
  tokocryptoTpMode: TpMode;
  tokocryptoCustomTpRoiPct: number;
}

export const DEFAULT_TP_CONFIG: TpConfigData = {
  testnetTpMode: "MULTI_TP",
  testnetCustomTpRoiPct: 15.0, // Default 15% ROI
  liveTpMode: "MULTI_TP",
  liveCustomTpRoiPct: 15.0,
  tokocryptoTpMode: "MULTI_TP",
  tokocryptoCustomTpRoiPct: 3.5, // Default 3.5% Spot gain
};

const tpConfigPath = path.resolve(process.cwd(), "data/tp_config.json");

export function getTpConfig(): TpConfigData {
  try {
    if (fs.existsSync(tpConfigPath)) {
      const raw = fs.readFileSync(tpConfigPath, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_TP_CONFIG,
        ...parsed,
      };
    }
  } catch (err) {
    console.warn(
      "[TpConfig] Failed to read tp_config.json, using defaults:",
      err,
    );
  }
  return { ...DEFAULT_TP_CONFIG };
}

export function saveTpConfig(partial: Partial<TpConfigData>): TpConfigData {
  try {
    const current = getTpConfig();
    const updated: TpConfigData = {
      ...current,
      ...partial,
    };
    const dir = path.dirname(tpConfigPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tpConfigPath, JSON.stringify(updated, null, 2), "utf-8");
    return updated;
  } catch (err) {
    console.error("[TpConfig] Failed to write tp_config.json:", err);
    return getTpConfig();
  }
}
