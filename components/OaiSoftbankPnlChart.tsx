"use client";

import { useMemo, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChartTime, formatSigned, formatUsd } from "@/lib/format";
import { START_COLLATERAL, pnlStats } from "@/lib/pnlTypes";
import type { PnlPoint } from "@/lib/pnlTypes";
import { THEME } from "@/lib/types";

interface OaiSoftbankPnlChartProps {
  data: PnlPoint[];
  live?: PnlPoint | null;
  loading?: boolean;
  error?: string | null;
  persist?: "blob" | "local" | "ephemeral" | null;
}

function formatPnlUsd(value: number): string {
  const abs = formatUsd(Math.abs(value), 0);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function yDomain(data: PnlPoint[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const point of data) {
    for (const value of [point.total, point.qfex, point.hl]) {
      if (!Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.04, 100);
    return [min - pad, max + pad];
  }
  const pad = Math.max((max - min) * 0.08, 50);
  return [min - pad, max + pad];
}

function Stat({
  label,
  value,
  toneValue,
}: {
  label: string;
  value: string;
  toneValue?: number | null;
}) {
  const color =
    toneValue == null || !Number.isFinite(toneValue)
      ? "var(--arb-light)"
      : toneValue > 0
        ? "var(--arb-positive)"
        : toneValue < 0
          ? "var(--arb-negative)"
          : "var(--arb-light)";
  return (
    <div
      className="flex flex-1 flex-col gap-0.5 rounded-md px-2.5 py-2"
      style={{
        backgroundColor: "var(--arb-panel-soft)",
        border: "1px solid var(--arb-border)",
      }}
    >
      <p
        className="text-[10px] font-normal uppercase tracking-wider"
        style={{ color: "var(--arb-text)", opacity: 0.75 }}
      >
        {label}
      </p>
      <p className="font-sans text-sm font-light leading-tight" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

export default function OaiSoftbankPnlChart({
  data,
  live,
  loading,
  error,
  persist,
}: OaiSoftbankPnlChartProps) {
  const chartData = useMemo(() => {
    const rows = [...data];
    if (live && Number.isFinite(live.total)) {
      const last = rows[rows.length - 1];
      const liveMinute = Math.round(live.time / 60_000);
      const lastMinute = last ? Math.round(last.time / 60_000) : null;
      if (lastMinute === liveMinute) rows[rows.length - 1] = live;
      else rows.push(live);
    }
    return rows;
  }, [data, live]);

  const domain = useMemo(() => yDomain(chartData), [chartData]);
  const windowStats = useMemo(() => pnlStats(chartData), [chartData]);
  const stats = windowStats;

  if (loading) {
    return (
      <ChartFrame>
        <p className="text-sm" style={{ color: "var(--arb-text)" }}>
          Loading collateral…
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

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total" value={formatUsd(live?.total ?? null, 0)} />
        <Stat label="QFEX" value={formatUsd(live?.qfex ?? null, 0)} />
        <Stat label="Hyperliquid" value={formatUsd(live?.hl ?? null, 0)} />
        <Stat
          label="P&L"
          value={
            stats?.pnlUsd == null
              ? "—"
              : `${formatPnlUsd(stats.pnlUsd)}  ·  ${formatSigned(stats.pnlPct, 2, "%")}`
          }
          toneValue={stats?.pnlUsd}
        />
        <Stat
          label="Sharpe"
          value={stats?.sharpe == null ? "—" : stats.sharpe.toFixed(2)}
          toneValue={stats?.sharpe}
        />
      </div>
      {chartData.length === 0 ? (
        <ChartFrame>
          <p className="px-6 text-center text-sm" style={{ color: "var(--arb-text)" }}>
            No collateral snapshots yet — first print is stored on this load.
          </p>
        </ChartFrame>
      ) : (
        <div
          className="h-80 w-full rounded-lg p-3"
          style={{
            border: "1px solid var(--arb-border)",
            backgroundColor: "var(--arb-panel)",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
              <XAxis
                dataKey="time"
                tickFormatter={(t) => formatChartTime(Number(t))}
                stroke={THEME.muted}
                tick={{ fontSize: 10, fill: THEME.muted }}
                minTickGap={40}
              />
              <YAxis
                domain={domain}
                tickFormatter={(v) =>
                  Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
                }
                stroke={THEME.muted}
                tick={{ fontSize: 10, fill: THEME.muted }}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--arb-panel)",
                  border: "1px solid var(--arb-border)",
                  color: "var(--arb-light)",
                  fontSize: 12,
                }}
                labelFormatter={(label) => formatChartTime(Number(label))}
                formatter={(value, name) => [
                  formatUsd(typeof value === "number" ? value : Number(value), 0),
                  name === "total" ? "Total" : name === "qfex" ? "QFEX" : "Hyperliquid",
                ]}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke={THEME.light}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="qfex"
                stroke={THEME.qfex}
                strokeWidth={1.25}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="hl"
                stroke={THEME.variational}
                strokeWidth={1.25}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.7 }}>
        QFEX equity + Hyperliquid USDC (incl. Entropy margin) · snapshot every 1 min ·
        P&L vs {START_COLLATERAL.toLocaleString()} start · Sharpe annualized from
        1-minute returns, rf = 0
        {persist === "ephemeral"
          ? "  ·  history is not persisting (needs Vercel Blob)"
          : persist === "blob"
            ? `  ·  ${data.length} stored prints`
            : ""}
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
