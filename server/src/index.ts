import { app } from "./app";
import { connectToNestJS } from "./services/socket.service";
import { addAppLog } from "./lib/logger";

const PORT = process.env.PORT || 3030;

app.listen(PORT, async () => {
  console.log("=========================================");
  console.log(`🚀 CLIENT APP SERVER JALAN DI PORT ${PORT}`);
  console.log("=========================================");

  addAppLog("INFO", "System", `Client App Server berjalan di port ${PORT}`);

  // Inisialisasi koneksi WebSocket sinyal dari database SQLite
  await connectToNestJS();
});

export { app };
export { requireAuth } from "./middlewares/auth";
