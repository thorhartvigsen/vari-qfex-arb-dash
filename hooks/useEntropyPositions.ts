"use client";

import { useEffect, useState } from "react";
import type { EntropyId, EntropyPositionsPayload } from "@/lib/entropy";

const POLL_MS = 6_000;

export function useEntropyPositions(market: EntropyId): {
  data: EntropyPositionsPayload | null;
  error: string | null;
} {
  const [data, setData] = useState<EntropyPositionsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    setData(null);

    async function tick() {
      try {
        const response = await fetch(
          `/api/entropy/positions?market=${market}`,
          { cache: "no-store" },
        );
        const json = (await response.json()) as EntropyPositionsPayload & {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || json.ok === false) {
          throw new Error(json.error ?? `Positions ${response.status}`);
        }
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Positions failed");
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
  }, [market]);

  return { data, error };
}
