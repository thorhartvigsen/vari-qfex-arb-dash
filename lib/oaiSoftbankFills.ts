import { HL_INFO } from "@/lib/entropy";
import {
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  OAI_COIN,
  SB_COIN,
  listingSpreadPp,
  type OaiSbSignal,
} from "@/lib/oaiSoftbank";

export const FILLS_FROM_MS = Date.parse("2026-09-17T00:00:00.000Z");
const CLUSTER_MS = 5 * 60_000;

export interface OaiSbFill {
  time: number;
  coin: string;
  side: "buy" | "sell";
  dir: string;
  price: number;
  size: number;
  notional: number;
  closedPnl: number | null;
  tid: string;
}

export interface OaiSbExecution {
  time: number;
  kind: OaiSbSignal | "mixed";
  spreadPp: number | null;
  oaiPx: number | null;
  sbPx: number | null;
  oaiSide: "buy" | "sell" | null;
  sbSide: "buy" | "sell" | null;
  oaiSize: number;
  sbSize: number;
  oaiNotional: number;
  sbNotional: number;
  fillCount: number;
}

export interface OaiSbFillsPayload {
  from: number;
  executions: OaiSbExecution[];
  fills: OaiSbFill[];
  fetchedAt: number;
}

interface HlFill {
  coin?: string;
  px?: string;
  sz?: string;
  side?: string;
  time?: number;
  dir?: string;
  closedPnl?: string;
  tid?: number | string;
  hash?: string;
}

async function postFills(body: Record<string, unknown>): Promise<HlFill[]> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid fills failed (${response.status})`);
  }
  const json = (await response.json()) as HlFill[] | { data?: HlFill[] };
  if (Array.isArray(json)) return json;
  return Array.isArray(json.data) ? json.data : [];
}

function parseFill(row: HlFill): OaiSbFill | null {
  const coin = String(row.coin ?? "");
  if (coin !== OAI_COIN && coin !== SB_COIN) return null;
  const time = Number(row.time);
  const price = Number(row.px);
  const size = Number(row.sz);
  if (!Number.isFinite(time) || time < FILLS_FROM_MS) return null;
  if (!(price > 0) || !(size > 0)) return null;
  const side: "buy" | "sell" | null =
    row.side === "B" ? "buy" : row.side === "A" ? "sell" : null;
  if (!side) return null;
  return {
    time,
    coin,
    side,
    dir: String(row.dir ?? ""),
    price,
    size,
    notional: price * size,
    closedPnl: Number.isFinite(Number(row.closedPnl)) ? Number(row.closedPnl) : null,
    tid: String(row.tid ?? row.hash ?? `${coin}-${time}`),
  };
}

function vwap(fills: OaiSbFill[]): { px: number; size: number; notional: number; side: "buy" | "sell" | null } | null {
  if (fills.length === 0) return null;
  let qty = 0;
  let notional = 0;
  let buyQty = 0;
  let sellQty = 0;
  for (const fill of fills) {
    qty += fill.size;
    notional += fill.notional;
    if (fill.side === "buy") buyQty += fill.size;
    else sellQty += fill.size;
  }
  if (!(qty > 0) || !(notional > 0)) return null;
  return {
    px: notional / qty,
    size: qty,
    notional,
    side: buyQty === sellQty ? null : buyQty > sellQty ? "buy" : "sell",
  };
}

function clusterExecutions(
  fills: OaiSbFill[],
  oaiBase: number,
  sbBase: number,
): OaiSbExecution[] {
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  const groups: OaiSbFill[][] = [];
  for (const fill of sorted) {
    const last = groups[groups.length - 1];
    if (last && fill.time - last[last.length - 1].time <= CLUSTER_MS) {
      last.push(fill);
    } else {
      groups.push([fill]);
    }
  }

  return groups
    .map((group) => {
      const oai = vwap(group.filter((f) => f.coin === OAI_COIN));
      const sb = vwap(group.filter((f) => f.coin === SB_COIN));
      let kind: OaiSbExecution["kind"] = "flat";
      if (oai?.side === "sell" && sb?.side === "buy") kind = "short_oai";
      else if (oai?.side === "buy" && sb?.side === "sell") kind = "long_oai";
      else if (oai && sb) kind = "mixed";
      return {
        time: group[0].time,
        kind,
        spreadPp: listingSpreadPp(oai?.px, sb?.px, oaiBase, sbBase),
        oaiPx: oai?.px ?? null,
        sbPx: sb?.px ?? null,
        oaiSide: oai?.side ?? null,
        sbSide: sb?.side ?? null,
        oaiSize: oai?.size ?? 0,
        sbSize: sb?.size ?? 0,
        oaiNotional: oai?.notional ?? 0,
        sbNotional: sb?.notional ?? 0,
        fillCount: group.length,
      };
    })
    .sort((a, b) => b.time - a.time);
}

export async function fetchOaiSoftbankFills(): Promise<OaiSbFillsPayload> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const [byTime, recent] = await Promise.all([
    postFills({
      type: "userFillsByTime",
      user: wallet,
      startTime: FILLS_FROM_MS,
    }),
    postFills({ type: "userFills", user: wallet }),
  ]);

  const byTid = new Map<string, OaiSbFill>();
  for (const row of [...byTime, ...recent]) {
    const fill = parseFill(row);
    if (!fill) continue;
    byTid.set(fill.tid, fill);
  }
  const fills = [...byTid.values()].sort((a, b) => b.time - a.time);
  return {
    from: FILLS_FROM_MS,
    executions: clusterExecutions(fills, FALLBACK_OAI_BASE, FALLBACK_SB_BASE),
    fills,
    fetchedAt: Date.now(),
  };
}
