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
import { pnlStats } from "@/lib/oaiSoftbankPnl";
import type { PnlPoint } from "@/lib/pnlStore";
import { THEME } from "@/lib/types";

interface OaiSoftbankPnlChartProps {
  data: PnlPoint[];
  live?: PnlPoint | null;
  loading?: boolean;
  error?: string | null;
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
      <p className="font-mono text-xl font-medium leading-none" style={{ color }}>
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
}: OaiSoftbankPnlChartProps) {
  const chartData = useMemo(() => {
    const rows = [...data];
    if (live && Number.isFinite(live.total)) {
      const last = rows[rows.length - 1];
      if (!last || Math.abs(live.time - last.time) > 5_000) rows.push(live);
      else rows[rows.length - 1] = live;
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
          label="Max drawdown"
          value={
            stats?.maxDrawdownPct == null
              ? "—"
              : `${formatSigned(-stats.maxDrawdownPct, 2, "%")}  ·  ${formatUsd(-(stats.maxDrawdownUsd ?? 0), 0)}`
          }
          toneValue={stats?.maxDrawdownPct ? -stats.maxDrawdownPct : 0}
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
                tick={{ fontSize: 11, fill: THEME.muted }}
                minTickGap={40}
              />
              <YAxis
                domain={domain}
                tickFormatter={(v) =>
                  Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
                }
                stroke={THEME.muted}
                tick={{ fontSize: 11, fill: THEME.muted }}
                width={72}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--arb-panel)",
                  border: "1px solid var(--arb-border)",
                  color: "var(--arb-light)",
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
        QFEX equity + Hyperliquid USDC (incl. Entropy margin) · snapshot every 30 min ·
        Sharpe annualized from 30-minute returns, rf = 0
        {stats?.pnlUsd != null
          ? `  ·  since first print ${formatSigned(stats.pnlUsd, 0)} (${formatSigned(stats.pnlPct, 2, "%")})`
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
