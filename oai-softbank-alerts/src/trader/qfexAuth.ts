import { createHmac, randomBytes } from "node:crypto";

export function qfexAuthHeaders(): Record<string, string> {
  const publicKey = process.env.QFEX_PUBLIC_KEY;
  const secretKey = process.env.QFEX_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error("Missing QFEX_PUBLIC_KEY / QFEX_SECRET_KEY");
  }

  const nonce = randomBytes(16).toString("hex");
  const unixTs = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secretKey)
    .update(`${nonce}:${unixTs}`)
    .digest("hex");

  return {
    "x-qfex-public-key": publicKey,
    "x-qfex-nonce": nonce,
    "x-qfex-timestamp": String(unixTs),
    "x-qfex-hmac-signature": signature,
  };
}

export async function qfexAuthedGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.qfex.com${path}`, {
    headers: qfexAuthHeaders(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`QFEX ${path} error (${response.status}): ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as T;
}
