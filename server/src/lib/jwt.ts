import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Mengambil atau membuat JWT Secret persisten per instalasi lokal
 */
function getPersistentJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }

  const secretFilePath = path.join(process.cwd(), "data", ".jwt_secret");
  try {
    if (fs.existsSync(secretFilePath)) {
      const existing = fs.readFileSync(secretFilePath, "utf-8").trim();
      if (existing.length >= 32) return existing;
    }

    // Generate secret kriptografis baru jika belum ada
    const newSecret = crypto.randomBytes(64).toString("hex");
    const dataDir = path.dirname(secretFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(secretFilePath, newSecret, { mode: 0o600 });
    return newSecret;
  } catch {
    // Fallback in-memory random jika data directory read-only
    return crypto.randomBytes(64).toString("hex");
  }
}

const JWT_SECRET = getPersistentJwtSecret();

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString();
}

export interface JWTPayload {
  userId: string;

  username: string;
  role: string;
  exp?: number;
  iat?: number;
}

/**
 * Membuat Token JWT Bertanda Tangan (Default Expired 7 Hari)
 */
export function signJWT(
  payload: JWTPayload,
  expiresInSeconds = 7 * 24 * 60 * 60,
): string {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Memverifikasi Token JWT
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) return null;

    // Verifikasi Signature
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (signature !== expectedSignature) {
      return null;
    }

    const payloadJson = base64UrlDecode(encodedPayload);
    const payload: JWTPayload = JSON.parse(payloadJson);

    // Cek Expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
