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
