"use client";

import { formatAge, formatPrice, formatSigned, formatSpreadBps } from "@/lib/format";
import type { Bbo } from "@/lib/types";

export function tone(value: number | null | undefined, invert = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "var(--arb-text)";
  }
  const signed = invert ? -value : value;
  if (signed > 0) return "var(--arb-positive)";
  if (signed < 0) return "var(--arb-negative)";
  return "var(--arb-text)";
}

export function Metric({
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

export function QuoteColumn({
  title,
  subtitle,
  book,
  decimals,
  accent,
  showAge = false,
}: {
  title: string;
  subtitle: string;
  book: Bbo | undefined;
  decimals: number;
  accent: string;
  showAge?: boolean;
}) {
  const bid = book?.bid ?? null;
  const ask = book?.ask ?? null;
  const mid =
    bid !== null && ask !== null ? (bid + ask) / 2 : (book?.mark ?? null);
  const spread =
    bid !== null && ask !== null && mid && mid > 0
      ? ((ask - bid) / mid) * 10_000
      : null;
  const ageLabel =
    showAge && book?.updatedAt ? formatAge(book.updatedAt) : null;

  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div>
        <p className="text-sm font-medium" style={{ color: accent }}>
          {title}
        </p>
        <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.75 }}>
          {ageLabel ? `${subtitle} · ${ageLabel}` : subtitle}
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

export function LiveRow({
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
