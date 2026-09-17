"use client";

import { useMemo, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChartTime, formatSigned } from "@/lib/format";
import type { FundingPoint, OaiSbFundingPayload } from "@/lib/oaiSoftbankFunding";
import { THEME } from "@/lib/types";

interface OaiSoftbankFundingChartProps {
  data: FundingPoint[];
  live?: OaiSbFundingPayload["live"] | null;
  loading?: boolean;
  error?: string | null;
}

function yDomain(data: FundingPoint[]): [number, number] {
  let min = 0;
  let max = 0;
  for (const point of data) {
    for (const value of [point.oaiAnn, point.sbAnn]) {
      if (value == null || !Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.15, 8);
    return [min - pad, max + pad];
  }
  const pad = Math.max((max - min) * 0.08, 4);
  return [min - pad, max + pad];
}

function fmtAnn(value: number | null | undefined): string {
  return formatSigned(value, 1, "%");
}

export default function OaiSoftbankFundingChart({
  data,
  live,
  loading,
  error,
}: OaiSoftbankFundingChartProps) {
  const domain = useMemo(() => yDomain(data), [data]);

  if (loading) {
    return (
      <ChartFrame>
        <p className="text-sm" style={{ color: "var(--arb-text)" }}>
          Loading hourly funding…
        </p>
      </ChartFrame>
    );
  }

  if (error) {
    return (
      <ChartFrame>
        <p className="px-6 text-center text-sm" style={{ color: "#c45c4a" }}>
          {error}
        </p>
      </ChartFrame>
    );
  }

  if (data.length === 0) {
    return (
      <ChartFrame>
        <p className="px-6 text-center text-sm" style={{ color: "var(--arb-text)" }}>
          No hourly funding prints in this window.
        </p>
      </ChartFrame>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="grid gap-3 sm:grid-cols-2"
        style={{ color: "var(--arb-text)" }}
      >
        <LiveStat
          label="Entropy OAI"
          accent="var(--arb-xyz)"
          ann={live?.oai.annPct ?? null}
        />
        <LiveStat
          label="QFEX SoftBank"
          accent="var(--arb-qfex)"
          ann={live?.sb.annPct ?? null}
        />
      </div>
      <div
        className="h-80 w-full rounded-lg p-3"
        style={{
          border: "1px solid var(--arb-border)",
          backgroundColor: "var(--arb-panel)",
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
            <XAxis
              dataKey="time"
              tickFormatter={(t) => formatChartTime(Number(t))}
              stroke={THEME.muted}
              tick={{ fontSize: 11, fill: THEME.muted }}
              minTickGap={40}
            />
            <YAxis
              domain={domain}
              tickFormatter={(v) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return "";
                const sign = n > 0 ? "+" : "";
                return `${sign}${n.toFixed(0)}%`;
              }}
              stroke={THEME.muted}
              tick={{ fontSize: 11, fill: THEME.muted }}
              width={56}
              label={{
                value: "ann %",
                angle: -90,
                position: "insideLeft",
                offset: 8,
                style: { fill: THEME.muted, fontSize: 11 },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--arb-panel-soft)",
                border: "1px solid var(--arb-border)",
                borderRadius: 8,
                color: "var(--arb-light)",
              }}
              labelFormatter={(label) => formatChartTime(Number(label))}
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value);
                const label = name === "oaiAnn" ? "OAI" : "SoftBank";
                return [fmtAnn(n), label];
              }}
            />
            <ReferenceLine y={0} stroke={THEME.muted} strokeDasharray="4 4" strokeOpacity={0.45} />
            <Line
              type="monotone"
              dataKey="oaiAnn"
              name="oaiAnn"
              stroke={THEME.variational}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
              activeDot={{ r: 3, fill: THEME.variational }}
            />
            <Line
              type="monotone"
              dataKey="sbAnn"
              name="sbAnn"
              stroke={THEME.qfex}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
              activeDot={{ r: 3, fill: THEME.qfex }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.7 }}>
        Hourly Hyperliquid settlements · ann % = hourly rate × 24 × 365 · live is the current hour
      </p>
    </div>
  );
}

function LiveStat({
  label,
  accent,
  ann,
}: {
  label: string;
  accent: string;
  ann: number | null;
}) {
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{
        backgroundColor: "var(--arb-panel-soft)",
        border: "1px solid var(--arb-border)",
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: accent }}>
        {label} live
      </p>
      <p className="font-mono text-xl" style={{ color: "var(--arb-light)" }}>
        {fmtAnn(ann)}
        <span className="text-xs font-sans" style={{ color: "var(--arb-text)", opacity: 0.75 }}>
          {"  "}ann
        </span>
      </p>
    </div>
  );
}

function ChartFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-80 items-center justify-center rounded-lg"
      style={{
        border: "1px solid var(--arb-border)",
        backgroundColor: "var(--arb-panel)",
      }}
    >
      {children}
    </div>
  );
}
