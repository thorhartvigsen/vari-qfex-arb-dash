"use client";

import { useMemo } from "react";
import { LiveRow, Metric, QuoteColumn, tone } from "@/components/arbUi";
import ToggleGroup from "@/components/ToggleGroup";
import { formatSigned, formatSpreadBps } from "@/lib/format";
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
          showAge
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
