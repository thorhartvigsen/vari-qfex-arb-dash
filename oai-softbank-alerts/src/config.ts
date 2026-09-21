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
/** Orders chat — fills, signal vs executed spread, incomplete legs. */
export const DEFAULT_ORDERS_CHAT_ID = "-5344711654";

export const OAI_DEX = "io";
export const MID_PP = CONVERGE_PP;
export const MAX_LEV = 3;
/** Isolated cap on Entropy OAI (venue max is 6). */
export const OAI_ISOLATED_LEV = 6;
export const OAI_SIZE_DECIMALS = 3;
export const OAI_PRICE_DECIMALS = 1;
export const SB_SIZE_DECIMALS = 4;
export const SB_PRICE_DECIMALS = 1;
/** IOC vs touch: first clip 50 bps, retry 50 bps, then 100 bps. */
export const HL_SLIPPAGE_SCHEDULE_BPS = [50, 50, 100] as const;
export const MIN_CLIP_USD = 400;
/** Dashboard $1,000 executable print — must still hold the entry rung. */
export const WALK_USD = 1_000;
export const TRADE_COOLDOWN_MS = 4_000;
export const RETRY_COOLDOWN_MS = 1_500;

/**
 * Target leverage vs |listing-spread − 8 pp|.
 * 10 pp away is −2 / +18 (the old alert bands) — not 10 bps.
 */
export const LEV_TIERS = [
  { distPp: 2, lev: 0.3 },
  { distPp: 3, lev: 0.6 },
  { distPp: 4.5, lev: 1 },
  { distPp: 6, lev: 1.5 },
  { distPp: 10, lev: 2 },
  { distPp: 14, lev: 2.5 },
  { distPp: 18, lev: 3 },
] as const;

/**
 * Take-profit caps vs |listing-spread − 8 pp| (tighter than scale-in).
 * At 10% from mid, max keep is 2.5×; inside 1% of mid, 0.3×; at mid, flat.
 */
export const EXIT_TIERS = [
  { distPp: 0, lev: 0 },
  { distPp: 1, lev: 0.3 },
  { distPp: 2, lev: 0.6 },
  { distPp: 3.5, lev: 1 },
  { distPp: 5, lev: 1.5 },
  { distPp: 8, lev: 2 },
  { distPp: 10, lev: 2.5 },
] as const;

export const LEV_HOLD_EPS = 0.04;

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

export function telegramOrdersChatId(): string {
  return envString("TELEGRAM_CHAT_ORDERS", DEFAULT_ORDERS_CHAT_ID);
}

export function tradingEnabled(): boolean {
  return envString("TRADING_ENABLED", "true") !== "false";
}

export function traderDryRun(): boolean {
  return envString("TRADER_DRY_RUN", "false") === "true";
}

export function traderLive(): boolean {
  return (
    tradingEnabled() &&
    !traderDryRun() &&
    Boolean(envString("HL_PRIVATE_KEY")) &&
    Boolean(envString("QFEX_PUBLIC_KEY")) &&
    Boolean(envString("QFEX_SECRET_KEY"))
  );
}

export function minClipUsd(): number {
  return envNumber("MIN_CLIP_USD", MIN_CLIP_USD);
}

export function pollMs(): number {
  return Math.max(500, envNumber("POLL_MS", 2_000));
}

export function hysteresisPp(): number {
  const raw = Number(process.env.HYSTERESIS_PP);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.75;
}

/** Skip another +8 converge alert if the last spread ping was also +8, for this long. */
export function convergeCooldownMs(): number {
  const hours = Number(process.env.CONVERGE_COOLDOWN_HOURS);
  if (Number.isFinite(hours) && hours >= 0) return hours * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}

export function pnlPingUrl(): string {
  return envString(
    "PNL_PING_URL",
    "https://vari-qfex-arb-dash.vercel.app/api/oai-softbank/pnl?snapshot=1",
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

/** USD notional gap between OAI and SoftBank that fires a risk-chat alert. */
export function imbalanceUsdThreshold(): number {
  return envNumber("IMBALANCE_USD", 10_000);
}

/** Re-arm the imbalance alert after the gap falls this far below the threshold. */
export function imbalanceHysteresisUsd(): number {
  const raw = Number(process.env.IMBALANCE_HYSTERESIS_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2_000;
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
