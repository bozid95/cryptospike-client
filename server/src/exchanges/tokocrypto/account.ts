import {
  TOKOCRYPTO_BASE_URL,
  getTokocryptoServerTime,
  buildTokocryptoSignedQuery,
} from "./client";

/**
 * Mengambil saldo aset kas (USDT atau BIDR) dari Tokocrypto
 */
export async function getTokocryptoBalance(
  apiKey: string,
  apiSecret: string,
  asset: string = "USDT",
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<{ asset: string; free: number; locked: number }> {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();

  if (!cleanKey || !cleanSecret) {
    throw new Error("Tokocrypto API Key and API Secret cannot be empty.");
  }

  const serverTime = await getTokocryptoServerTime(baseUrl, customFetch);
  const queryString = buildTokocryptoSignedQuery(
    { asset: asset.toUpperCase() },
    cleanSecret,
    serverTime,
  );

  const res = await customFetch(
    `${baseUrl}/open/v1/account/spot/asset?${queryString}`,
    {
      method: "GET",
      headers: {
        "X-MBX-APIKEY": cleanKey,
      },
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Tokocrypto HTTP ${res.status}: ${errorText}`);
  }

  const json = (await res.json()) as any;
  if (json.code !== undefined && json.code !== 0 && json.code !== 200) {
    throw new Error(
      `Tokocrypto Error [${json.code}]: ${json.msg || "Failed to retrieve balance"}`,
    );
  }

  const data = json.data;
  let free = 0;
  let locked = 0;

  if (Array.isArray(data)) {
    const found = data.find(
      (a: any) => (a.asset || "").toUpperCase() === asset.toUpperCase(),
    );
    if (found) {
      free = parseFloat(found.free || "0");
      locked = parseFloat(found.locked || "0");
    }
  } else if (data && typeof data === "object") {
    free = parseFloat(data.free || "0");
    locked = parseFloat(data.locked || "0");
  }

  return {
    asset: asset.toUpperCase(),
    free,
    locked,
  };
}

/**
 * Mengetes koneksi API Tokocrypto dan memeriksa validitas kredensial
 */
export async function testTokocryptoConnection(
  apiKey: string,
  apiSecret: string,
  quoteAsset: "USDT" | "BIDR" = "USDT",
  baseUrl: string = TOKOCRYPTO_BASE_URL,
  customFetch: typeof fetch = fetch,
): Promise<{
  success: boolean;
  message: string;
  balance?: number;
  serverTime?: number;
}> {
  try {
    const cleanKey = apiKey.trim();
    const cleanSecret = apiSecret.trim();

    if (!cleanKey || !cleanSecret) {
      return {
        success: false,
        message: "Tokocrypto API Key and Secret are required.",
      };
    }

    const serverTime = await getTokocryptoServerTime(baseUrl, customFetch);
    const balance = await getTokocryptoBalance(
      cleanKey,
      cleanSecret,
      quoteAsset,
      baseUrl,
      customFetch,
    );

    return {
      success: true,
      message: `Tokocrypto connection verified! Available ${quoteAsset}: ${balance.free.toFixed(2)}`,
      balance: balance.free,
      serverTime,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Tokocrypto verification failed: ${err.message}`,
    };
  }
}
