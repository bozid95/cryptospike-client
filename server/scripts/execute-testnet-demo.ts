import { initDohResolver } from "../src/lib/doh-resolver";
initDohResolver();

import { prisma } from "../src/lib/db";
import { executeSignalOrder } from "../src/exchanges/binance/orders";
import { getAccountAndPositions } from "../src/lib/binance";
import { SignalPayload } from "../src/exchanges/types";
import { BinanceExecutionConfig } from "../src/exchanges/binance/types";
import crypto from "crypto";

function createSignature(queryString: string, apiSecret: string): string {
  return crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");
}

async function queryTestnet(
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  params: Record<string, any> = {},
) {
  const timestamp = Date.now();
  const queryObj = { ...params, timestamp, recvWindow: 60000 };
  const query = Object.entries(queryObj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as any)}`)
    .join("&");
  const signature = createSignature(query, apiSecret);
  const url = `https://testnet.binancefuture.com${endpoint}?${query}&signature=${signature}`;
  const res = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
  return await res.json();
}

async function runTestnetOrder() {
  console.log("==========================================================");
  console.log("🚀 MEMULAI EKSEKUSI ORDER TESTNET: SOLUSDT LONG");
  console.log("   (Entry Market + TP1 + TP2 + TP3 Trailing + Hard SL)");
  console.log("==========================================================");

  const binanceConfig = await prisma.binanceConfig.findUnique({
    where: { id: 1 },
  });
  if (!binanceConfig) {
    throw new Error("BinanceConfig tidak ditemukan di database.");
  }

  const apiKey = binanceConfig.testnetApiKey || binanceConfig.apiKey;
  const apiSecret = binanceConfig.testnetApiSecret || binanceConfig.apiSecret;

  if (!apiKey || !apiSecret) {
    throw new Error("Testnet API Key & Secret belum terisi di database.");
  }

  console.log(
    "1. Mengambil harga pasar SOLUSDT saat ini di Binance Testnet...",
  );
  const priceRes = await fetch(
    "https://testnet.binancefuture.com/fapi/v1/ticker/price?symbol=SOLUSDT",
  );
  const priceData = (await priceRes.json()) as any;
  const currentPrice = parseFloat(priceData.price);

  if (!currentPrice || isNaN(currentPrice)) {
    throw new Error("Gagal mengambil harga testnet SOLUSDT.");
  }
  console.log(
    `   -> Harga Testnet SOLUSDT saat ini: $${currentPrice.toFixed(4)}`,
  );

  const tp1Price = Number((currentPrice * 1.015).toFixed(2)); // +1.5% profit
  const tp2Price = Number((currentPrice * 1.03).toFixed(2)); // +3.0% profit
  const tp3Price = Number((currentPrice * 1.05).toFixed(2)); // +5.0% profit (reference)
  const slPrice = Number((currentPrice * 0.98).toFixed(2)); // -2.0% stop loss

  console.log(`2. Parameter Order yang disiapkan:`);
  console.log(`   - Simbol: SOLUSDT`);
  console.log(`   - Arah: LONG`);
  console.log(`   - Entry Market: ~$${currentPrice.toFixed(2)}`);
  console.log(`   - TP1 (50%): $${tp1Price}`);
  console.log(`   - TP2 (30%): $${tp2Price}`);
  console.log(`   - TP3 Trailing (20%): Callback 2.5%, Aktivasi $${tp1Price}`);
  console.log(`   - Hard Stop Loss: $${slPrice}`);

  const signalPayload: SignalPayload = {
    symbol: "SOLUSDT",
    side: "LONG",
    entryPrice: currentPrice,
    tp1: tp1Price,
    tp2: tp2Price,
    tp3: tp3Price,
    sl: slPrice,
    strategy: "TESTNET_VERIFICATION",
    score: 95,
  };

  const executionConfig: BinanceExecutionConfig = {
    autoExecute: true,
    environment: "TESTNET",
    binanceApiKey: apiKey.trim(),
    binanceApiSecret: apiSecret.trim(),
    marginType:
      (binanceConfig.marginType as "ISOLATED" | "CROSSED") || "CROSSED",
    leverage: 10,
    riskPerTradePct: 0.5, // ~0.5% dari $5226 = $26 margin * 10x = $260 notional (~2.5 SOL)
    maxOpenPositions: 20,
    coinFilterMode: "ALL",
    tradeDirection: "BOTH",
    minScore: 0,
    blockLongOnBtcBearish: false,
    trailingStopEnabled: true,
    trailingCallbackRate: 2.5,
    trailingActivation: "TP1",
  };

  console.log(
    "\n3. Menembakkan eksekusi via executeSignalOrder() ke Binance Testnet...",
  );
  await executeSignalOrder(signalPayload, executionConfig);

  console.log("\n4. Menunggu konfirmasi bursa (2 detik)...");
  await new Promise((r) => setTimeout(r, 2000));

  console.log("\n5. Mengambil data posisi aktif di Binance Testnet...");
  const check = await getAccountAndPositions(apiKey, apiSecret, "TESTNET");
  const pos = check.positions.find((p) => p.symbol === "SOLUSDT");

  if (pos) {
    console.log(`\n🎉 [POSISI AKTIF TERVERIFIKASI DI BINANCE TESTNET]`);
    console.log(`   Simbol          : ${pos.symbol}`);
    console.log(`   Arah            : ${pos.side}`);
    console.log(
      `   Kuantitas       : ${pos.positionAmt} SOL (~$${(pos.notionalValue || 0).toFixed(2)} USDT)`,
    );
    console.log(`   Harga Entry     : $${pos.entryPrice}`);
    console.log(`   Harga Mark      : $${pos.markPrice}`);
    console.log(`   Leverage        : ${pos.leverage}x (${pos.marginType})`);
    console.log(
      `   Unrealized PnL  : $${(pos.unRealizedProfit || 0).toFixed(4)} USDT`,
    );
    console.log(
      `   Harga Likuidasi : $${pos.liquidationPrice > 0 ? pos.liquidationPrice : "Safe / No Liq"}`,
    );
  } else {
    console.log("⚠️ Posisi SOLUSDT belum terdaftar di Testnet.");
  }

  console.log("\n6. Mengambil Regular Open Orders (TP1 & TP2)...");
  const regularOrders = await queryTestnet(
    "/fapi/v1/openOrders",
    apiKey,
    apiSecret,
    { symbol: "SOLUSDT" },
  );
  if (Array.isArray(regularOrders) && regularOrders.length > 0) {
    for (const o of regularOrders) {
      console.log(
        `   - Order ID: ${o.orderId} | Tipe: ${o.type} | Sisi: ${o.side} | Qty: ${o.origQty} SOL | Harga: $${o.price}`,
      );
    }
  } else {
    console.log("   Tidak ada regular orders aktif.");
  }

  console.log("\n7. Mengambil Algo Open Orders (Trailing Stop & Hard SL)...");
  const algoOrders = await queryTestnet(
    "/fapi/v1/openAlgoOrders",
    apiKey,
    apiSecret,
    { symbol: "SOLUSDT" },
  );
  const algoList = Array.isArray(algoOrders?.orders)
    ? algoOrders.orders
    : Array.isArray(algoOrders)
      ? algoOrders
      : [];
  if (algoList.length > 0) {
    for (const a of algoList) {
      console.log(
        `   - Algo ID: ${a.algoId} | Tipe: ${a.orderType} | Sisi: ${a.side} | Qty: ${a.quantity || a.actualQty} | Trigger/Stop: $${a.triggerPrice} | Activate: $${a.activatePrice || "N/A"} | Callback: ${a.callbackRate || "N/A"}% | Status: ${a.algoStatus}`,
      );
    }
  } else {
    console.log("   Tidak ada algo orders aktif.");
  }

  console.log("\n==========================================================");
  console.log("✅ VERIFIKASI PENGUJIAN ORDER TESTNET SELESAI");
  console.log("==========================================================");
}

runTestnetOrder().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
