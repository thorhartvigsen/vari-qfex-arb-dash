import {
  HL_INFO,
  IO_DEX,
  resolveEntropy,
  type EntropyPositionsPayload,
  type VenueLeg,
} from "@/lib/entropy";
import { qfexAuthedGet } from "@/lib/qfexAuth";
import type { Side } from "@/lib/types";

interface QfexPositionsResponse {
  positions?: Array<{
    symbol?: string;
    position?: number;
    average_price?: number;
    unrealised_pnl?: number;
  }>;
}

interface HlClearinghouse {
  assetPositions?: Array<{
    position?: {
      coin?: string;
      szi?: string;
      entryPx?: string;
      unrealizedPnl?: string;
    };
  }>;
}

function sideFromSize(size: number): Side | "flat" {
  if (size > 0) return "long";
  if (size < 0) return "short";
  return "flat";
}

async function fetchHlJson<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid error (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchEntropyPositions(
  marketId: string | null | undefined,
): Promise<EntropyPositionsPayload> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const pair = resolveEntropy(marketId);
  const [qfexPos, hlState] = await Promise.all([
    qfexAuthedGet<QfexPositionsResponse>("/user/positions"),
    fetchHlJson<HlClearinghouse>({
      type: "clearinghouseState",
      user: wallet,
      dex: IO_DEX,
    }),
  ]);

  const qfexRaw =
    (qfexPos.positions ?? []).find((p) => p.symbol === pair.qfexSymbol) ?? null;
  const qfexSize = Number(qfexRaw?.position ?? 0);
  const qfex: VenueLeg | null = qfexRaw
    ? {
        venue: "qfex",
        symbol: pair.qfexSymbol,
        size: qfexSize,
        side: sideFromSize(qfexSize),
        entryPrice: Number(qfexRaw.average_price) || null,
        unrealizedPnl: Number(qfexRaw.unrealised_pnl) || 0,
      }
    : null;

  const hlRaw =
    (hlState.assetPositions ?? [])
      .map((row) => row.position)
      .find((p) => p?.coin === pair.hlCoin) ?? null;
  const hlSize = Number(hlRaw?.szi ?? 0);
  const hyperliquid: VenueLeg | null = hlRaw
    ? {
        venue: "hyperliquid",
        symbol: pair.hlCoin,
        size: hlSize,
        side: sideFromSize(hlSize),
        entryPrice: Number(hlRaw.entryPx) || null,
        unrealizedPnl: Number(hlRaw.unrealizedPnl) || 0,
      }
    : null;

  return {
    fetchedAt: Date.now(),
    market: pair.id,
    qfex,
    hyperliquid,
  };
}
