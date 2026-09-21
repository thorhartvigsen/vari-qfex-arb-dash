import {
  HL_INFO,
  OAI_COIN,
  OAI_DEX,
  SB_SYMBOL,
} from "../config.ts";
import { qfexAuthedGet } from "./qfexAuth.ts";

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

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HL ${body.type as string} failed (${response.status}): ${text.slice(0, 160)}`);
  }
  return JSON.parse(text) as T;
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

/** Same collateral sources as the dashboard P&L card. */
function hlOaiEquity(io: HlClearinghouse, spot: HlSpotState): number {
  const ioAv = num(io.marginSummary?.accountValue) ?? 0;
  const ioCross = num(io.crossMarginSummary?.accountValue) ?? 0;
  const ioWd = num(io.withdrawable) ?? 0;
  const spotUsdc =
    num((spot.balances ?? []).find((row) => row.coin === "USDC")?.total) ?? 0;
  return Math.max(ioAv, ioCross, ioWd, spotUsdc);
}

export interface VenuePosition {
  size: number;
  entry: number | null;
  uPnl: number | null;
}

export interface BookPositions {
  oai: VenuePosition;
  softbank: VenuePosition;
  oaiEquity: number;
  sbEquity: number;
  combinedEquity: number;
}

export async function fetchBookPositions(): Promise<BookPositions> {
  const wallet = process.env.HL_WALLET_ADDRESS?.trim();
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");
  const user = wallet.toLowerCase();

  const [ioState, spot, qfexPos] = await Promise.all([
    postInfo<HlClearinghouse>({
      type: "clearinghouseState",
      user,
      dex: OAI_DEX,
    }),
    postInfo<HlSpotState>({
      type: "spotClearinghouseState",
      user,
    }),
    qfexAuthedGet<QfexPositionsResponse>("/user/positions"),
  ]);

  const oaiRaw =
    (ioState.assetPositions ?? [])
      .map((row) => row.position)
      .find((p) => p?.coin === OAI_COIN) ?? null;
  const sbRaw =
    (qfexPos.positions ?? []).find((p) => p.symbol === SB_SYMBOL) ?? null;

  const oaiEquity = hlOaiEquity(ioState, spot);
  const sbEquity = qfexEquity(qfexPos.balance) ?? 0;

  return {
    oai: {
      size: num(oaiRaw?.szi) ?? 0,
      entry: num(oaiRaw?.entryPx),
      uPnl: num(oaiRaw?.unrealizedPnl),
    },
    softbank: {
      size: num(sbRaw?.position) ?? 0,
      entry: num(sbRaw?.average_price),
      uPnl: num(sbRaw?.unrealised_pnl),
    },
    oaiEquity,
    sbEquity,
    combinedEquity: oaiEquity + sbEquity,
  };
}
