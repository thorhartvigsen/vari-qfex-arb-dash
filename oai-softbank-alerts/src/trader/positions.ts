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
    totalRawUsd?: string;
    totalMarginUsed?: string;
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
      leverage?: {
        type?: string;
        value?: number;
        rawUsd?: string;
      };
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

function posNum(pos: HlClearinghouse["assetPositions"], coin: string): {
  raw: NonNullable<NonNullable<HlClearinghouse["assetPositions"]>[number]["position"]> | null;
  isolatedUsd: number;
} {
  const raw =
    (pos ?? [])
      .map((row) => row.position)
      .find((p) => p?.coin === coin) ?? null;
  if (!raw) return { raw: null, isolatedUsd: 0 };
  const isolatedUsd =
    raw.leverage?.type === "isolated" ? Math.max(0, num(raw.marginUsed) ?? 0) : 0;
  return { raw, isolatedUsd };
}

/**
 * Isolated OAI locks collateral inside the position; withdrawable is the rest.
 * `marginSummary.accountValue` should already be isolated + free + uPnL.
 * Never take max(withdrawable, spot) alone — that drops isolated margin.
 */
function hlOaiEquity(
  io: HlClearinghouse,
  spot: HlSpotState,
  isolatedUsd: number,
): { equity: number; isolatedUsd: number; freeUsd: number } {
  const account = num(io.marginSummary?.accountValue) ?? 0;
  const freeUsd = Math.max(
    num(io.withdrawable) ?? 0,
    num(io.crossMarginSummary?.accountValue) ?? 0,
  );
  const spotUsdc =
    num((spot.balances ?? []).find((row) => row.coin === "USDC")?.total) ?? 0;
  const perp = Math.max(account, isolatedUsd + freeUsd);
  return {
    equity: Math.max(perp, spotUsdc),
    isolatedUsd,
    freeUsd,
  };
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
  oaiIsolatedUsd: number;
  oaiFreeUsd: number;
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

  const oai = posNum(ioState.assetPositions, OAI_COIN);
  const sbRaw =
    (qfexPos.positions ?? []).find((p) => p.symbol === SB_SYMBOL) ?? null;

  const hl = hlOaiEquity(ioState, spot, oai.isolatedUsd);
  const sbEquity = qfexEquity(qfexPos.balance) ?? 0;

  return {
    oai: {
      size: num(oai.raw?.szi) ?? 0,
      entry: num(oai.raw?.entryPx),
      uPnl: num(oai.raw?.unrealizedPnl),
    },
    softbank: {
      size: num(sbRaw?.position) ?? 0,
      entry: num(sbRaw?.average_price),
      uPnl: num(sbRaw?.unrealised_pnl),
    },
    oaiEquity: hl.equity,
    oaiIsolatedUsd: hl.isolatedUsd,
    oaiFreeUsd: hl.freeUsd,
    sbEquity,
    combinedEquity: hl.equity + sbEquity,
  };
}
