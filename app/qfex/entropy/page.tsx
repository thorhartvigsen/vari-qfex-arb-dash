"use client";

import { Suspense, useState } from "react";
import EntropyCard from "@/components/EntropyCard";
import SiteNav from "@/components/SiteNav";
import ThemeToggle from "@/components/ThemeToggle";
import ToggleGroup from "@/components/ToggleGroup";
import { useEntropyPositions } from "@/hooks/useEntropyPositions";
import { useHlBook } from "@/hooks/useHlBook";
import { useQfexBooks } from "@/hooks/useQfexBooks";
import {
  ENTROPY_IDS,
  ENTROPY_PAIRS,
  type EntropyId,
} from "@/lib/entropy";
import { formatClock } from "@/lib/format";

const LABELS: Record<EntropyId, string> = {
  nbis: "NBIS",
  sndk: "SNDK",
};

export default function EntropyPage() {
  const [marketId, setMarketId] = useState<EntropyId>("sndk");
  const pair = ENTROPY_PAIRS[marketId];

  const { data, error: posError } = useEntropyPositions(marketId);
  const { book: hlBook, connected: hlConnected, error: hlError } = useHlBook(
    pair.hlCoin,
  );
  const {
    books: qfexBooks,
    connected: qfexConnected,
    error: qfexError,
  } = useQfexBooks([pair.qfexSymbol]);

  const errors = [posError, hlError, qfexError].filter(Boolean);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Suspense fallback={null}>
              <SiteNav />
            </Suspense>
            <div className="space-y-2">
              <p
                className="text-3xl font-semibold sm:text-4xl"
                style={{ color: "var(--arb-light)" }}
              >
                QFEX × Entropy
              </p>
              <p className="text-sm" style={{ color: "var(--arb-text)" }}>
                HIP-3 io perps vs QFEX · entries pulled from your accounts
              </p>
              <p className="text-xs" style={{ opacity: 0.75 }}>
                Positions {formatClock(data?.fetchedAt)}
                {"  ·  "}
                HL {hlConnected ? "live" : "connecting"}
                {"  ·  "}
                QFEX {qfexConnected ? "live" : "connecting"}
              </p>
            </div>
            <ToggleGroup
              options={ENTROPY_IDS}
              labels={LABELS}
              value={marketId}
              onChange={setMarketId}
            />
          </div>
          <ThemeToggle />
        </div>

        {errors.map((message) => (
          <p
            key={message}
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              border: "1px solid rgba(224,160,144,0.45)",
              backgroundColor: "rgba(224,160,144,0.12)",
              color: "#c45c4a",
            }}
          >
            {message}
          </p>
        ))}
      </header>

      <EntropyCard
        pair={pair}
        hlBook={hlBook}
        qfexBook={qfexBooks[pair.qfexSymbol]}
        hlLeg={data?.hyperliquid ?? null}
        qfexLeg={data?.qfex ?? null}
      />
    </main>
  );
}
