import type { Bbo, Side } from "@/lib/types";
import { parsePrice, pointsToBps } from "@/lib/format";

export interface HedgeSpreads {
  hedged: boolean;
  varShort: boolean;
  entry: number | null;
  exit: number | null;
  add: number | null;
  pnl: number | null;
  entryBps: number | null;
  exitBps: number | null;
  addBps: number | null;
  pnlBps: number | null;
  mid: number | null;
  shortVarLongQfex: number | null;
  longVarShortQfex: number | null;
}

function midOf(a: number | null, b: number | null): number | null {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  const mid = (a + b) / 2;
  return mid > 0 ? mid : null;
}

function venueMid(book: Bbo | undefined): number | null {
  if (!book) return null;
  if (book.bid !== null && book.ask !== null) return midOf(book.bid, book.ask);
  if (book.mark !== null && book.mark !== undefined && Number.isFinite(book.mark)) {
    return book.mark;
  }
  return book.bid ?? book.ask ?? null;
}

/**
 * Position-aware sold−bought spreads.
 *
 * Short Variational / long QFEX (typical):
 *   entry = var fill − qfex fill
 *   exit  = var ask − qfex bid   (buy back VAR, sell QFEX)
 *   add   = var bid − qfex ask   (sell more VAR, buy more QFEX)
 *
 * Opposite sides swap the legs. P&L if you flatten now = entry − exit.
 */
export function computeHedgeSpreads(opts: {
  varBook: Bbo | undefined;
  qfexBook: Bbo | undefined;
  varSide: Side;
  qfexSide: Side;
  varEntryRaw: string;
  qfexEntryRaw: string;
}): HedgeSpreads {
  const { varBook, qfexBook, varSide, qfexSide, varEntryRaw, qfexEntryRaw } =
    opts;
  const hedged = varSide !== qfexSide;
  const varShort = varSide === "short";

  const varBid = varBook?.bid ?? null;
  const varAsk = varBook?.ask ?? null;
  const qfexBid = qfexBook?.bid ?? null;
  const qfexAsk = qfexBook?.ask ?? null;

  const shortVarLongQfex =
    varBid !== null && qfexAsk !== null ? varBid - qfexAsk : null;
  const longVarShortQfex =
    qfexBid !== null && varAsk !== null ? qfexBid - varAsk : null;

  const liveMid = midOf(venueMid(varBook), venueMid(qfexBook));

  if (!hedged) {
    return {
      hedged: false,
      varShort,
      entry: null,
      exit: null,
      add: null,
      pnl: null,
      entryBps: null,
      exitBps: null,
      addBps: null,
      pnlBps: null,
      mid: liveMid,
      shortVarLongQfex,
      longVarShortQfex,
    };
  }

  const varEntry = parsePrice(varEntryRaw);
  const qfexEntry = parsePrice(qfexEntryRaw);

  const entry =
    varEntry !== null && qfexEntry !== null
      ? varShort
        ? varEntry - qfexEntry
        : qfexEntry - varEntry
      : null;

  const exit = varShort
    ? varAsk !== null && qfexBid !== null
      ? varAsk - qfexBid
      : null
    : qfexAsk !== null && varBid !== null
      ? qfexAsk - varBid
      : null;

  const add = varShort
    ? varBid !== null && qfexAsk !== null
      ? varBid - qfexAsk
      : null
    : qfexBid !== null && varAsk !== null
      ? qfexBid - varAsk
      : null;

  const pnl = entry !== null && exit !== null ? entry - exit : null;
  const entryMid =
    varEntry !== null && qfexEntry !== null
      ? midOf(varEntry, qfexEntry)
      : liveMid;

  return {
    hedged: true,
    varShort,
    entry,
    exit,
    add,
    pnl,
    entryBps: pointsToBps(entry, entryMid),
    exitBps: pointsToBps(exit, liveMid),
    addBps: pointsToBps(add, liveMid),
    pnlBps: pointsToBps(pnl, entryMid ?? liveMid),
    mid: liveMid,
    shortVarLongQfex,
    longVarShortQfex,
  };
}

export function hedgeAdvice(spreads: HedgeSpreads): string {
  if (!spreads.hedged) {
    return "Pick opposite sides (one long, one short) to price an arb.";
  }
  if (spreads.entry === null) {
    return "Fill in both entries to lock your spread vs live exit and add.";
  }
  const parts: string[] = [];
  if (spreads.pnl !== null) {
    if (spreads.pnl > 0.01) {
      parts.push("Flattening now would lock a profit — basis has compressed.");
    } else if (spreads.pnl < -0.01) {
      parts.push("Flattening now is worse than entry — basis has widened against you.");
    } else {
      parts.push("Exit is roughly in line with your entry.");
    }
  }
  if (spreads.add !== null && spreads.entry !== null) {
    if (spreads.add >= spreads.entry - 1e-9) {
      parts.push("Adding size is at least as good as your original fill.");
    } else if (spreads.add > 0) {
      parts.push("Adding is still a positive sold−bought spread, but tighter than entry.");
    } else {
      parts.push("Adding now crosses the book — not attractive.");
    }
  }
  return parts.join(" ");
}
