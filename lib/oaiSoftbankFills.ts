import { HL_INFO } from "@/lib/entropy";
import {
  CONVERGE_PP,
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  FALLBACK_USDJPY,
  JPY_COIN,
  JPY_DEX,
  OAI_COIN,
  SB_SYMBOL,
  jpyToUsd,
  listingSpreadPp,
  type OaiSbSignal,
} from "@/lib/oaiSoftbank";
import { qfexAuthedGet } from "@/lib/qfexAuth";

export const FILLS_FROM_MS = Date.parse("2026-09-17T00:00:00.000Z");
const CLUSTER_MS = 5 * 60_000;
const FIVE_MIN = 5 * 60_000;
const HL_PAGE = 500;

export interface OaiSbFill {
  time: number;
  coin: string;
  side: "buy" | "sell";
  dir: string;
  price: number;
  priceUsd: number;
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
  sbPxUsd: number | null;
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

/** Tape side vs 8%: adding with the spread is entry, covering through 8% is exit. */
export function fillRole(row: OaiSbExecution): "entry" | "exit" | null {
  if (row.spreadPp == null || !Number.isFinite(row.spreadPp)) return null;
  if (row.kind === "short_oai") return row.spreadPp > CONVERGE_PP ? "entry" : "exit";
  if (row.kind === "long_oai") return row.spreadPp < CONVERGE_PP ? "entry" : "exit";
  return null;
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

interface HlCandle {
  t?: number;
  c?: string;
}

interface QfexTradesResponse {
  data?: Array<{
    id?: string;
    order_timestamp?: number;
    symbol?: string;
    price?: number;
    quantity?: number;
    side?: string;
    realised_pnl_change?: number;
  }>;
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

async function fetchUsdJpy5m(startMs: number, endMs: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  let cursor = startMs;
  while (cursor < endMs) {
    const response = await fetch(HL_INFO, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin: JPY_COIN,
          interval: "5m",
          startTime: cursor,
          endTime: endMs,
          dex: JPY_DEX,
        },
      }),
    });
    if (!response.ok) break;
    const batch = (await response.json()) as HlCandle[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) {
      const t = Number(row.t);
      const close = Number(row.c);
      if (!Number.isFinite(t) || !(close > 0)) continue;
      out.set(Math.floor(t / FIVE_MIN) * FIVE_MIN, close);
    }
    const lastT = Math.max(...batch.map((row) => Number(row.t) || 0));
    if (!Number.isFinite(lastT) || lastT <= cursor || batch.length < HL_PAGE) break;
    cursor = lastT + 1;
  }
  return out;
}

function fxAt(time: number, closes: Map<number, number>, fallback: number): number {
  const key = Math.floor(time / FIVE_MIN) * FIVE_MIN;
  return closes.get(key) ?? fallback;
}

function parseHlFill(row: HlFill): OaiSbFill | null {
  const coin = String(row.coin ?? "");
  if (coin !== OAI_COIN) return null;
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
    priceUsd: price,
    size,
    notional: price * size,
    closedPnl: Number.isFinite(Number(row.closedPnl)) ? Number(row.closedPnl) : null,
    tid: String(row.tid ?? row.hash ?? `${coin}-${time}`),
  };
}

function parseQfexTrade(
  row: NonNullable<QfexTradesResponse["data"]>[number],
  usdJpyCloses: Map<number, number>,
  fallbackFx: number,
): OaiSbFill | null {
  const symbol = String(row.symbol ?? SB_SYMBOL);
  if (symbol !== SB_SYMBOL) return null;
  let time = Number(row.order_timestamp ?? 0);
  if (!(time > 0)) return null;
  if (time < 1e12) time *= 1000;
  if (time < FILLS_FROM_MS) return null;
  const price = Number(row.price);
  const size = Number(row.quantity);
  if (!(price > 0) || !(size > 0)) return null;
  const rawSide = String(row.side ?? "").toUpperCase();
  const side: "buy" | "sell" | null =
    rawSide === "BUY" || rawSide === "B" || rawSide === "LONG"
      ? "buy"
      : rawSide === "SELL" || rawSide === "A" || rawSide === "SHORT"
        ? "sell"
        : null;
  if (!side) return null;
  const fx = fxAt(time, usdJpyCloses, fallbackFx);
  const priceUsd = jpyToUsd(price, fx);
  if (priceUsd == null) return null;
  return {
    time,
    coin: SB_SYMBOL,
    side,
    dir: "",
    price,
    priceUsd,
    size,
    notional: priceUsd * size,
    closedPnl:
      row.realised_pnl_change !== undefined ? Number(row.realised_pnl_change) : null,
    tid: String(row.id ?? `${SB_SYMBOL}-${time}`),
  };
}

function vwap(fills: OaiSbFill[]): {
  px: number;
  pxUsd: number;
  size: number;
  notional: number;
  side: "buy" | "sell" | null;
} | null {
  if (fills.length === 0) return null;
  let qty = 0;
  let notionalNative = 0;
  let notionalUsd = 0;
  let buyQty = 0;
  let sellQty = 0;
  for (const fill of fills) {
    qty += fill.size;
    notionalNative += fill.price * fill.size;
    notionalUsd += fill.notional;
    if (fill.side === "buy") buyQty += fill.size;
    else sellQty += fill.size;
  }
  if (!(qty > 0) || !(notionalNative > 0)) return null;
  return {
    px: notionalNative / qty,
    pxUsd: notionalUsd / qty,
    size: qty,
    notional: notionalUsd,
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
      const sb = vwap(group.filter((f) => f.coin === SB_SYMBOL));
      let kind: OaiSbExecution["kind"] = "flat";
      if (oai?.side === "sell" && sb?.side === "buy") kind = "short_oai";
      else if (oai?.side === "buy" && sb?.side === "sell") kind = "long_oai";
      else if (oai && sb) kind = "mixed";
      return {
        time: group[0].time,
        kind,
        spreadPp: listingSpreadPp(oai?.pxUsd, sb?.pxUsd, oaiBase, sbBase),
        oaiPx: oai?.px ?? null,
        sbPx: sb?.px ?? null,
        sbPxUsd: sb?.pxUsd ?? null,
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

  const [byTime, recent, qfexTrades, usdJpy] = await Promise.all([
    postFills({
      type: "userFillsByTime",
      user: wallet,
      startTime: FILLS_FROM_MS,
    }),
    postFills({ type: "userFills", user: wallet }),
    qfexAuthedGet<QfexTradesResponse>(
      `/user/trade?symbol=${encodeURIComponent(SB_SYMBOL)}&limit=100`,
    ),
    fetchUsdJpy5m(FILLS_FROM_MS, Date.now()),
  ]);

  const fallbackFx =
    [...usdJpy.values()].at(-1) ?? FALLBACK_USDJPY;

  const byTid = new Map<string, OaiSbFill>();
  for (const row of [...byTime, ...recent]) {
    const fill = parseHlFill(row);
    if (!fill) continue;
    byTid.set(fill.tid, fill);
  }
  for (const row of qfexTrades.data ?? []) {
    const fill = parseQfexTrade(row, usdJpy, fallbackFx);
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
