import fs from "fs";
import path from "path";

export type TpMode = "MULTI_TP" | "TP1_ONLY" | "TP2_ONLY" | "CUSTOM_ROI";
export type SlMode = "SIGNAL_SL" | "FIXED_PCT" | "MAX_LOSS_ROI";

export interface TpConfigData {
  // Binance Futures Testnet
  testnetTpMode: TpMode;
  testnetCustomTpRoiPct: number;
  testnetSlMode: SlMode;
  testnetCustomSlValue: number;

  // Binance Futures Live
  liveTpMode: TpMode;
  liveCustomTpRoiPct: number;
  liveSlMode: SlMode;
  liveCustomSlValue: number;

  // Tokocrypto Spot
  tokocryptoTpMode: TpMode;
  tokocryptoCustomTpRoiPct: number;
  tokocryptoSlMode: SlMode;
  tokocryptoCustomSlValue: number;
}

export const DEFAULT_TP_CONFIG: TpConfigData = {
  testnetTpMode: "MULTI_TP",
  testnetCustomTpRoiPct: 15.0, // Default +15% ROI
  testnetSlMode: "SIGNAL_SL",
  testnetCustomSlValue: 15.0, // Default 15% ROI max loss or 1.5%

  liveTpMode: "MULTI_TP",
  liveCustomTpRoiPct: 15.0,
  liveSlMode: "SIGNAL_SL",
  liveCustomSlValue: 15.0,

  tokocryptoTpMode: "MULTI_TP",
  tokocryptoCustomTpRoiPct: 3.5, // Default +3.5% Spot gain
  tokocryptoSlMode: "SIGNAL_SL",
  tokocryptoCustomSlValue: 2.5, // Default 2.5% Spot loss
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
