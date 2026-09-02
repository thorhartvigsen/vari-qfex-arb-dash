"use client";

import { useEffect, useState } from "react";
import type { Bbo } from "@/lib/types";

const POLL_MS = 4_000;

export function useVariationalQuotes(tickers: string[]): {
  quotes: Record<string, Bbo>;
  error: string | null;
  fetchedAt: number | null;
} {
  const [quotes, setQuotes] = useState<Record<string, Bbo>>({});
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const key = tickers.join(",");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const response = await fetch("/api/variational", { cache: "no-store" });
        const json = (await response.json()) as {
          ok: boolean;
          error?: string;
          fetchedAt?: number;
          listings?: Record<string, Bbo>;
        };
        if (!response.ok || !json.ok) {
          throw new Error(json.error ?? `Variational ${response.status}`);
        }
        if (!cancelled) {
          setQuotes(json.listings ?? {});
          setFetchedAt(json.fetchedAt ?? Date.now());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Variational failed");
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, POLL_MS);
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [key]);

  return { quotes, error, fetchedAt };
}
