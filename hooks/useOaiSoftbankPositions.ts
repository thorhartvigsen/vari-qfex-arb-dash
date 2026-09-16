"use client";

import { useEffect, useState } from "react";
import type { OaiSbPositionsPayload } from "@/lib/oaiSoftbank";

const POLL_MS = 6_000;

export function useOaiSoftbankPositions(): {
  data: OaiSbPositionsPayload | null;
  error: string | null;
} {
  const [data, setData] = useState<OaiSbPositionsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const response = await fetch("/api/oai-softbank/positions", {
          cache: "no-store",
        });
        const json = (await response.json()) as OaiSbPositionsPayload & {
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
  }, []);

  return { data, error };
}
