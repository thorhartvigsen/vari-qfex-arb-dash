"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_POSITION,
  PAIR_IDS,
  type PairId,
  type PairPosition,
} from "@/lib/types";

const STORAGE_KEY = "vari-qfex-arb/positions";

type Positions = Record<PairId, PairPosition>;

function emptyPositions(): Positions {
  return {
    gold: { ...DEFAULT_POSITION },
    us100: { ...DEFAULT_POSITION },
  };
}

function parseStored(raw: string | null): Positions {
  const base = emptyPositions();
  if (!raw) return base;
  try {
    const json = JSON.parse(raw) as Partial<Record<PairId, Partial<PairPosition>>>;
    for (const id of PAIR_IDS) {
      const row = json[id];
      if (!row) continue;
      base[id] = {
        varSide: row.varSide === "long" ? "long" : "short",
        qfexSide: row.qfexSide === "short" ? "short" : "long",
        varEntry: typeof row.varEntry === "string" ? row.varEntry : "",
        qfexEntry: typeof row.qfexEntry === "string" ? row.qfexEntry : "",
      };
    }
  } catch {
    return base;
  }
  return base;
}

export function usePositions(): {
  positions: Positions;
  update: (id: PairId, patch: Partial<PairPosition>) => void;
  clear: (id: PairId) => void;
} {
  const [positions, setPositions] = useState<Positions>(emptyPositions);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPositions(parseStored(window.localStorage.getItem(STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  }, [hydrated, positions]);

  const update = useCallback((id: PairId, patch: Partial<PairPosition>) => {
    setPositions((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }, []);

  const clear = useCallback((id: PairId) => {
    setPositions((prev) => ({
      ...prev,
      [id]: { ...DEFAULT_POSITION },
    }));
  }, []);

  return { positions, update, clear };
}
