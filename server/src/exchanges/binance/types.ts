export interface SymbolFilters {
  tickSize: number;
  stepSize: number;
  minNotional: number;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface PositionRiskItem {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  positionAmt: number;
  leverage: number;
  unRealizedProfit: number;
  liquidationPrice: number;
  isolatedMargin: number;
  notionalValue?: number;
  roiPct?: number;
  distanceToLiqPct?: number;
  marginType?: "ISOLATED" | "CROSSED";
}

export interface BinanceExecutionConfig {
  autoExecute: boolean;
  binanceApiKey: string | null;
  binanceApiSecret: string | null;
  environment: string;
  marginType: string;
  leverage: number;
  riskPerTradePct: number;
  maxOpenPositions: number;
  coinFilterMode?: string;
  targetCoins?: string | null;
}
