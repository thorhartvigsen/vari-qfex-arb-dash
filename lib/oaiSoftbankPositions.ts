import { HL_INFO } from "@/lib/entropy";
import {
  OAI_COIN,
  OAI_DEX,
  SB_COIN,
  SB_DEX,
  type DexLeg,
  type OaiSbPositionsPayload,
} from "@/lib/oaiSoftbank";
import type { Side } from "@/lib/types";

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "clearinghouseState", user, dex }),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid ${dex} positions failed (${response.status})`);
  }
  return (await response.json()) as HlClearinghouse;
}

function pickLeg(
  state: HlClearinghouse,
  coin: string,
  dex: "io" | "xyz",
): DexLeg | null {
  const raw =
    (state.assetPositions ?? [])
      .map((row) => row.position)
      .find((p) => p?.coin === coin) ?? null;
  if (!raw) return null;
  const size = Number(raw.szi ?? 0);
  return {
    dex,
    coin,
    size,
    side: sideFromSize(size),
    entryPrice: Number(raw.entryPx) || null,
    unrealizedPnl: Number(raw.unrealizedPnl) || 0,
  };
}

export async function fetchOaiSoftbankPositions(): Promise<OaiSbPositionsPayload> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const [oaiState, sbState] = await Promise.all([
    clearinghouse(wallet, OAI_DEX),
    clearinghouse(wallet, SB_DEX),
  ]);

  return {
    fetchedAt: Date.now(),
    oai: pickLeg(oaiState, OAI_COIN, "io"),
    softbank: pickLeg(sbState, SB_COIN, "xyz"),
  };
}
