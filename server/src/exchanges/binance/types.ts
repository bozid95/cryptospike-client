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

export interface PlaceOrderParams {
  symbol: string;
  side: "BUY" | "SELL";
  type:
    | "MARKET"
    | "LIMIT"
    | "STOP_MARKET"
    | "TAKE_PROFIT_MARKET"
    | "TRAILING_STOP_MARKET";
  quantity?: number | undefined;
  price?: number | undefined;
  stopPrice?: number | undefined;
  callbackRate?: number | undefined;
  activationPrice?: number | undefined;
  reduceOnly?: boolean | undefined;
  closePosition?: boolean | undefined;
  timeInForce?: "GTC" | "IOC" | "FOK" | undefined;
  workingType?: "MARK_PRICE" | "CONTRACT_PRICE" | undefined;
  positionSide?: "BOTH" | "LONG" | "SHORT" | undefined;
}

export interface BinanceExecutionConfig {
  autoExecute: boolean;
  binanceApiKey: string | null;
  binanceApiSecret: string | null;
  environment: string;
  marginType: string;
  leverage: number;
  riskMode?: "PERCENTAGE" | "FIXED_USD" | string | undefined;
  riskAmountUsd?: number | undefined;
  riskPerTradePct: number;
  maxOpenPositions: number;
  coinFilterMode?: string | undefined;
  targetCoins?: string | null | undefined;
  tradeDirection?: "BOTH" | "LONG_ONLY" | "SHORT_ONLY" | string | undefined;
  minScore?: number | undefined;
  blockLongOnBtcBearish?: boolean | undefined;
  trailingStopEnabled?: boolean | undefined;
  trailingCallbackRate?: number | undefined;
  trailingActivation?: "TP1" | "TP2" | undefined;
  autoBreakEven?: boolean | undefined;
  breakEvenBufferPct?: number | undefined;
}
