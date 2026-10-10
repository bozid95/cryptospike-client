import { Request, Response, NextFunction } from "express";

// In-Memory Rate Limiter untuk mencegah serangan Brute Force pada Login
const loginAttempts = new Map<
  string,
  { count: number; firstAttempt: number }
>();

export function loginRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
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

// Helper untuk reset saat testing
export function clearRateLimiter() {
  loginAttempts.clear();
}
