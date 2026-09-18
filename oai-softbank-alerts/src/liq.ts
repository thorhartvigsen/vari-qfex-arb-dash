import { liqPingUrl } from "./config.ts";

export const LIQ_LEVELS = [15, 10, 5] as const;
export type LiqLevel = (typeof LIQ_LEVELS)[number];

export interface LiqLeg {
  venue: "oai" | "softbank";
  label: string;
  side: "long" | "short";
  size: number;
  mark: number;
  markUsd: number;
  liq: number | null;
  liqUsd: number | null;
  distPct: number | null;
  quote: "USD" | "JPY";
}

export interface LiqSnapshot {
  oai: LiqLeg | null;
  softbank: LiqLeg | null;
  fetchedAt: number;
}

export async function fetchLiqSnapshot(): Promise<LiqSnapshot> {
  const url = liqPingUrl();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`liq ${response.status}: ${text.slice(0, 160)}`);
  }
  const json = JSON.parse(text) as LiqSnapshot & { ok?: boolean; error?: string };
  if (json.ok === false) {
    throw new Error(json.error ?? "liq snapshot failed");
  }
  return json;
}

export type LiqArmed = Record<LiqLevel, boolean>;

export function freshLiqArmed(): LiqArmed {
  return { 15: true, 10: true, 5: true };
}

/**
 * Fire once when remaining room-to-liq drops onto or through 15 / 10 / 5%.
 * Re-arm after the print recovers `hysteresisPct` above that level.
 */
export function crossedLiqLevels(
  distPct: number | null,
  armed: LiqArmed,
  hysteresisPct: number,
): LiqLevel[] {
  if (distPct == null || !Number.isFinite(distPct)) {
    for (const level of LIQ_LEVELS) armed[level] = true;
    return [];
  }

  const hits: LiqLevel[] = [];
  for (const level of LIQ_LEVELS) {
    if (!armed[level]) {
      if (distPct > level + hysteresisPct) armed[level] = true;
      continue;
    }
    if (distPct <= level) {
      hits.push(level);
      armed[level] = false;
    }
  }
  return hits;
}

/** USD notional of a leg. Null if JPY mark was not converted via USDJPY. */
export function notionalUsd(leg: LiqLeg | null): number | null {
  if (!leg) return 0;
  const px = leg.markUsd > 0 ? leg.markUsd : leg.mark;
  if (!(px > 0) || !Number.isFinite(leg.size)) return null;
  if (
    leg.quote === "JPY" &&
    leg.mark > 0 &&
    Math.abs(leg.markUsd / leg.mark - 1) < 0.05
  ) {
    return null;
  }
  const n = Math.abs(leg.size) * px;
  return Number.isFinite(n) ? n : null;
}

export function venueImbalanceUsd(snap: LiqSnapshot): number | null {
  const oai = notionalUsd(snap.oai);
  const sb = notionalUsd(snap.softbank);
  if (oai == null || sb == null) return null;
  return Math.abs(oai - sb);
}

/**
 * Fire once when |OAI − SoftBank| notional reaches `threshold`.
 * Re-arm after the gap falls `hysteresisUsd` below that level.
 */
export function crossedImbalance(
  gapUsd: number | null,
  armed: { current: boolean },
  threshold: number,
  hysteresisUsd: number,
): boolean {
  if (gapUsd == null || !Number.isFinite(gapUsd)) {
    armed.current = true;
    return false;
  }
  if (!armed.current) {
    if (gapUsd < threshold - hysteresisUsd) armed.current = true;
    return false;
  }
  if (gapUsd >= threshold) {
    armed.current = false;
    return true;
  }
  return false;
}
