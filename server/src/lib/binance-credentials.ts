import { prisma } from "./db";
import type { BinanceEnv } from "./owned-positions";

export interface BinanceEnvCredentials {
  apiKey: string;
  apiSecret: string;
  autoExecute: boolean;
}

/**
 * Kredensial per environment, dengan aturan yang SAMA seperti eksekusi sinyal (socket.service):
 * field khusus environment (liveApiKey / testnetApiKey) diutamakan, field legacy hanya dipakai bila
 * `environment` legacy sama. Null bila key/secret kosong.
 */
export function resolveBinanceCredentials(
  config: any,
  env: BinanceEnv,
): BinanceEnvCredentials | null {
  if (!config) return null;
  const isTestnet = env === "TESTNET";
  const legacy = config.environment === env;
  const apiKey = isTestnet
    ? config.testnetApiKey || (legacy ? config.apiKey : null)
    : config.liveApiKey || (legacy ? config.apiKey : null);
  const apiSecret = isTestnet
    ? config.testnetApiSecret || (legacy ? config.apiSecret : null)
    : config.liveApiSecret || (legacy ? config.apiSecret : null);
  if (!apiKey || !apiSecret) return null;
  const autoExecute = Boolean(
    (isTestnet ? config.testnetAutoExecute : config.liveAutoExecute) ||
      (legacy && config.autoExecute),
  );
  return {
    apiKey: String(apiKey).trim(),
    apiSecret: String(apiSecret).trim(),
    autoExecute,
  };
}

/** Baca kredensial TERBARU dari database (dipakai sebelum setiap aksi otomatis). */
export async function loadBinanceCredentials(
  env: BinanceEnv,
): Promise<BinanceEnvCredentials | null> {
  const config = await prisma.binanceConfig.findUnique({ where: { id: 1 } });
  return resolveBinanceCredentials(config, env);
}
