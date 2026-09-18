"use client";

import { useEffect, useState } from "react";

export default function OaiSoftbankTraderLight() {
  const [status, setStatus] = useState<{
    isLive: boolean;
    isWatching: boolean;
    ageMs: number;
    updatedAt: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/oai-softbank/trader", {
          cache: "no-store",
        });
        const json = (await response.json()) as {
          isLive?: boolean;
          isWatching?: boolean;
          ageMs?: number;
          updatedAt?: string;
        };
        if (!cancelled && response.ok) {
          setStatus({
            isLive: Boolean(json.isLive),
            isWatching: Boolean(json.isWatching),
            ageMs: Number(json.ageMs) || Infinity,
            updatedAt: json.updatedAt ?? "",
          });
        }
      } catch {
        if (!cancelled) setStatus(null);
      }
    }
    load();
    const id = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const isLive = status?.isLive === true;
  const isWatching = status?.isWatching === true;
  const label = isLive
    ? "Trader live"
    : isWatching
      ? "Trader online (dry-run)"
      : "Trader offline";
  const color = isLive ? "#6bcf7f" : isWatching ? "#d4a84b" : "#e07070";
  const detail = status?.updatedAt
    ? isLive || isWatching
      ? `heartbeat ${Math.round((status.ageMs || 0) / 1000)}s ago`
      : "no recent heartbeat"
    : "checking…";

  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-medium" style={{ color: "var(--arb-light)" }}>
          {label}
        </p>
        <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.75 }}>
          {detail}
        </p>
      </div>
    </div>
  );
}
