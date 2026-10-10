import express from "express";
import dotenv from "dotenv";
import { corsMiddleware } from "./middlewares/cors";
import { authRouter } from "./routes/auth.routes";
import { configRouter } from "./routes/config.routes";
import { positionsRouter } from "./routes/positions.routes";
import { logsRouter } from "./routes/logs.routes";
import {
  isSocketConnected,
  getSocketServerUrl,
} from "./services/socket.service";

dotenv.config();

export const app = express();

// Global Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

// Bot & Server Status Endpoint
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
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
