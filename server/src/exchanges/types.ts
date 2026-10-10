export type ExchangeType = "BINANCE" | "TOKOCRYPTO";

export interface SignalPayload {
  symbol: string;
  side: "LONG" | "SHORT" | string;
  entryPrice: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  sl?: number;
  strategy?: string;
  score?: number;
  strength?: string;
  [key: string]: any;
}

export interface PositionItem {
  id?: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  positionAmt: number;
  leverage: number;
  unRealizedProfit: number;
  liquidationPrice: number;
  isolatedMargin: number;
  notionalValue: number;
  roiPct: number;
  distanceToLiqPct: number;
  marginType?: "ISOLATED" | "CROSSED" | "SPOT" | string;
  tpPrice?: number;
  slPrice?: number;
  status?: string;
  createdAt?: Date;
  isDryRun?: boolean;
}

export interface AccountOverview {
  totalWalletBalance: number;
  totalUnrealizedProfit: number;
  totalMarginBalance?: number;
  availableBalance?: number;
  totalMaintMargin?: number;
  marginRatioPct?: number;
  openPositionsCount: number;
  totalExposureUsd: number;
  quoteAsset?: string;
}
