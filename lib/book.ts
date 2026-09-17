import type { BookLevel } from "@/lib/types";

export function normalizeLevels(
  raw: Array<
    | { price: number | string; size: number | string }
    | [number | string, number | string]
  >,
): BookLevel[] {
  const out: BookLevel[] = [];
  for (const row of raw) {
    if (Array.isArray(row)) {
      const price = Number(row[0]);
      const size = Number(row[1]);
      if (Number.isFinite(price) && Number.isFinite(size) && size > 0) {
        out.push({ price, size });
      }
    } else {
      const price = Number(row.price);
      const size = Number(row.size);
      if (Number.isFinite(price) && Number.isFinite(size) && size > 0) {
        out.push({ price, size });
      }
    }
  }
  return out;
}

export function sortBids(levels: BookLevel[]): BookLevel[] {
  return [...levels].sort((a, b) => b.price - a.price);
}

export function sortAsks(levels: BookLevel[]): BookLevel[] {
  return [...levels].sort((a, b) => a.price - b.price);
}

export function topOfBook(levels: BookLevel[]): number | null {
  const px = levels[0]?.price;
  return Number.isFinite(px) && (px as number) > 0 ? (px as number) : null;
}

export interface WalkResult {
  avgPrice: number;
  filledUsd: number;
  fullyFilled: boolean;
}

/** Walk USD notional through bids (sell) or asks (buy). */
export function walkNotional(
  levels: BookLevel[],
  notionalUsd: number,
): WalkResult | null {
  if (!(notionalUsd > 0) || levels.length === 0) return null;
  let remaining = notionalUsd;
  let qty = 0;
  let spent = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const levelNotional = level.price * level.size;
    if (levelNotional <= 0) continue;
    const take = Math.min(remaining, levelNotional);
    qty += take / level.price;
    spent += take;
    remaining -= take;
  }
  if (qty <= 0 || spent <= 0) return null;
  return {
    avgPrice: spent / qty,
    filledUsd: spent,
    fullyFilled: remaining <= notionalUsd * 1e-9,
  };
}
