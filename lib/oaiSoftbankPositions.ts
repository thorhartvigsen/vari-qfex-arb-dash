import { HL_INFO } from "@/lib/entropy";
import {
  OAI_COIN,
  OAI_DEX,
  SB_SYMBOL,
  type DexLeg,
  type OaiSbPositionsPayload,
} from "@/lib/oaiSoftbank";
import { qfexAuthedGet } from "@/lib/qfexAuth";
import type { Side } from "@/lib/types";

interface QfexPositionsResponse {
  positions?: Array<{
    symbol?: string;
    position?: number;
    average_price?: number;
    unrealised_pnl?: number;
  }>;
  balance?: {
    deposit?: number;
    unrealised_pnl?: number;
    realised_pnl?: number;
    net_funding?: number;
  };
}

interface HlClearinghouse {
  marginSummary?: {
    accountValue?: string;
  };
  crossMarginSummary?: {
    accountValue?: string;
  };
  withdrawable?: string;
  assetPositions?: Array<{
    position?: {
      coin?: string;
      szi?: string;
      entryPx?: string;
      unrealizedPnl?: string;
      marginUsed?: string;
      leverage?: { type?: string };
    };
  }>;
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

function sideFromSize(size: number): Side | "flat" {
  if (size > 0) return "long";
  if (size < 0) return "short";
  return "flat";
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
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

function hlEquity(io: HlClearinghouse, spot: HlSpotState): number | null {
  const isolated = (io.assetPositions ?? []).reduce((sum, row) => {
    const p = row.position;
    if (!p || p.leverage?.type !== "isolated") return sum;
    return sum + Math.max(0, num(p.marginUsed) ?? 0);
  }, 0);
  const account = num(io.marginSummary?.accountValue) ?? 0;
  const free = Math.max(
    num(io.withdrawable) ?? 0,
    num(io.crossMarginSummary?.accountValue) ?? 0,
  );
  const spotUsdc =
    num((spot.balances ?? []).find((row) => row.coin === "USDC")?.total) ?? 0;
  const equity = Math.max(account, isolated + free, spotUsdc);
  return equity > 0 ? equity : null;
}

function pickOai(state: HlClearinghouse, equityUsd: number | null): DexLeg | null {
  const raw =
    (state.assetPositions ?? [])
      .map((row) => row.position)
      .find((p) => p?.coin === OAI_COIN) ?? null;
  if (!raw && equityUsd == null) return null;
  const size = num(raw?.szi) ?? 0;
  return {
    dex: "io",
    coin: OAI_COIN,
    size,
    side: sideFromSize(size),
    entryPrice: num(raw?.entryPx),
    unrealizedPnl: num(raw?.unrealizedPnl) ?? 0,
    equityUsd,
  };
}

function pickSoftbank(
  payload: QfexPositionsResponse,
  equityUsd: number | null,
): DexLeg | null {
  const raw = (payload.positions ?? []).find((p) => p.symbol === SB_SYMBOL) ?? null;
  if (!raw && equityUsd == null) return null;
  const size = num(raw?.position) ?? 0;
  return {
    dex: "qfex",
    coin: SB_SYMBOL,
    size,
    side: sideFromSize(size),
    entryPrice: num(raw?.average_price),
    unrealizedPnl: num(raw?.unrealised_pnl) ?? 0,
    equityUsd,
  };
}

export async function fetchOaiSoftbankPositions(): Promise<OaiSbPositionsPayload> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const [oaiState, spot, qfexPos] = await Promise.all([
    postInfo<HlClearinghouse>({
      type: "clearinghouseState",
      user: wallet,
      dex: OAI_DEX,
    }),
    postInfo<HlSpotState>({
      type: "spotClearinghouseState",
      user: wallet,
    }),
    qfexAuthedGet<QfexPositionsResponse>("/user/positions"),
  ]);

  const oaiEquity = hlEquity(oaiState, spot);
  const sbEquity = qfexEquity(qfexPos.balance);

  return {
    fetchedAt: Date.now(),
    oai: pickOai(oaiState, oaiEquity),
    softbank: pickSoftbank(qfexPos, sbEquity),
  };
}
