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
import { formatChartTime, formatPp, formatPrice } from "@/lib/format";
import {
  CONVERGE_PP,
  LOWER_PP,
  OAI_DECIMALS,
  SB_DECIMALS,
  UPPER_PP,
} from "@/lib/oaiSoftbank";
import type { OaiSbPoint } from "@/lib/oaiSoftbankHistory";
import { THEME } from "@/lib/types";

interface OaiSoftbankChartProps {
  data: OaiSbPoint[];
  loading?: boolean;
  error?: string | null;
  note?: string | null;
  liveSpreadPp?: number | null;
}

interface ChartPoint extends OaiSbPoint {
  live?: boolean;
}

function yDomain(data: ChartPoint[]): [number, number] {
  let min = LOWER_PP;
  let max = UPPER_PP;
  for (const point of data) {
    if (!Number.isFinite(point.spreadPp)) continue;
    min = Math.min(min, point.spreadPp);
    max = Math.max(max, point.spreadPp);
  }
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.08, 4);
    return [min - pad, max + pad];
  }
  const pad = Math.max((max - min) * 0.08, 2);
  return [min - pad, max + pad];
}

export default function OaiSoftbankChart({
  data,
  loading,
  error,
  note,
  liveSpreadPp,
}: OaiSoftbankChartProps) {
  const chartData = useMemo(() => {
    const rows: ChartPoint[] = [...data];
    if (liveSpreadPp != null && Number.isFinite(liveSpreadPp)) {
      const last = rows[rows.length - 1];
      rows.push({
        time: Date.now(),
        oai: last?.oai ?? 0,
        sb: last?.sb ?? 0,
        spreadPp: liveSpreadPp,
        live: true,
      });
    }
    return rows;
  }, [data, liveSpreadPp]);

  const domain = useMemo(() => yDomain(chartData), [chartData]);

  if (loading) {
    return (
      <ChartFrame>
        <p className="text-sm" style={{ color: "var(--arb-text)" }}>
          Loading listing-relative spread…
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

  if (chartData.length === 0) {
    return (
      <ChartFrame>
        <p className="px-6 text-center text-sm" style={{ color: "var(--arb-text)" }}>
          No overlapping 5-minute candles since listing.
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
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                value: "pp",
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
                const row = item?.payload as ChartPoint | undefined;
                const spread = typeof value === "number" ? value : Number(value);
                const extra =
                  row != null && !row.live
                    ? `  ·  OAI ${formatPrice(row.oai, OAI_DECIMALS)}  ·  SB ${formatPrice(row.sb, SB_DECIMALS)}`
                    : row?.live
                      ? "  ·  live mid"
                      : "";
                return [`${formatPp(spread, 3)}${extra}`, "Spread"];
              }}
            />
            <ReferenceLine
              y={CONVERGE_PP}
              stroke={THEME.light}
              strokeWidth={1.25}
              label={{
                value: `+${CONVERGE_PP} mid`,
                fill: THEME.muted,
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
            <ReferenceLine
              y={UPPER_PP}
              stroke={THEME.qfex}
              strokeDasharray="4 4"
              strokeOpacity={0.85}
              label={{
                value: `+${UPPER_PP} short OAI`,
                fill: THEME.muted,
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
            <ReferenceLine
              y={LOWER_PP}
              stroke={THEME.variational}
              strokeDasharray="4 4"
              strokeOpacity={0.85}
              label={{
                value: `${LOWER_PP} long OAI`,
                fill: THEME.muted,
                fontSize: 11,
                position: "insideBottomRight",
              }}
            />
            <Line
              type="monotone"
              dataKey="spreadPp"
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
        5-minute closes · pp = OAI % since listing − SoftBank % since listing · mid +
        {CONVERGE_PP} · bands {LOWER_PP} / +{UPPER_PP}
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
