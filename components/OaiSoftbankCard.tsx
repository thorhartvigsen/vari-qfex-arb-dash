"use client";

import { useMemo } from "react";
import { QuoteColumn, tone } from "@/components/arbUi";
import { formatPp, formatPrice, formatSigned } from "@/lib/format";
import {
  CONVERGE_PP,
  LOWER_PP,
  OAI_COIN,
  OAI_DECIMALS,
  SB_COIN,
  SB_DECIMALS,
  UPPER_PP,
  adviceFor,
  bookMid,
  flattenPnlPp,
  hedgeKind,
  listingSpreadPp,
  longOaiBookSpread,
  shortOaiBookSpread,
  signalFromSpread,
  type DexLeg,
} from "@/lib/oaiSoftbank";
import type { Bbo } from "@/lib/types";

interface OaiSoftbankCardProps {
  oaiBook: Bbo | undefined;
  sbBook: Bbo | undefined;
  oaiLeg: DexLeg | null;
  sbLeg: DexLeg | null;
  oaiBase: number;
  sbBase: number;
}

function formatSize(size: number | null | undefined): string {
  if (size === null || size === undefined || !Number.isFinite(size)) return "—";
  const sign = size > 0 ? "+" : "";
  return `${sign}${size.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

function LegSummary({
  label,
  accent,
  coin,
  decimals,
  leg,
}: {
  label: string;
  accent: string;
  coin: string;
  decimals: number;
  leg: DexLeg | null;
}) {
  const side = leg?.side ?? "flat";
  const size = leg?.size ?? 0;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium" style={{ color: accent }}>
        {label}
      </p>
      <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.75 }}>
        {coin}
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

function PpMetric({
  label,
  caption,
  value,
  color,
}: {
  label: string;
  caption: string;
  value: number | null;
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
        {formatPp(value, 1)}
      </p>
      <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
        {caption}
      </p>
    </div>
  );
}

function BookRow({
  label,
  caption,
  value,
  active,
}: {
  label: string;
  caption: string;
  value: number | null;
  active: boolean;
}) {
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
        {formatPp(value, 1)}
      </p>
      <p className="text-xs" style={{ opacity: 0.7 }}>
        {caption}
      </p>
    </div>
  );
}

export default function OaiSoftbankCard({
  oaiBook,
  sbBook,
  oaiLeg,
  sbLeg,
  oaiBase,
  sbBase,
}: OaiSoftbankCardProps) {
  const oaiMid = bookMid(oaiBook?.bid, oaiBook?.ask);
  const sbMid = bookMid(sbBook?.bid, sbBook?.ask);
  const liveMid = listingSpreadPp(oaiMid, sbMid, oaiBase, sbBase);
  const shortBook = shortOaiBookSpread(oaiBook?.bid, sbBook?.ask, oaiBase, sbBase);
  const longBook = longOaiBookSpread(oaiBook?.ask, sbBook?.bid, oaiBase, sbBase);

  const kind = hedgeKind(oaiLeg, sbLeg);
  const signal = signalFromSpread(liveMid);
  const bothOpen = kind !== "flat";

  const entrySpread = useMemo(
    () => listingSpreadPp(oaiLeg?.entryPrice, sbLeg?.entryPrice, oaiBase, sbBase),
    [oaiLeg?.entryPrice, sbLeg?.entryPrice, oaiBase, sbBase],
  );

  const exitSpread =
    kind === "short_oai" ? longBook : kind === "long_oai" ? shortBook : liveMid;
  const addSpread =
    kind === "short_oai" ? shortBook : kind === "long_oai" ? longBook : null;
  const pnlPp = bothOpen ? flattenPnlPp(kind, entrySpread, exitSpread) : null;

  const vsMid = liveMid == null ? null : liveMid - CONVERGE_PP;
  const advice = adviceFor({ live: liveMid, kind, signal });

  const exitCaption =
    kind === "short_oai"
      ? "Buy OAI ask, sell SoftBank bid"
      : kind === "long_oai"
        ? "Sell OAI bid, buy SoftBank ask"
        : "Mid vs listing bases";

  const addCaption =
    kind === "short_oai"
      ? "Sell more OAI bid, buy more SoftBank ask"
      : kind === "long_oai"
        ? "Buy more OAI ask, sell more SoftBank bid"
        : "No hedge open";

  return (
    <section
      className="flex flex-col gap-5 rounded-lg p-4 sm:p-5"
      style={{
        backgroundColor: "var(--arb-panel)",
        border: "1px solid var(--arb-border)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--arb-light)" }}>
            Entropy OAI × TradeXYZ SoftBank
          </h2>
          <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
            Listing-relative spread vs +{CONVERGE_PP} pp mid · enter at {LOWER_PP} / +{UPPER_PP}
          </p>
        </div>
        <div className="text-right">
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--arb-light)" }}
          >
            Live mid
          </p>
          <p
            className="font-mono text-2xl font-medium leading-none"
            style={{ color: tone(vsMid) }}
          >
            {formatPp(liveMid, 1)}
          </p>
          <p className="font-mono text-xs" style={{ opacity: 0.8 }}>
            {vsMid == null
              ? "vs +8 pp mid"
              : `${formatPp(vsMid, 1)} vs +${CONVERGE_PP} pp mid`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <QuoteColumn
          title="Entropy OAI"
          subtitle={OAI_COIN}
          book={oaiBook}
          decimals={OAI_DECIMALS}
          accent="var(--arb-xyz)"
          showAge
        />
        <div
          className="hidden w-px sm:block"
          style={{ backgroundColor: "var(--arb-border)" }}
        />
        <QuoteColumn
          title="TradeXYZ SoftBank"
          subtitle={SB_COIN}
          book={sbBook}
          decimals={SB_DECIMALS}
          accent="var(--arb-qfex)"
          showAge
        />
      </div>

      <div
        className="grid gap-2 rounded-md px-3 py-3 sm:grid-cols-2"
        style={{
          backgroundColor: "var(--arb-panel-soft)",
          border: "1px solid var(--arb-border)",
        }}
      >
        <BookRow
          label="Short OAI / long SoftBank"
          caption="Sell OAI bid, buy SoftBank ask"
          value={shortBook}
          active={bothOpen && kind === "short_oai"}
        />
        <BookRow
          label="Long OAI / short SoftBank"
          caption="Buy OAI ask, sell SoftBank bid"
          value={longBook}
          active={bothOpen && kind === "long_oai"}
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
            label="Entropy"
            accent="var(--arb-xyz)"
            coin={OAI_COIN}
            decimals={OAI_DECIMALS}
            leg={oaiLeg}
          />
          <LegSummary
            label="TradeXYZ"
            accent="var(--arb-qfex)"
            coin={SB_COIN}
            decimals={SB_DECIMALS}
            leg={sbLeg}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <PpMetric
          label="Your entry"
          caption="Listing-relative spread at venue fills"
          value={bothOpen ? entrySpread : null}
          color={tone(bothOpen ? entrySpread : null)}
        />
        <PpMetric
          label="Exit now"
          caption={exitCaption}
          value={bothOpen ? exitSpread : liveMid}
          color={
            bothOpen && entrySpread != null && exitSpread != null
              ? tone(entrySpread - exitSpread)
              : tone(liveMid)
          }
        />
        <PpMetric
          label="Add size"
          caption={addCaption}
          value={bothOpen ? addSpread : null}
          color={tone(bothOpen ? addSpread : null)}
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
            Flatten P&amp;L
          </p>
          <p className="font-mono text-lg" style={{ color: tone(pnlPp) }}>
            {formatPp(pnlPp, 1)}
          </p>
          <p className="text-xs" style={{ opacity: 0.8 }}>
            Percent-neutral pair vs locked entry
          </p>
        </div>
        <p className="max-w-xl text-sm" style={{ color: "var(--arb-text)" }}>
          {advice}
        </p>
      </div>
    </section>
  );
}
