export const HL_INFO = "https://api.hyperliquid.xyz/info";
export const QFEX_API = "https://api.qfex.com";
export const OAI_COIN = "io:OAI";
export const SB_SYMBOL = "SOFTBANK-JPY";
export const JPY_COIN = "xyz:JPY";
export const LISTING_MS = Date.parse("2026-09-02T13:00:00.000Z");

export const FALLBACK_OAI_BASE = 1151.8;
/** TradeXYZ SoftBank USD print at listing; QFEX JPY is converted via USDJPY. */
export const FALLBACK_SB_BASE = 31.235;

export const CONVERGE_PP = 8;
export const UPPER_PP = 18;
export const LOWER_PP = -2;

/** Same bot as tgalerter / the arb trader. Env still overrides if set. */
export const DEFAULT_BOT_TOKEN =
  "8298455316:AAH3m8zZe300Z15Ico-6xp2Mjk2KyvkgIe4";
export const DEFAULT_CHAT_ID = "-5462179063";
/** Risk chat — liquidation distance alerts. */
export const DEFAULT_LIQ_CHAT_ID = "-5325885280";

export function envString(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function telegramBotToken(): string {
  return envString("TELEGRAM_BOT_TOKEN", DEFAULT_BOT_TOKEN);
}

export function telegramChatId(): string {
  return envString("TELEGRAM_CHAT_ID", DEFAULT_CHAT_ID);
}

export function telegramLiqChatId(): string {
  return envString("TELEGRAM_CHAT_LIQ", DEFAULT_LIQ_CHAT_ID);
}

export function pollMs(): number {
  return Math.max(500, envNumber("POLL_MS", 2_000));
}

export function hysteresisPp(): number {
  const raw = Number(process.env.HYSTERESIS_PP);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.75;
}

export function pnlPingUrl(): string {
  return envString(
    "PNL_PING_URL",
    "https://vari-qfex-arb-dash.vercel.app/api/oai-softbank/pnl",
  );
}

export function liqPingUrl(): string {
  return envString(
    "LIQ_PING_URL",
    "https://vari-qfex-arb-dash.vercel.app/api/oai-softbank/liq",
  );
}

export function liqPollMs(): number {
  return Math.max(1_000, envNumber("LIQ_POLL_MS", 5_000));
}

export function liqHysteresisPct(): number {
  const raw = Number(process.env.LIQ_HYSTERESIS_PCT);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2;
}

export function healthPort(): number {
  return envNumber("PORT", 8080);
}

export function jpyToUsd(jpy: number, usdJpy: number): number | null {
  if (!(jpy > 0 && usdJpy > 0)) return null;
  return jpy / usdJpy;
}

export function listingSpreadPp(
  oaiPx: number,
  sbPx: number,
  oaiBase: number,
  sbBase: number,
): number | null {
  if (!(oaiPx > 0 && sbPx > 0 && oaiBase > 0 && sbBase > 0)) return null;
  return 100 * (oaiPx / oaiBase - 1) - 100 * (sbPx / sbBase - 1);
}

export function bookMid(bid: number | null, ask: number | null): number | null {
  if (bid != null && ask != null && bid > 0 && ask > 0) return (bid + ask) / 2;
  if (bid != null && bid > 0) return bid;
  if (ask != null && ask > 0) return ask;
  return null;
}

export function fmtPp(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)} pp`;
}

export function fmtPx(n: number, decimals: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
