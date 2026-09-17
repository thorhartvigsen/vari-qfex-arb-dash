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

async function clearinghouse(user: string, dex: string): Promise<HlClearinghouse> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "clearinghouseState", user, dex }),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid ${dex} positions failed (${response.status})`);
  }
  return (await response.json()) as HlClearinghouse;
}

function pickOai(state: HlClearinghouse): DexLeg | null {
  const raw =
    (state.assetPositions ?? [])
      .map((row) => row.position)
      .find((p) => p?.coin === OAI_COIN) ?? null;
  if (!raw) return null;
  const size = Number(raw.szi ?? 0);
  return {
    dex: "io",
    coin: OAI_COIN,
    size,
    side: sideFromSize(size),
    entryPrice: Number(raw.entryPx) || null,
    unrealizedPnl: Number(raw.unrealizedPnl) || 0,
  };
}

function pickSoftbank(payload: QfexPositionsResponse): DexLeg | null {
  const raw = (payload.positions ?? []).find((p) => p.symbol === SB_SYMBOL) ?? null;
  if (!raw) return null;
  const size = Number(raw.position ?? 0);
  return {
    dex: "qfex",
    coin: SB_SYMBOL,
    size,
    side: sideFromSize(size),
    entryPrice: Number(raw.average_price) || null,
    unrealizedPnl: Number(raw.unrealised_pnl) || 0,
  };
}

export async function fetchOaiSoftbankPositions(): Promise<OaiSbPositionsPayload> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const [oaiState, qfexPos] = await Promise.all([
    clearinghouse(wallet, OAI_DEX),
    qfexAuthedGet<QfexPositionsResponse>("/user/positions"),
  ]);

  return {
    fetchedAt: Date.now(),
    oai: pickOai(oaiState),
    softbank: pickSoftbank(qfexPos),
  };
}
