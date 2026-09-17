export interface PnlPoint {
  time: number;
  qfex: number;
  hl: number;
  total: number;
}

export interface PnlStats {
  maxDrawdownPct: number | null;
  maxDrawdownUsd: number | null;
  sharpe: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
}

export interface OaiSbPnlPayload {
  points: PnlPoint[];
  live: PnlPoint;
  stats: PnlStats;
  stored: boolean;
  fetchedAt: number;
}

const PERIODS_PER_YEAR = 365.25 * 48; // 30-minute bars

export function pnlStats(points: PnlPoint[]): PnlStats {
  const totals = points.map((p) => p.total).filter((n) => n > 0);
  if (totals.length === 0) {
    return {
      maxDrawdownPct: null,
      maxDrawdownUsd: null,
      sharpe: null,
      pnlUsd: null,
      pnlPct: null,
    };
  }

  let peak = totals[0];
  let maxDdUsd = 0;
  let maxDdPct = 0;
  for (const value of totals) {
    if (value > peak) peak = value;
    const ddUsd = peak - value;
    const ddPct = peak > 0 ? ddUsd / peak : 0;
    if (ddUsd > maxDdUsd) maxDdUsd = ddUsd;
    if (ddPct > maxDdPct) maxDdPct = ddPct;
  }

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

  const first = totals[0];
  const last = totals[totals.length - 1];
  return {
    maxDrawdownPct: maxDdPct * 100,
    maxDrawdownUsd: maxDdUsd,
    sharpe,
    pnlUsd: last - first,
    pnlPct: first > 0 ? ((last - first) / first) * 100 : null,
  };
}
