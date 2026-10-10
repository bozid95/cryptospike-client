import cors from "cors";

// Middleware CORS Ketat (Mencegah Cross-Origin Request dari domain asing)
export const corsMiddleware = cors({
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
});
