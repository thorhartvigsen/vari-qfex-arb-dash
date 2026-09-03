"use client";

import { useEffect, useState } from "react";
import type { Bbo } from "@/lib/types";
import { fetchVariationalListings } from "@/lib/variational";

/** Stats API allows 10 requests / 10s. Stay under that. */
const POLL_MS = 1_500;

async function fetchViaProxy(tickers: string[]): Promise<Record<string, Bbo>> {
  const response = await fetch(`/api/variational?t=${Date.now()}`, {
    cache: "no-store",
  });
  const json = (await response.json()) as {
    ok: boolean;
    error?: string;
    listings?: Record<string, Bbo>;
  };
  if (!response.ok || !json.ok) {
    throw new Error(json.error ?? `Variational ${response.status}`);
  }
  return json.listings ?? {};
}

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
    const wanted = key.split(",").filter(Boolean);

    async function tick() {
      try {
        let listings: Record<string, Bbo>;
        try {
          listings = await fetchVariationalListings(wanted);
        } catch {
          listings = await fetchViaProxy(wanted);
        }
        if (!cancelled) {
          setQuotes(listings);
          setFetchedAt(Date.now());
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
