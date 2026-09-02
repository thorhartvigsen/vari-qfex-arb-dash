"use client";

import { useMemo } from "react";
import ToggleGroup from "@/components/ToggleGroup";
import {
  formatPrice,
  formatSigned,
  formatSpreadBps,
} from "@/lib/format";
import { computeHedgeSpreads, hedgeAdvice } from "@/lib/spread";
import type { Bbo, PairConfig, PairPosition, Side } from "@/lib/types";

const SIDE_OPTIONS = ["long", "short"] as const;
const SIDE_LABELS: Record<Side, string> = {
  long: "Long",
  short: "Short",
};

interface PairCardProps {
  pair: PairConfig;
  varBook: Bbo | undefined;
  qfexBook: Bbo | undefined;
  position: PairPosition;
  onChange: (patch: Partial<PairPosition>) => void;
  onClear: () => void;
}

function tone(value: number | null | undefined, invert = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "var(--arb-text)";
  }
  const signed = invert ? -value : value;
  if (signed > 0) return "var(--arb-positive)";
  if (signed < 0) return "var(--arb-negative)";
  return "var(--arb-text)";
}

function Metric({
  label,
  caption,
  value,
  bps,
  decimals,
  color,
}: {
  label: string;
  caption: string;
  value: number | null;
  bps: number | null;
  decimals: number;
  color: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col gap-1 rounded-md px-3 py-3"
      style={{
        backgroundColor: "var(--arb-panel-soft)",
        border: "1px solid var(--arb-border)",
      }}
    >
      <p
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--arb-light)" }}
      >
        {label}
      </p>
      <p className="font-mono text-2xl font-medium leading-none" style={{ color }}>
        {formatSigned(value, decimals)}
      </p>
      <p className="font-mono text-sm" style={{ color }}>
        {formatSpreadBps(bps)}
      </p>
      <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
        {caption}
      </p>
    </div>
  );
}

function QuoteColumn({
  title,
  subtitle,
  book,
  decimals,
  accent,
}: {
  title: string;
  subtitle: string;
  book: Bbo | undefined;
  decimals: number;
  accent: string;
}) {
  const bid = book?.bid ?? null;
  const ask = book?.ask ?? null;
  const mid =
    bid !== null && ask !== null ? (bid + ask) / 2 : (book?.mark ?? null);
  const spread =
    bid !== null && ask !== null && mid && mid > 0
      ? ((ask - bid) / mid) * 10_000
      : null;

  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div>
        <p className="text-sm font-medium" style={{ color: accent }}>
          {title}
        </p>
        <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.75 }}>
          {subtitle}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide" style={{ opacity: 0.7 }}>
            Bid
          </p>
          <p
            className="font-mono text-sm tabular-nums leading-tight sm:text-base"
            style={{ color: "var(--arb-xyz)" }}
          >
            {formatPrice(bid, decimals)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide" style={{ opacity: 0.7 }}>
            Ask
          </p>
          <p
            className="font-mono text-sm tabular-nums leading-tight sm:text-base"
            style={{ color: "var(--arb-qfex)" }}
          >
            {formatPrice(ask, decimals)}
          </p>
        </div>
      </div>
      <p className="font-mono text-xs" style={{ opacity: 0.8 }}>
        Mid {formatPrice(mid, decimals)}
        {spread !== null ? `  ·  ${spread.toFixed(2)} bps wide` : ""}
      </p>
    </div>
  );
}

export default function PairCard({
  pair,
  varBook,
  qfexBook,
  position,
  onChange,
  onClear,
}: PairCardProps) {
  const spreads = useMemo(
    () =>
      computeHedgeSpreads({
        varBook,
        qfexBook,
        varSide: position.varSide,
        qfexSide: position.qfexSide,
        varEntryRaw: position.varEntry,
        qfexEntryRaw: position.qfexEntry,
      }),
    [varBook, qfexBook, position],
  );

  const advice = hedgeAdvice(spreads);
  const exitColor =
    spreads.entry !== null && spreads.exit !== null
      ? tone(spreads.entry - spreads.exit)
      : tone(spreads.exit);

  return (
    <section
      className="flex flex-col gap-5 rounded-lg p-4 sm:p-5"
      style={{
        backgroundColor: "var(--arb-panel)",
        border: "1px solid var(--arb-border)",
      }}
    >
      <div>
        <h2
          className="text-xl font-semibold"
          style={{ color: "var(--arb-light)" }}
        >
          {pair.label}
        </h2>
        <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
          {pair.title}
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <QuoteColumn
          title={pair.varName}
          subtitle={pair.varTicker}
          book={varBook}
          decimals={pair.priceDecimals}
          accent="var(--arb-xyz)"
        />
        <div
          className="hidden w-px sm:block"
          style={{ backgroundColor: "var(--arb-border)" }}
        />
        <QuoteColumn
          title={pair.qfexLabel}
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
          label="Short VAR / long QFEX"
          caption="Sell VAR bid, buy QFEX ask"
          value={spreads.shortVarLongQfex}
          mid={spreads.mid}
          decimals={pair.priceDecimals}
          active={spreads.hedged && spreads.varShort}
        />
        <LiveRow
          label="Long VAR / short QFEX"
          caption="Buy VAR ask, sell QFEX bid"
          value={spreads.longVarShortQfex}
          mid={spreads.mid}
          decimals={pair.priceDecimals}
          active={spreads.hedged && !spreads.varShort}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3
            className="text-sm font-medium uppercase tracking-wide"
            style={{ color: "var(--arb-light)" }}
          >
            Your position
          </h3>
          <button
            type="button"
            onClick={onClear}
            className="rounded px-2 py-1 text-xs"
            style={{
              border: "1px solid var(--arb-border)",
              color: "var(--arb-text)",
            }}
          >
            Clear
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PositionLeg
            label="Variational"
            side={position.varSide}
            entry={position.varEntry}
            onSide={(varSide) => onChange({ varSide })}
            onEntry={(varEntry) => onChange({ varEntry })}
          />
          <PositionLeg
            label="QFEX"
            side={position.qfexSide}
            entry={position.qfexEntry}
            onSide={(qfexSide) => onChange({ qfexSide })}
            onEntry={(qfexEntry) => onChange({ qfexEntry })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Metric
          label="Your entry"
          caption="Sold − bought at your fills"
          value={spreads.entry}
          bps={spreads.entryBps}
          decimals={pair.priceDecimals}
          color={tone(spreads.entry)}
        />
        <Metric
          label="Exit now"
          caption={
            spreads.varShort
              ? "Buy VAR ask, sell QFEX bid"
              : "Sell VAR bid, buy QFEX ask"
          }
          value={spreads.exit}
          bps={spreads.exitBps}
          decimals={pair.priceDecimals}
          color={exitColor}
        />
        <Metric
          label="Add size"
          caption={
            spreads.varShort
              ? "Sell more VAR bid, buy more QFEX ask"
              : "Buy more VAR ask, sell more QFEX bid"
          }
          value={spreads.add}
          bps={spreads.addBps}
          decimals={pair.priceDecimals}
          color={tone(spreads.add)}
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
            style={{ color: tone(spreads.pnl) }}
          >
            {formatSigned(spreads.pnl, pair.priceDecimals)}
            {spreads.pnlBps !== null ? `  ·  ${formatSpreadBps(spreads.pnlBps)}` : ""}
          </p>
        </div>
        <p className="max-w-xl text-sm" style={{ color: "var(--arb-text)" }}>
          {advice}
        </p>
      </div>
    </section>
  );
}

function LiveRow({
  label,
  caption,
  value,
  mid,
  decimals,
  active,
}: {
  label: string;
  caption: string;
  value: number | null;
  mid: number | null;
  decimals: number;
  active: boolean;
}) {
  const bps =
    value !== null && mid !== null && mid > 0 ? (value / mid) * 10_000 : null;
  return (
    <div
      className="rounded px-2 py-1"
      style={{
        outline: active ? "1px solid var(--arb-light)" : "none",
        outlineOffset: 2,
      }}
    >
      <p className="text-xs" style={{ opacity: 0.75 }}>
        {label}
      </p>
      <p className="font-mono text-base" style={{ color: tone(value) }}>
        {formatSigned(value, decimals)}
        {bps !== null ? `  ·  ${formatSpreadBps(bps)}` : ""}
      </p>
      <p className="text-xs" style={{ opacity: 0.7 }}>
        {caption}
      </p>
    </div>
  );
}

function PositionLeg({
  label,
  side,
  entry,
  onSide,
  onEntry,
}: {
  label: string;
  side: Side;
  entry: string;
  onSide: (side: Side) => void;
  onEntry: (entry: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" style={{ color: "var(--arb-light)" }}>
        {label}
      </p>
      <ToggleGroup
        options={SIDE_OPTIONS}
        labels={SIDE_LABELS}
        value={side}
        onChange={onSide}
      />
      <label className="block space-y-1">
        <span className="text-xs" style={{ opacity: 0.75 }}>
          Entry price
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={entry}
          onChange={(e) => onEntry(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-md px-3 py-2 text-sm outline-none"
          style={{
            border: "1px solid var(--arb-border)",
            backgroundColor: "var(--arb-panel-soft)",
            color: "var(--arb-light)",
          }}
        />
      </label>
    </div>
  );
}
