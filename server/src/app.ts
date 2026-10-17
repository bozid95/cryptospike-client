import express from "express";
import dotenv from "dotenv";
import { initDohResolver } from "./lib/doh-resolver";

// Inisialisasi DoH Bypass untuk menangkal DNS Hijacking / Internet Positif ISP lokal
initDohResolver();

import { corsMiddleware } from "./middlewares/cors";
import { authRouter } from "./routes/auth.routes";
import { configRouter } from "./routes/config.routes";
import { positionsRouter } from "./routes/positions.routes";
import { logsRouter } from "./routes/logs.routes";
import {
  isSocketConnected,
  getSocketServerUrl,
} from "./services/socket.service";

import fs from "fs";
import path from "path";

dotenv.config();

// Baca versi aplikasi secara dinamis dari package.json
let appVersion = "1.0.0";
try {
  const pkgPath = path.resolve(__dirname, "../package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.version) appVersion = pkg.version;
  }
} catch {}

export const app = express();

// Global Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

// Bot & Server Status Endpoint
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    version: appVersion,
    bot_connected: isSocketConnected(),
    server_url: getSocketServerUrl(),
  });
});

// Modular Feature Routes
app.use("/api/auth", authRouter);
app.use("/api/config", configRouter);
app.use("/api/positions", positionsRouter);
app.use("/api/logs", logsRouter);

// Re-export requireAuth for convenience
export { requireAuth } from "./middlewares/auth";
