import { prisma } from "../src/lib/db";
import {
  testBinanceConnection,
  getAccountAndPositions,
} from "../src/exchanges/binance/account";
import {
  getSymbolFilters,
  roundStep,
  roundTick,
} from "../src/exchanges/binance/market";
import {
  placeOrder,
  cancelAllOpenOrders,
  getOpenOrders,
} from "../src/exchanges/binance/orders";
import {
  getBinanceServerTime,
  createSignature,
} from "../src/exchanges/binance/client";

async function runLiveBinanceTest() {
  console.log(
    "================================================================",
  );
  console.log("🌐 PERCOBAAN LIVE ORDER KE BINANCE TESTNET (HYBRID RUNNER)");
  console.log(
    "================================================================\n",
  );

  try {
    const config = await prisma.binanceConfig.findUnique({ where: { id: 1 } });
    if (!config?.apiKey || !config?.apiSecret) {
      console.log(
        "⚠️ API Key / Secret Binance belum dikonfigurasi di database.",
      );
      return;
    }

    const apiKey = config.apiKey.trim();
    const apiSecret = config.apiSecret.trim();
    const isTestnet = config.environment === "TESTNET";

    console.log(`1. Memeriksa koneksi ke Binance (${config.environment})...`);
    const conn = await testBinanceConnection(
      apiKey,
      apiSecret,
      config.environment,
    );
    console.log(
      `   Status: ${conn.success ? "TERHUBUNG" : "GAGAL"} | ${conn.message}`,
    );

    if (!conn.success) {
      console.log(
        "   ❌ Gagal terhubung ke Binance Testnet. Periksa kembali API Key / Secret.",
      );
      return;
    }

    // 2. Ambil detail akun & posisi
    console.log("\n2. Mengambil informasi akun & posisi aktif...");
    const { account, positions } = await getAccountAndPositions(
      apiKey,
      apiSecret,
      config.environment,
    );
    console.log(
      `   Saldo Wallet: $${account.totalWalletBalance.toFixed(2)} USDT`,
    );
    console.log(`   Posisi Aktif: ${positions.length} posisi`);

    // 3. Uji coba pembuatan order TRAILING_STOP_MARKET ke Binance
    const testSymbol = "BTCUSDT";
    console.log(`\n3. Mengambil filter simbol untuk ${testSymbol}...`);
    const filters = await getSymbolFilters(testSymbol, isTestnet);
    console.log(
      `   TickSize: ${filters.tickSize} | StepSize: ${filters.stepSize} | MinNotional: $${filters.minNotional}`,
    );

    // Ambil harga pasar saat ini
    const baseUrl = isTestnet
      ? "https://testnet.binancefuture.com"
      : "https://fapi.binance.com";
    const tickerRes = await fetch(
      `${baseUrl}/fapi/v1/ticker/price?symbol=${testSymbol}`,
    );
    const tickerData = (await tickerRes.json()) as { price: string };
    const currentPrice = parseFloat(tickerData.price);
    console.log(
      `   Harga Pasar Terkini (${testSymbol}): $${currentPrice.toLocaleString()}`,
    );

    // Parameter pengujian Trailing Stop
    const testQty = roundStep(0.005, filters.stepSize); // 0.005 BTC
    const activationPrice = roundTick(currentPrice * 1.05, filters.tickSize); // 5% di atas pasar (agar tidak langsung terpicu)
    const callbackRate = 2.5;

    console.log(
      `\n4. Mengirimkan order percobaan TRAILING_STOP_MARKET ke Binance Testnet...`,
    );
    console.log(
      `   Detail: SELL ${testQty} ${testSymbol} | Callback: ${callbackRate}% | Activation: $${activationPrice}`,
    );

    try {
      const orderResult = await placeOrder(
        apiKey,
        apiSecret,
        {
          symbol: testSymbol,
          side: "SELL",
          type: "TRAILING_STOP_MARKET",
          quantity: testQty,
          callbackRate,
          activationPrice,
          reduceOnly: false,
        },
        isTestnet,
      );

      console.log(
        "   🎉 [BERHASIL!] Respon dari Binance Futures API via placeOrder():",
      );
      console.log(
        `      Algo Order ID : ${orderResult.algoId || orderResult.orderId}`,
      );
      console.log(
        `      Status        : ${orderResult.algoStatus || orderResult.status}`,
      );
      console.log(
        `      Type          : ${orderResult.orderType || orderResult.type}`,
      );
      console.log(
        `      Callback Rate : ${orderResult.callbackRate || callbackRate}%`,
      );
      console.log(
        `      Activate Price: $${orderResult.activatePrice || activationPrice}`,
      );

      console.log("\n5. Membersihkan order uji coba (cancelAllOpenOrders)...");
      await cancelAllOpenOrders(apiKey, apiSecret, testSymbol, isTestnet);
      console.log(
        `   🧹 Order uji coba ${testSymbol} berhasil dibatalkan dan buku order bersih.`,
      );
    } catch (orderErr: any) {
      console.log(`   ⚠️ Respon error: ${orderErr.message}`);
    }

    console.log(
      "\n================================================================",
    );
    console.log("✨ PENGUJIAN SELESAI!");
    console.log(
      "================================================================",
    );
  } catch (err: any) {
    console.error("Error during live Binance test:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runLiveBinanceTest().catch(console.error);
