import { Router, Request, Response } from "express";
import { addAppLog, getAppLogs, clearAppLogs } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";

export const logsRouter = Router();

// 1. Ambil Log Aktivitas Aplikasi (In-Memory Buffer)
logsRouter.get("/", requireAuth, (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  res.json({ success: true, logs: getAppLogs(limit) });
});

// 2. Bersihkan Log Aktivitas
logsRouter.delete("/", requireAuth, (req: Request, res: Response) => {
  clearAppLogs();
  addAppLog("INFO", "System", "Log aktivitas dibersihkan.");
  res.json({ success: true, message: "Log berhasil dibersihkan." });
});
