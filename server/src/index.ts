import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import { io as Client } from "socket.io-client";
import dotenv from "dotenv";
import { prisma } from "./lib/db";
import {
  testBinanceConnection,
  getAccountAndPositions,
  closePositionDirect,
  executeSignalOrder,
} from "./lib/binance";
import { addAppLog, getAppLogs, clearAppLogs } from "./lib/logger";
import { signJWT, verifyJWT, JWTPayload } from "./lib/jwt";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3030; // Port internal untuk Express backend
// Server sinyal CryptoSpike pusat tertanam permanen
const SERVER_URL = process.env.SERVER_URL || "https://signal.forlearning.my.id";

// Middleware CORS Ketat (Mencegah Cross-Origin Request dari domain asing)
app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (seperti mobile apps, curl, docker internal proxy)
      // atau origin yang berasal dari localhost / private network
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      // Izinkan origin sama jika dideploy dengan domain khusus
      return callback(null, true);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

// In-Memory Rate Limiter untuk mencegah serangan Brute Force pada Login
const loginAttempts = new Map<
  string,
  { count: number; firstAttempt: number }
>();

function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 Menit
  const maxAttempts = 8; // Maksimal 8 percobaan login per 15 menit

  const record = loginAttempts.get(clientIp);

  if (record) {
    if (now - record.firstAttempt > windowMs) {
      // Reset window jika waktu telah lewat
      loginAttempts.set(clientIp, { count: 1, firstAttempt: now });
      return next();
    }

    if (record.count >= maxAttempts) {
      const waitMinutes = Math.ceil(
        (windowMs - (now - record.firstAttempt)) / 60000,
      );
      return res.status(429).json({
        success: false,
        message: `Terlalu banyak percobaan login yang gagal. Silakan coba lagi dalam ${waitMinutes} menit.`,
      });
    }

    record.count += 1;
  } else {
    loginAttempts.set(clientIp, { count: 1, firstAttempt: now });
  }

  next();
}

// Extend Express Request type untuk menyimpan user JWT
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// Middleware Proteksi Autentikasi JWT
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Akses ditolak. Token autentikasi JWT tidak ditemukan.",
    });
  }

  const token = authHeader.substring(7);
  const decoded = verifyJWT(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message:
        "Sesi telah berakhir atau token tidak valid. Silakan login kembali.",
    });
  }

  req.user = decoded;
  next();
}

// --- Helper Keamanan Password (Native Crypto Scrypt) ---
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, key] = combinedHash.split(":");
    if (!salt || !key) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, "hex");
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

// API Status Bot
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    bot_connected: socket ? socket.connected : false,
    server_url: SERVER_URL,
  });
});

// =================================================================
// AUTHENTICATION & FIRST-TIME SETUP ENDPOINTS
// =================================================================

// 1. Cek apakah user admin pertama sudah dibuat (status inisialisasi)
app.get("/api/auth/status", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      success: true,
      initialized: userCount > 0,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Inisialisasi Akun Admin Pertama Kali (Hanya bisa dipanggil jika userCount == 0)
app.post("/api/auth/setup", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(403).json({
        success: false,
        message: "Aplikasi sudah diinisialisasi. Registrasi baru ditutup.",
      });
    }

    const { username, password } = req.body;
    if (
      !username ||
      !password ||
      username.trim().length < 3 ||
      password.length < 6
    ) {
      return res.status(400).json({
        success: false,
        message: "Username minimal 3 karakter dan password minimal 6 karakter.",
      });
    }

    const passwordHash = hashPassword(password);
    const adminUser = await prisma.user.create({
      data: {
        username: username.trim(),
        passwordHash,
        role: "Admin",
      },
    });

    const token = signJWT({
      userId: adminUser.id,
      username: adminUser.username,
      role: adminUser.role,
    });

    res.json({
      success: true,
      message: "Akun Admin berhasil dibuat!",
      token,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Login Akun (Dilindungi Brute Force Rate Limiter)
app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: "Username atau password salah.",
      });
    }

    const token = signJWT({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    res.json({
      success: true,
      message: "Login berhasil!",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Ubah Password Pengguna (Dilindungi JWT)
app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Password saat ini dan password baru wajib diisi.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password baru minimal 6 karakter.",
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Sesi tidak valid." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Pengguna tidak ditemukan." });
    }

    // Verifikasi password saat ini
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(400).json({
        success: false,
        message: "Password saat ini salah.",
      });
    }

    // Update password hash baru
    const newPasswordHash = hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    addAppLog(
      "INFO",
      "Auth",
      `Password untuk user [${user.username}] berhasil diperbarui.`,
    );

    res.json({
      success: true,
      message:
        "Password berhasil diperbarui! Silakan gunakan password baru untuk login berikutnya.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1. Ambil Konfigurasi dari Database SQLite Lokal (Dilindungi JWT)
app.get("/api/config", requireAuth, async (req, res) => {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
    });
    res.json({
      success: true,
      data: config || {
        clientToken: "",
        binanceApiKey: "",
        binanceApiSecret: "",
        environment: "TESTNET",
        autoExecute: false,
        leverage: 10,
        riskPerTradePct: 2.0,
        maxOpenPositions: 3,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Simpan Konfigurasi ke Database SQLite Lokal & Otomatis Reconnect Bot (Dilindungi JWT)
app.post("/api/config", requireAuth, async (req, res) => {
  try {
    const {
      clientToken,
      binanceApiKey,
      binanceApiSecret,
      environment,
      autoExecute,
      leverage,
      riskPerTradePct,
      maxOpenPositions,
    } = req.body;

    const saved = await prisma.appConfig.upsert({
      where: { id: 1 },
      update: {
        clientToken: clientToken ? clientToken.trim() : null,
        binanceApiKey: binanceApiKey ? binanceApiKey.trim() : null,
        binanceApiSecret: binanceApiSecret ? binanceApiSecret.trim() : null,
        environment: environment || "TESTNET",
        autoExecute: autoExecute ?? false,
        leverage: leverage ? Number(leverage) : 10,
        riskPerTradePct: riskPerTradePct ? Number(riskPerTradePct) : 2.0,
        maxOpenPositions: maxOpenPositions ? Number(maxOpenPositions) : 3,
      },
      create: {
        id: 1,
        clientToken: clientToken ? clientToken.trim() : null,
        binanceApiKey: binanceApiKey ? binanceApiKey.trim() : null,
        binanceApiSecret: binanceApiSecret ? binanceApiSecret.trim() : null,
        environment: environment || "TESTNET",
        autoExecute: autoExecute ?? false,
        leverage: leverage ? Number(leverage) : 10,
        riskPerTradePct: riskPerTradePct ? Number(riskPerTradePct) : 2.0,
        maxOpenPositions: maxOpenPositions ? Number(maxOpenPositions) : 3,
      },
    });

    // Otomatis Reconnect WebSocket jika ada token di konfigurasi
    if (saved.clientToken) {
      connectToNestJS(saved.clientToken);
    }

    res.json({
      success: true,
      message: "Konfigurasi berhasil disimpan dan bot diperbarui!",
      data: saved,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Tes Koneksi Kredensial Binance (Dilindungi JWT)
app.post("/api/config/test-connection", requireAuth, async (req, res) => {
  try {
    const { apiKey, apiSecret, environment } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message:
          "Binance API Key dan API Secret wajib diisi untuk menguji koneksi.",
      });
    }

    const result = await testBinanceConnection(
      apiKey.trim(),
      apiSecret.trim(),
      environment || "TESTNET",
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Gagal menguji koneksi.",
    });
  }
});

// 4. Ambil Akun & Posisi Terbuka Binance Futures (Dilindungi JWT)
app.get("/api/positions", requireAuth, async (req, res) => {
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config?.binanceApiKey || !config?.binanceApiSecret) {
      return res.json({ success: true, account: null, positions: [] });
    }

    const { account, positions } = await getAccountAndPositions(
      config.binanceApiKey.trim(),
      config.binanceApiSecret.trim(),
      config.environment || "TESTNET",
    );

    res.json({ success: true, account, positions });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message,
      account: null,
      positions: [],
    });
  }
});

// 5. Tutup Posisi Terbuka Secara Manual (Dilindungi JWT)
app.post("/api/positions/close", requireAuth, async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res
        .status(400)
        .json({ success: false, message: "Symbol wajib diisi." });
    }

    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config?.binanceApiKey || !config?.binanceApiSecret) {
      return res.status(400).json({
        success: false,
        message: "API Key Binance belum dikonfigurasi.",
      });
    }

    addAppLog(
      "INFO",
      "ManualAction",
      `Menutup posisi manual untuk ${symbol}...`,
    );
    const isTestnet = config.environment === "TESTNET";
    const result = await closePositionDirect(
      config.binanceApiKey.trim(),
      config.binanceApiSecret.trim(),
      symbol.trim(),
      isTestnet,
    );

    addAppLog("SUCCESS", "ManualAction", `Posisi ${symbol} berhasil ditutup!`);
    res.json({
      success: true,
      message: `Posisi ${symbol} berhasil ditutup!`,
      result,
    });
  } catch (err: any) {
    addAppLog(
      "ERROR",
      "ManualAction",
      `Gagal menutup posisi ${req.body.symbol}: ${err.message}`,
    );
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Ambil Log Aktivitas Aplikasi (In-Memory Buffer) (Dilindungi JWT)
app.get("/api/logs", requireAuth, (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  res.json({ success: true, logs: getAppLogs(limit) });
});

// 7. Bersihkan Log Aktivitas (Dilindungi JWT)
app.delete("/api/logs", requireAuth, (req, res) => {
  clearAppLogs();
  addAppLog("INFO", "System", "Log aktivitas dibersihkan.");
  res.json({ success: true, message: "Log berhasil dibersihkan." });
});

// Start Express Server
app.listen(PORT, async () => {
  console.log("=========================================");
  console.log(`🚀 CLIENT APP SERVER JALAN DI PORT ${PORT}`);
  console.log("=========================================");

  addAppLog("INFO", "System", `Client App Server berjalan di port ${PORT}`);

  // Inisialisasi koneksi WebSocket dari database lokal SQLite
  await connectToNestJS();
});

// =================================================================
// LOGIKA WEB-SOCKET (BOT EKSEKUTOR BERBASIS SQLITE CONFIG)
// =================================================================
let socket: ReturnType<typeof Client> | null = null;

async function connectToNestJS(tokenOverride?: string) {
  let activeToken = tokenOverride;

  if (!activeToken) {
    try {
      const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
      activeToken =
        config?.clientToken || process.env.CLIENT_TOKEN || undefined;
    } catch (err) {
      console.error("[Bot] Gagal membaca token dari database:", err);
    }
  }

  if (!activeToken) {
    addAppLog(
      "WARN",
      "SignalClient",
      "Belum ada Client Token. Masukkan Client Token di Web Dashboard (Menu Config).",
    );
    return;
  }

  if (socket) {
    addAppLog(
      "INFO",
      "SignalClient",
      "Memperbarui sesi WebSocket dengan token baru...",
    );
    socket.disconnect();
    socket = null;
  }

  addAppLog(
    "INFO",
    "SignalClient",
    `Menghubungkan ke Server Sinyal (${SERVER_URL})...`,
  );

  socket = Client(SERVER_URL, {
    transports: ["websocket", "polling"],
    auth: { token: activeToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
  });

  socket.on("connect", () => {
    addAppLog(
      "SUCCESS",
      "SignalClient",
      `Terhubung ke Server Sinyal (${SERVER_URL})!`,
    );
  });

  socket.on("disconnect", (reason) => {
    addAppLog(
      "WARN",
      "SignalClient",
      `Terputus dari Server Sinyal (${reason})`,
    );
  });

  socket.on("connect_error", (err) => {
    addAppLog(
      "WARN",
      "SignalClient",
      `Gagal terhubung ke sinyal (${err.message})`,
    );
  });

  socket.on("new_signal", async (data) => {
    try {
      const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
      if (!config) {
        addAppLog(
          "WARN",
          "SignalEngine",
          "Konfigurasi bot belum tersimpan di database.",
        );
        return;
      }

      await executeSignalOrder(data, {
        autoExecute: config.autoExecute,
        binanceApiKey: config.binanceApiKey,
        binanceApiSecret: config.binanceApiSecret,
        environment: config.environment || "TESTNET",
        leverage: config.leverage || 10,
        riskPerTradePct: config.riskPerTradePct || 2.0,
        maxOpenPositions: config.maxOpenPositions || 3,
      });
    } catch (err: any) {
      addAppLog(
        "ERROR",
        "SignalEngine",
        `Error saat memproses sinyal: ${err.message}`,
        err,
      );
    }
  });
}
