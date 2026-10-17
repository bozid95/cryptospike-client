import dns from "dns";
import https from "https";

interface CacheEntry {
  ips: string[];
  expires: number;
}

const dnsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit cache IP

/**
 * Resolusi DNS via Google DNS-over-HTTPS (DoH)
 */
async function queryGoogleDoH(host: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const req = https.get(
      `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`,
      { timeout: 3500 },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const ips = (parsed.Answer || [])
              .filter(
                (ans: any) => ans.type === 1 && typeof ans.data === "string",
              )
              .map((ans: any) => ans.data.trim());
            resolve(ips.length > 0 ? ips : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Resolusi DNS via Cloudflare DNS-over-HTTPS (DoH Fallback)
 */
async function queryCloudflareDoH(host: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const req = https.get(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,
      {
        headers: { Accept: "application/dns-json" },
        timeout: 3500,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const ips = (parsed.Answer || [])
              .filter(
                (ans: any) => ans.type === 1 && typeof ans.data === "string",
              )
              .map((ans: any) => ans.data.trim());
            resolve(ips.length > 0 ? ips : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Ambil IP asli bursa dengan caching & dual fallback
 */
async function resolveViaDoH(host: string): Promise<string[] | null> {
  const cached = dnsCache.get(host);
  if (cached && Date.now() < cached.expires) {
    return cached.ips;
  }

  // 1. Coba Google DoH
  let ips = await queryGoogleDoH(host);

  // 2. Jika gagal/timeout, fallback ke Cloudflare DoH
  if (!ips || ips.length === 0) {
    ips = await queryCloudflareDoH(host);
  }

  if (ips && ips.length > 0) {
    dnsCache.set(host, { ips, expires: Date.now() + CACHE_TTL_MS });
    return ips;
  }

  return null;
}

let isInitialized = false;

/**
 * Menginisialisasi global DNS-over-HTTPS interceptor untuk mem-bypass DNS Poisoning / Internet Positif
 */
export function initDohResolver(): void {
  if (isInitialized) return;
  isInitialized = true;

  const origLookup = dns.lookup;

  // Intercept pemanggilan dns.lookup secara global di Node.js runtime
  (dns as any).lookup = function (
    hostname: string,
    options: any,
    callback?: any,
  ) {
    let cb = callback;
    let opt = options;

    if (typeof opt === "function") {
      cb = opt;
      opt = {};
    }

    // Hanya intercept domain yang diblokir oleh ISP lokal (Binance & Tokocrypto)
    const isTargetDomain =
      typeof hostname === "string" &&
      (hostname.endsWith("binance.com") ||
        hostname.endsWith("binancefuture.com") ||
        hostname.endsWith("tokocrypto.com") ||
        hostname.includes("binance"));

    if (isTargetDomain) {
      resolveViaDoH(hostname)
        .then((ips) => {
          if (ips && ips.length > 0) {
            // Pilih IP acak untuk load balancing
            const selectedIp = ips[Math.floor(Math.random() * ips.length)];

            if (opt && typeof opt === "object" && opt.all) {
              const allResults = ips.map((ip) => ({
                address: ip,
                family: 4,
              }));
              return cb(null, allResults);
            }

            return cb(null, selectedIp, 4);
          }
          // Jika DoH gagal, teruskan ke DNS default OS
          return origLookup(hostname, opt, cb);
        })
        .catch(() => {
          return origLookup(hostname, opt, cb);
        });
      return;
    }

    return origLookup(hostname, opt, cb);
  };

  console.log(
    "🛡️ [DoH Resolver] DNS-over-HTTPS Active (Bypassing ISP filtering for Binance & Tokocrypto)",
  );
}
