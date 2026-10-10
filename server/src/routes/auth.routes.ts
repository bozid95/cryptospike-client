import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { signJWT } from "../lib/jwt";
import { addAppLog } from "../lib/logger";
import { hashPassword, verifyPassword } from "../services/auth.service";
import { requireAuth } from "../middlewares/auth";
import { loginRateLimiter } from "../middlewares/rateLimiter";

export const authRouter = Router();

// 1. Cek status inisialisasi akun admin pertama
authRouter.get("/status", async (req: Request, res: Response) => {
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

// 2. Inisialisasi Akun Admin Pertama Kali
authRouter.post("/setup", async (req: Request, res: Response) => {
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
authRouter.post(
  "/login",
  loginRateLimiter,
  async (req: Request, res: Response) => {
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
  },
);

// 4. Ubah Password Pengguna (Dilindungi JWT)
authRouter.post(
  "/change-password",
  requireAuth,
  async (req: Request, res: Response) => {
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
  },
);
