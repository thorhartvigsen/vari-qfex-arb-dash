export interface PnlPoint {
  time: number;
  qfex: number;
  hl: number;
  total: number;
}

export const START_COLLATERAL = 48_000;

export interface PnlStats {
  sharpe: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
}

export interface OaiSbPnlPayload {
  points: PnlPoint[];
  live: PnlPoint;
  stats: PnlStats;
  stored: boolean;
  persist: PnlPersist;
  fetchedAt: number;
}

export type PnlPersist = "blob" | "local" | "ephemeral";

const PERIODS_PER_YEAR = 365.25 * 24 * 60; // 1-minute bars

export function pnlStats(
  points: PnlPoint[],
  start = START_COLLATERAL,
): PnlStats {
  const totals = points.map((p) => p.total).filter((n) => n > 0);
  const last = totals[totals.length - 1];
  const pnlUsd = last == null ? null : last - start;
  const pnlPct = pnlUsd == null || !(start > 0) ? null : (pnlUsd / start) * 100;

  const returns: number[] = [];
  for (let i = 1; i < totals.length; i += 1) {
    if (!(totals[i - 1] > 0)) continue;
    returns.push(totals[i] / totals[i - 1] - 1);
  }

  let sharpe: number | null = null;
  if (returns.length >= 2) {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 1e-12 ? (mean / std) * Math.sqrt(PERIODS_PER_YEAR) : null;
  }

  return { sharpe, pnlUsd, pnlPct };
}
