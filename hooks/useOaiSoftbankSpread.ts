"use client";

import { useEffect, useState } from "react";
import type { OaiSbSpreadPayload } from "@/lib/oaiSoftbankHistory";

export function useOaiSoftbankSpread(): {
  data: OaiSbSpreadPayload | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<OaiSbSpreadPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/oai-softbank/spread", {
          cache: "no-store",
        });
        const json = (await response.json()) as OaiSbSpreadPayload & {
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
  }, []);

  return { data, error, loading };
}
