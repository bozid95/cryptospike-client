import { Request, Response, NextFunction } from "express";
import { verifyJWT, JWTPayload } from "../lib/jwt";

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
      message: "Access denied. JWT authentication token not found.",
    });
  }

  const token = authHeader.substring(7);
  const decoded = verifyJWT(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: "Session expired or token is invalid. Please log in again.",
    });
  }

  req.user = decoded;
  next();
}
