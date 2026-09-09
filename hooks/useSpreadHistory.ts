"use client";

import { useEffect, useState } from "react";
import type { EntropyId, SpreadRange } from "@/lib/entropy";
import type { SpreadHistoryPayload } from "@/lib/spreadHistory";

export function useSpreadHistory(
  market: EntropyId,
  range: SpreadRange,
  enabled: boolean,
): {
  data: SpreadHistoryPayload | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<SpreadHistoryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const response = await fetch(
          `/api/entropy/spread?market=${market}&range=${range}`,
          { cache: "no-store" },
        );
        const json = (await response.json()) as SpreadHistoryPayload & {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || json.ok === false) {
          throw new Error(json.error ?? `Spread ${response.status}`);
        }
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Spread history failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [market, range, enabled]);

  return { data, error, loading };
}
