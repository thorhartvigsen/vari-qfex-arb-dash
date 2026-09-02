"use client";

import { useMemo } from "react";
import { LiveRow, Metric, QuoteColumn, tone } from "@/components/arbUi";
import {
  formatPrice,
  formatSigned,
  formatSpreadBps,
} from "@/lib/format";
import type { EntropyPair, VenueLeg } from "@/lib/entropy";
import { computeHedgeSpreads, hedgeAdvice } from "@/lib/spread";
import type { Bbo, Side } from "@/lib/types";

interface EntropyCardProps {
  pair: EntropyPair;
  hlBook: Bbo | undefined;
  qfexBook: Bbo | undefined;
  hlLeg: VenueLeg | null;
  qfexLeg: VenueLeg | null;
}

function sideFromLeg(leg: VenueLeg | null): Side {
  if (leg?.side === "short") return "short";
  return "long";
}

function entryRaw(leg: VenueLeg | null): string {
  return leg?.entryPrice != null && Number.isFinite(leg.entryPrice)
    ? String(leg.entryPrice)
    : "";
}

function formatSize(size: number | null | undefined): string {
  if (size === null || size === undefined || !Number.isFinite(size)) return "—";
  const sign = size > 0 ? "+" : "";
  return `${sign}${size.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

function LegSummary({
  label,
  accent,
  leg,
  decimals,
}: {
  label: string;
  accent: string;
  leg: VenueLeg | null;
  decimals: number;
}) {
  const side = leg?.side ?? "flat";
  const size = leg?.size ?? 0;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium" style={{ color: accent }}>
        {label}
      </p>
      <p className="font-mono text-lg" style={{ color: "var(--arb-light)" }}>
        {side === "flat" ? "Flat" : side === "long" ? "Long" : "Short"}
        {side !== "flat" ? `  ·  ${formatSize(Math.abs(size))}` : ""}
      </p>
      <p className="font-mono text-sm" style={{ opacity: 0.85 }}>
        Entry {formatPrice(leg?.entryPrice ?? null, decimals)}
      </p>
      {leg?.unrealizedPnl != null ? (
        <p className="font-mono text-xs" style={{ color: tone(leg.unrealizedPnl) }}>
          uPnL {formatSigned(leg.unrealizedPnl, 2)}
        </p>
      ) : null}
    </div>
  );
}

export default function EntropyCard({
  pair,
  hlBook,
  qfexBook,
  hlLeg,
  qfexLeg,
}: EntropyCardProps) {
  const hlSide = sideFromLeg(hlLeg);
  const qfexSide = sideFromLeg(qfexLeg);
  const bothOpen =
    (hlLeg?.side === "long" || hlLeg?.side === "short") &&
    (qfexLeg?.side === "long" || qfexLeg?.side === "short");

  const spreads = useMemo(
    () =>
      computeHedgeSpreads({
        varBook: hlBook,
        qfexBook,
        varSide: hlSide,
        qfexSide,
        varEntryRaw: entryRaw(hlLeg),
        qfexEntryRaw: entryRaw(qfexLeg),
      }),
    [hlBook, qfexBook, hlSide, qfexSide, hlLeg, qfexLeg],
  );

  const displaySpreads = bothOpen
    ? spreads
    : { ...spreads, hedged: false, entry: null, pnl: null, entryBps: null, pnlBps: null };

  const advice = bothOpen
    ? hedgeAdvice(spreads)
    : "No open hedge on both venues yet — live books still update.";

  const exitColor =
    displaySpreads.entry !== null && displaySpreads.exit !== null
      ? tone(displaySpreads.entry - displaySpreads.exit)
      : tone(displaySpreads.exit);

  const matched = Math.min(
    Math.abs(hlLeg?.size ?? 0),
    Math.abs(qfexLeg?.size ?? 0),
  );
  const flattenTotal =
    displaySpreads.pnl !== null && matched > 0
      ? displaySpreads.pnl * matched
      : null;

  return (
    <section
      className="flex flex-col gap-5 rounded-lg p-4 sm:p-5"
      style={{
        backgroundColor: "var(--arb-panel)",
        border: "1px solid var(--arb-border)",
      }}
    >
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--arb-light)" }}>
          {pair.label}
        </h2>
        <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
          {pair.title}
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <QuoteColumn
          title="Hyperliquid Entropy"
          subtitle={pair.hlCoin}
          book={hlBook}
          decimals={pair.priceDecimals}
          accent="var(--arb-xyz)"
        />
        <div
          className="hidden w-px sm:block"
          style={{ backgroundColor: "var(--arb-border)" }}
        />
        <QuoteColumn
          title="QFEX"
          subtitle={pair.qfexSymbol}
          book={qfexBook}
          decimals={pair.priceDecimals}
          accent="var(--arb-qfex)"
        />
      </div>

      <div
        className="grid gap-2 rounded-md px-3 py-3 sm:grid-cols-2"
        style={{
          backgroundColor: "var(--arb-panel-soft)",
          border: "1px solid var(--arb-border)",
        }}
      >
        <LiveRow
          label="Short HL / long QFEX"
          caption="Sell HL bid, buy QFEX ask"
          value={spreads.shortVarLongQfex}
          mid={spreads.mid}
          decimals={pair.priceDecimals}
          active={bothOpen && spreads.varShort}
        />
        <LiveRow
          label="Long HL / short QFEX"
          caption="Buy HL ask, sell QFEX bid"
          value={spreads.longVarShortQfex}
          mid={spreads.mid}
          decimals={pair.priceDecimals}
          active={bothOpen && !spreads.varShort}
        />
      </div>

      <div className="space-y-3">
        <h3
          className="text-sm font-medium uppercase tracking-wide"
          style={{ color: "var(--arb-light)" }}
        >
          Your position
        </h3>
        <div
          className="grid gap-4 rounded-md px-3 py-3 sm:grid-cols-2"
          style={{
            backgroundColor: "var(--arb-panel-soft)",
            border: "1px solid var(--arb-border)",
          }}
        >
          <LegSummary
            label="Hyperliquid"
            accent="var(--arb-xyz)"
            leg={hlLeg}
            decimals={pair.priceDecimals}
          />
          <LegSummary
            label="QFEX"
            accent="var(--arb-qfex)"
            leg={qfexLeg}
            decimals={pair.priceDecimals}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Metric
          label="Your entry"
          caption="Sold − bought at venue average fills"
          value={displaySpreads.entry}
          bps={displaySpreads.entryBps}
          decimals={pair.priceDecimals}
          color={tone(displaySpreads.entry)}
        />
        <Metric
          label="Exit now"
          caption={
            spreads.varShort
              ? "Buy HL ask, sell QFEX bid"
              : "Sell HL bid, buy QFEX ask"
          }
          value={displaySpreads.exit}
          bps={displaySpreads.exitBps}
          decimals={pair.priceDecimals}
          color={exitColor}
        />
        <Metric
          label="Add size"
          caption={
            spreads.varShort
              ? "Sell more HL bid, buy more QFEX ask"
              : "Buy more HL ask, sell more QFEX bid"
          }
          value={displaySpreads.add}
          bps={displaySpreads.addBps}
          decimals={pair.priceDecimals}
          color={tone(displaySpreads.add)}
        />
      </div>

      <div
        className="flex flex-wrap items-end justify-between gap-3 rounded-md px-3 py-3"
        style={{
          backgroundColor: "var(--arb-panel-soft)",
          border: "1px solid var(--arb-border)",
        }}
      >
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--arb-light)" }}
          >
            Flatten P&amp;L / unit
          </p>
          <p
            className="font-mono text-lg"
            style={{ color: tone(displaySpreads.pnl) }}
          >
            {formatSigned(displaySpreads.pnl, pair.priceDecimals)}
            {displaySpreads.pnlBps !== null
              ? `  ·  ${formatSpreadBps(displaySpreads.pnlBps)}`
              : ""}
          </p>
          {flattenTotal !== null ? (
            <p className="font-mono text-xs" style={{ opacity: 0.8 }}>
              On {formatSize(matched)} matched: {formatSigned(flattenTotal, 2)}
            </p>
          ) : null}
        </div>
        <p className="max-w-xl text-sm" style={{ color: "var(--arb-text)" }}>
          {advice}
        </p>
      </div>
    </section>
  );
}
