"use client";

import { useEffect, useState } from "react";
import type { OaiSbPnlPayload } from "@/lib/pnlTypes";

const POLL_MS = 60_000;

export function useOaiSoftbankPnl(): {
  data: OaiSbPnlPayload | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<OaiSbPnlPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const response = await fetch("/api/oai-softbank/pnl", { cache: "no-store" });
        const json = (await response.json()) as OaiSbPnlPayload & {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || json.ok === false) {
          throw new Error(json.error ?? `PnL ${response.status}`);
        }
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PnL failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(tick, POLL_MS);
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return { data, error, loading };
}
