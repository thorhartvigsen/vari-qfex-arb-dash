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
import { formatChartTime, formatPrice, formatSpreadBps } from "@/lib/format";
import type { SpreadPoint } from "@/lib/spreadHistory";
import { THEME } from "@/lib/types";

interface SpreadHistoryChartProps {
  data: SpreadPoint[];
  loading?: boolean;
  error?: string | null;
  note?: string | null;
  decimals?: number;
}

function yDomain(data: SpreadPoint[]): [number, number] {
  let min = 0;
  let max = 0;
  for (const point of data) {
    if (!Number.isFinite(point.spreadBps)) continue;
    min = Math.min(min, point.spreadBps);
    max = Math.max(max, point.spreadBps);
  }
  const pad = Math.max((max - min) * 0.08, 8);
  return [min - pad, max + pad];
}

export default function SpreadHistoryChart({
  data,
  loading,
  error,
  note,
  decimals = 2,
}: SpreadHistoryChartProps) {
  const domain = useMemo(() => yDomain(data), [data]);

  if (loading) {
    return (
      <ChartFrame>
        <p className="text-sm" style={{ color: "var(--arb-text)" }}>
          Loading 1-minute spread…
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
          No overlapping 1-minute candles for this window.
        </p>
      </ChartFrame>
    );
  }

  return (
    <div className="space-y-2">
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
                return `${sign}${n.toFixed(0)}`;
              }}
              stroke={THEME.muted}
              tick={{ fontSize: 11, fill: THEME.muted }}
              width={56}
              label={{
                value: "bps",
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
              formatter={(value, _name, item) => {
                const row = item?.payload as SpreadPoint | undefined;
                const spread =
                  typeof value === "number" ? value : Number(value);
                const extra =
                  row != null
                    ? `  ·  QFEX ${formatPrice(row.qfex, decimals)}  ·  Entropy ${formatPrice(row.entropy, decimals)}`
                    : "";
                return [`${formatSpreadBps(spread)}${extra}`, "Spread"];
              }}
            />
            <ReferenceLine y={0} stroke={THEME.muted} strokeDasharray="4 4" strokeOpacity={0.45} />
            <Line
              type="monotone"
              dataKey="spreadBps"
              stroke={THEME.light}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 3, fill: THEME.light }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.7 }}>
        1-minute closes · bps = 10,000 × (Entropy − QFEX) / QFEX
        {note ? `  ·  ${note}` : ""}
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
