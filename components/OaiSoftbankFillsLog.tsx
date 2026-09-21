"use client";

import { formatChartTime, formatPp, formatPrice, formatSigned } from "@/lib/format";
import { OAI_DECIMALS, SB_DECIMALS } from "@/lib/oaiSoftbank";
import type { OaiSbExecution } from "@/lib/oaiSoftbankFills";
import { fillRole } from "@/lib/oaiSoftbankFills";
import { tone } from "@/components/arbUi";

const ENTRY_DOT = "#6b8cff";
const EXIT_DOT = "#c45c4a";

function kindLabel(kind: OaiSbExecution["kind"]): string {
  if (kind === "short_oai") return "Short OAI / long SoftBank";
  if (kind === "long_oai") return "Long OAI / short SoftBank";
  if (kind === "mixed") return "Mixed";
  return "One leg";
}

function sideLabel(side: "buy" | "sell" | null): string {
  if (side === "buy") return "buy";
  if (side === "sell") return "sell";
  return "—";
}

function RoleDot({ role }: { role: "entry" | "exit" | null }) {
  if (!role) return null;
  const entry = role === "entry";
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      title={entry ? "Enter / scale" : "Take profit / flatten"}
      aria-label={entry ? "Enter / scale" : "Take profit / flatten"}
      style={{ backgroundColor: entry ? ENTRY_DOT : EXIT_DOT }}
    />
  );
}

export default function OaiSoftbankFillsLog({
  executions,
  error,
}: {
  executions: OaiSbExecution[];
  error?: string | null;
}) {
  if (error) {
    return (
      <p
        className="rounded-lg px-3 py-2 text-sm"
        style={{
          border: "1px solid rgba(224,160,144,0.45)",
          backgroundColor: "rgba(224,160,144,0.12)",
          color: "#c45c4a",
        }}
      >
        {error}
      </p>
    );
  }

  if (executions.length === 0) {
    return (
      <div
        className="rounded-lg px-4 py-8 text-center text-sm"
        style={{
          border: "1px solid var(--arb-border)",
          backgroundColor: "var(--arb-panel)",
          color: "var(--arb-text)",
        }}
      >
        No fills since 17 Sep 2026 00:00 UTC.
      </div>
    );
  }

  return (
    <div className="space-y-2">
    <div
      className="overflow-x-auto rounded-lg"
      style={{
        border: "1px solid var(--arb-border)",
        backgroundColor: "var(--arb-panel)",
      }}
    >
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr
            className="text-xs uppercase tracking-wide"
            style={{ color: "var(--arb-light)" }}
          >
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Side</th>
            <th className="px-3 py-2 font-medium">Executed spread</th>
            <th className="px-3 py-2 font-medium">OAI</th>
            <th className="px-3 py-2 font-medium">SoftBank</th>
            <th className="px-3 py-2 font-medium">Notional</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((row) => (
            <tr
              key={`${row.time}-${row.fillCount}-${row.oaiSize}-${row.sbSize}`}
              style={{ borderTop: "1px solid var(--arb-border)" }}
            >
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                {formatChartTime(row.time)}
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <RoleDot role={fillRole(row)} />
                  {kindLabel(row.kind)}
                </span>
              </td>
              <td
                className="px-3 py-2 font-mono"
                style={{ color: tone(row.spreadPp) }}
              >
                {formatPp(row.spreadPp, 3)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {sideLabel(row.oaiSide)} {formatPrice(row.oaiPx, OAI_DECIMALS)}
                {row.oaiSize > 0 ? ` × ${row.oaiSize.toFixed(3)}` : ""}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {sideLabel(row.sbSide)} ¥{formatPrice(row.sbPx, SB_DECIMALS)}
                {row.sbSize > 0 ? ` × ${row.sbSize.toFixed(3)}` : ""}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {formatSigned(row.oaiNotional + row.sbNotional, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      <p className="flex items-center gap-3 px-1 text-xs" style={{ color: "var(--arb-text)", opacity: 0.7 }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ENTRY_DOT }} />
          Enter / scale
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: EXIT_DOT }} />
          Take profit / flatten
        </span>
      </p>
    </div>
  );
}
