import { HL_INFO, OAI_DEX } from "@/lib/oaiSoftbank";
import {
  SNAPSHOT_MS,
  appendPnlPoint,
  readPnlStore,
  type PnlPoint,
} from "@/lib/pnlStore";
import { qfexAuthedGet } from "@/lib/qfexAuth";

const PERIODS_PER_YEAR = 365.25 * 48; // 30-minute bars

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

interface QfexPositionsResponse {
  balance?: {
    deposit?: number;
    available_balance?: number;
    unrealised_pnl?: number;
    realised_pnl?: number;
    net_funding?: number;
  };
}

interface HlClearinghouse {
  marginSummary?: {
    accountValue?: string;
  };
}

interface HlSpotState {
  balances?: Array<{
    coin?: string;
    total?: string;
  }>;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid ${body.type as string} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function qfexEquity(balance: QfexPositionsResponse["balance"]): number | null {
  if (!balance) return null;
  const equity =
    Number(balance.deposit ?? 0) +
    Number(balance.realised_pnl ?? 0) +
    Number(balance.unrealised_pnl ?? 0) +
    Number(balance.net_funding ?? 0);
  return Number.isFinite(equity) ? equity : null;
}

export async function fetchLiveCollateral(): Promise<PnlPoint> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const [qfexPos, ioState, spot] = await Promise.all([
    qfexAuthedGet<QfexPositionsResponse>("/user/positions"),
    postInfo<HlClearinghouse>({
      type: "clearinghouseState",
      user: wallet,
      dex: OAI_DEX,
    }),
    postInfo<HlSpotState>({
      type: "spotClearinghouseState",
      user: wallet,
    }),
  ]);

  const qfex = qfexEquity(qfexPos.balance);
  const spotUsdc = num(
    (spot.balances ?? []).find((row) => row.coin === "USDC")?.total,
  );
  const ioEquity = num(ioState.marginSummary?.accountValue);
  const hl = spotUsdc != null && spotUsdc > 0 ? spotUsdc : ioEquity;
  if (qfex == null || hl == null) {
    throw new Error("Missing QFEX or Hyperliquid collateral");
  }

  return {
    time: Date.now(),
    qfex,
    hl,
    total: qfex + hl,
  };
}

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

export async function fetchOaiSoftbankPnl(opts?: {
  snapshot?: boolean;
}): Promise<OaiSbPnlPayload> {
  const live = await fetchLiveCollateral();
  const existing = await readPnlStore();
  const last = existing.points[existing.points.length - 1];
  const stale = !last || live.time - last.time >= SNAPSHOT_MS;
  const shouldWrite = opts?.snapshot !== false && stale;

  let store = existing;
  let stored = false;
  if (shouldWrite) {
    const before = existing.points.length;
    store = await appendPnlPoint(live);
    stored = store.points.length > before;
  }

  const points = [...store.points];
  const newest = points[points.length - 1];
  if (!newest || Math.abs(live.time - newest.time) > 15_000) {
    points.push(live);
  } else {
    points[points.length - 1] = live;
  }

  return {
    points,
    live,
    stats: pnlStats(points),
    stored,
    fetchedAt: Date.now(),
  };
}
