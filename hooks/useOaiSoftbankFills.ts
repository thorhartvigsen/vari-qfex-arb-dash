"use client";

import { useEffect, useState } from "react";
import type { OaiSbFillsPayload } from "@/lib/oaiSoftbankFills";

const POLL_MS = 10_000;

export function useOaiSoftbankFills(): {
  data: OaiSbFillsPayload | null;
  error: string | null;
} {
  const [data, setData] = useState<OaiSbFillsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const response = await fetch("/api/oai-softbank/fills", {
          cache: "no-store",
        });
        const json = (await response.json()) as OaiSbFillsPayload & {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || json.ok === false) {
          throw new Error(json.error ?? `Fills ${response.status}`);
        }
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fills failed");
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
