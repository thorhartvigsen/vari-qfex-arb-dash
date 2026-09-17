export type LiqSide = "long" | "short";

export interface LiqLeg {
  venue: "oai" | "softbank";
  label: string;
  side: LiqSide;
  size: number;
  /** Native quote: USD for OAI, JPY for SoftBank. */
  mark: number;
  markUsd: number;
  liq: number | null;
  liqUsd: number | null;
  /** Percent price move (USD) from mark to liq. 0 = at/through liq. */
  distPct: number | null;
  quote: "USD" | "JPY";
}

export interface OaiSbLiqPayload {
  oai: LiqLeg | null;
  softbank: LiqLeg | null;
  fetchedAt: number;
}

export function sideFromSize(size: number): LiqSide | "flat" {
  if (size > 0) return "long";
  if (size < 0) return "short";
  return "flat";
}

/**
 * Cross-margin liq: equity(m) = maint_rate × |size| × m
 * equity(m) = equity0 + size × (m − mark0)
 */
export function estimateLiqPrice(opts: {
  size: number;
  mark: number;
  equity: number;
  maintRate: number;
}): number | null {
  const { size, mark, equity, maintRate } = opts;
  if (!Number.isFinite(size) || size === 0) return null;
  if (![mark, equity, maintRate].every(Number.isFinite)) return null;
  if (!(mark > 0) || maintRate <= 0 || maintRate >= 1) return null;

  const denom = maintRate * Math.abs(size) - size;
  if (Math.abs(denom) < 1e-12) return null;
  const liq = (equity - size * mark) / denom;
  return Number.isFinite(liq) && liq > 0 ? liq : null;
}

/** Remaining room to liquidation as a % of mark. Null if not liquidatable. */
export function distToLiqPct(
  size: number,
  mark: number,
  liq: number | null,
): number | null {
  if (liq == null || !(mark > 0) || !Number.isFinite(size) || size === 0) {
    return null;
  }
  if (!(liq > 0)) return null;
  if (size > 0) {
    if (liq >= mark) return 0;
    return ((mark - liq) / mark) * 100;
  }
  if (liq <= mark) return 0;
  return ((liq - mark) / mark) * 100;
}
