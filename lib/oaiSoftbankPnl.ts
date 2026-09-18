import "server-only";
import { HL_INFO, OAI_DEX } from "@/lib/oaiSoftbank";
import { pnlStats, type OaiSbPnlPayload, type PnlPoint } from "@/lib/pnlTypes";
import {
  SNAPSHOT_MS,
  appendPnlPoint,
  pnlPersistMode,
  readPnlStore,
} from "@/lib/pnlStore";
import { qfexAuthedGet } from "@/lib/qfexAuth";

export type { OaiSbPnlPayload, PnlPoint };

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

export async function fetchOaiSoftbankPnl(opts?: {
  snapshot?: boolean;
}): Promise<OaiSbPnlPayload> {
  const live = await fetchLiveCollateral();
  const existing = await readPnlStore();
  const last = existing.points[existing.points.length - 1];
  const stale = !last || live.time - last.time >= SNAPSHOT_MS;
  const shouldWrite = opts?.snapshot === true && stale;

  let store = existing;
  let stored = false;
  if (shouldWrite) {
    const before = existing.points.length;
    store = await appendPnlPoint(live);
    stored = store.points.length > before;
  }

  const points = store.points;

  return {
    points,
    live,
    stats: pnlStats(points),
    stored,
    persist: pnlPersistMode(),
    fetchedAt: Date.now(),
  };
}
