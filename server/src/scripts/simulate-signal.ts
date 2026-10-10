import { prisma } from "../lib/db";
import { handleIncomingSignal } from "../services/socket.service";

async function runSimulation() {
  console.log("\n=======================================================");
  console.log("   SIMULASI INSTAN SINYAL SPOT TOKOCRYPTO (LOCAL TEST)  ");
  console.log("=======================================================\n");

  try {
    // 1. Inisialisasi & Pastikan Konfigurasi Database
    console.log("[1/4] Menyiapkan Konfigurasi Bot di Database Lokal...");
    await prisma.appConfig.upsert({
      where: { id: 1 },
      update: {
        targetExchange: "TOKOCRYPTO",
        autoExecute: true,
        dryRun: true,
        tokocryptoQuoteAsset: "USDT",
        maxOpenPositions: 3,
        coinFilterMode: "ALL",
      },
      create: {
        id: 1,
        targetExchange: "TOKOCRYPTO",
        autoExecute: true,
        dryRun: true,
        tokocryptoQuoteAsset: "USDT",
        maxOpenPositions: 3,
        coinFilterMode: "ALL",
      },
    });

    // Bersihkan posisi spot terbuka sebelumnya untuk pengujian yang bersih
    const deletedCount = await prisma.spotTrade.deleteMany({
      where: { status: "OPEN" },
    });
    console.log(
      `      Konfigurasi aktif: targetExchange=TOKOCRYPTO, dryRun=true, autoExecute=true.`,
    );
    console.log(
      `      Pembersihan awal: ${deletedCount.count} posisi lama direset.\n`,
    );

    // 2. KASUS UJI 1: Sinyal LONG Valid (BTCUSDT)
    console.log("[2/4] Eksekusi Kasus 1: Sinyal LONG Valid (BTCUSDT $65,000)...");
    const signalBtc = {
      id: "sig-test-btc-01",
      symbol: "BTCUSDT",
      side: "LONG",
      entryPrice: 65000,
      tp1: 68250,
      sl: 63375,
      score: 95,
      timeframe: "15m",
      timestamp: Date.now(),
    };
    await handleIncomingSignal(signalBtc);

    const btcTrade = await prisma.spotTrade.findFirst({
      where: { symbol: "BTC_USDT", status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });

    if (btcTrade) {
      console.log("      --> HASIL KASUS 1: [BERHASIL]");
      console.log(`          Simbol: ${btcTrade.symbol} (Ternormalisasi ke Spot)`);
      console.log(`          Order ID: ${btcTrade.buyOrderId}`);
      console.log(`          Harga Beli (Entry): $${btcTrade.entryPrice.toLocaleString()}`);
      console.log(`          Kuantitas: ${btcTrade.quantity} BTC`);
      console.log(`          Target TP1 (+5%): $${btcTrade.tpPrice.toLocaleString()}`);
      console.log(`          Target SL (-2.5%): $${btcTrade.slPrice.toLocaleString()}`);
      console.log(`          Status: ${btcTrade.status}\n`);
    } else {
      console.log("      --> HASIL KASUS 1: [GAGAL] Posisi BTC_USDT tidak ditemukan di database.\n");
    }

    // 3. KASUS UJI 2: Sinyal SHORT / SELL (ETHUSDT) - Harus Ditolak oleh Spot Guard
    console.log("[3/4] Eksekusi Kasus 2: Sinyal SHORT (ETHUSDT $3,500)...");
    console.log("      Ekspektasi: Ditolak otomatis oleh Spot Guard Protection.");
    const signalEthShort = {
      id: "sig-test-eth-02",
      symbol: "ETHUSDT",
      side: "SHORT",
      entryPrice: 3500,
      tp1: 3300,
      sl: 3600,
      score: 88,
      timeframe: "15m",
      timestamp: Date.now(),
    };
    await handleIncomingSignal(signalEthShort);

    const ethTrade = await prisma.spotTrade.findFirst({
      where: { symbol: "ETH_USDT", status: "OPEN" },
    });

    if (!ethTrade) {
      console.log("      --> HASIL KASUS 2: [BERHASIL - TERPROTEKSI]");
      console.log("          Sinyal SHORT otomatis ditolak. Tidak ada record posisi spot dibuka.\n");
    } else {
      console.log("      --> HASIL KASUS 2: [GAGAL] Posisi SHORT tidak boleh dieksekusi di Tokocrypto Spot!\n");
    }

    // 4. KASUS UJI 3: Sinyal LONG Koin Kedua (SOLUSDT)
    console.log("[4/4] Eksekusi Kasus 3: Sinyal LONG Koin Kedua (SOLUSDT $150)...");
    const signalSol = {
      id: "sig-test-sol-03",
      symbol: "SOLUSDT",
      side: "LONG",
      entryPrice: 150,
      tp1: 157.5,
      sl: 146.25,
      score: 91,
      timeframe: "1h",
      timestamp: Date.now(),
    };
    await handleIncomingSignal(signalSol);

    const solTrade = await prisma.spotTrade.findFirst({
      where: { symbol: "SOL_USDT", status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });

    if (solTrade) {
      console.log("      --> HASIL KASUS 3: [BERHASIL]");
      console.log(`          Simbol: ${solTrade.symbol}`);
      console.log(`          Harga Beli (Entry): $${solTrade.entryPrice}`);
      console.log(`          Kuantitas: ${solTrade.quantity} SOL`);
      console.log(`          Target TP1 (+5%): $${solTrade.tpPrice}`);
      console.log(`          Target SL (-2.5%): $${solTrade.slPrice}`);
      console.log(`          Status: ${solTrade.status}\n`);
    } else {
      console.log("      --> HASIL KASUS 3: [GAGAL] Posisi SOL_USDT tidak ditemukan di database.\n");
    }

    // 5. TAMPILKAN TABEL REKAPITULASI POSISI AKTIF
    const allOpenTrades = await prisma.spotTrade.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
    });

    console.log("=======================================================");
    console.log(`  REKAPITULASI POSISI SPOT TOKOCRYPTO AKTIF DI DATABASE (${allOpenTrades.length}/3)`);
    console.log("=======================================================");
    console.table(
      allOpenTrades.map((t) => ({
        ID: t.id.slice(0, 8),
        Exchange: t.exchange,
        Symbol: t.symbol,
        EntryPrice: `$${t.entryPrice}`,
        Quantity: t.quantity,
        TP_Price: `$${t.tpPrice}`,
        SL_Price: `$${t.slPrice}`,
        Status: t.status,
      })),
    );
    console.log("\nSimulasi selesai dengan sukses!\n");
  } catch (error: any) {
    console.error("Terjadi error dalam proses simulasi:", error);
  } finally {
    await prisma.$disconnect();
  }
}

runSimulation();
