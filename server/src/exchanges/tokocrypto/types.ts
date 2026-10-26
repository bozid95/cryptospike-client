export interface TokocryptoSymbolRules {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minQty: number;
  maxQty: number;
  stepSize: number;
  minNotional: number;
  tickSize: number;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface TokocryptoOrderParams {
  symbol: string;
  side: 0 | 1 | "BUY" | "SELL"; // 0: BUY, 1: SELL
  type: 1 | 2 | "LIMIT" | "MARKET"; // 1: LIMIT, 2: MARKET
  quantity?: number;
  quoteOrderQty?: number;
  price?: number;
  clientId?: string;
}

export interface TokocryptoOrderResult {
  orderId: string;
  clientId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  status: string;
  executedQty: number;
  cummulativeQuoteQty: number;
  price?: number;
  raw?: any;
}

export interface TokocryptoExecutionConfig {
  autoExecute: boolean;
  dryRun?: boolean;
  tokocryptoApiKey?: string | null;
  tokocryptoApiSecret?: string | null;
  tokocryptoQuoteAsset?: "USDT" | "BIDR";
  riskPerTradePct?: number;
  maxOpenPositions?: number;
  coinFilterMode?: string;
  targetCoins?: string | null;
  tpMode?:
    | "MULTI_TP"
    | "TP1_ONLY"
    | "TP2_ONLY"
    | "CUSTOM_ROI"
    | "CUSTOM_SPLIT"
    | undefined;
  customTpRoiPct?: number | undefined;
  customTpSplitRatio?: number | undefined;
  slMode?: "SIGNAL_SL" | "FIXED_PCT" | "MAX_LOSS_ROI" | undefined;
  customSlValue?: number | undefined;
}
