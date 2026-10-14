import { app } from "./app";
import { connectToNestJS } from "./services/socket.service";
import { startSpotMonitor } from "./services/spot-monitor.service";
import { startBinanceMonitor } from "./services/binance-monitor.service";
import { startBinanceWsService } from "./services/binance-ws.service";
import { addAppLog } from "./lib/logger";

const PORT = process.env.PORT || 3030;

app.listen(PORT, async () => {
  console.log("=========================================");
  console.log(`🚀 CLIENT APP SERVER JALAN DI PORT ${PORT}`);
  console.log("=========================================");

  addAppLog("INFO", "System", `Client App Server berjalan di port ${PORT}`);

  // Inisialisasi koneksi WebSocket sinyal dari database SQLite
  await connectToNestJS();

  // Inisialisasi worker pemantau Take Profit / Stop Loss Spot Tokocrypto
  startSpotMonitor();

  // Inisialisasi Binance Futures WebSocket Stream (Zero-Polling)
  startBinanceWsService();

  // Inisialisasi worker pemantau Auto-BEP & Clean-up Binance Futures (Fallback)
  startBinanceMonitor();
});

export { app };
export { requireAuth } from "./middlewares/auth";
