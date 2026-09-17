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
