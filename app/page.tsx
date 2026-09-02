"use client";

import PairCard from "@/components/PairCard";
import ThemeToggle from "@/components/ThemeToggle";
import { usePositions } from "@/hooks/usePositions";
import { useQfexBooks } from "@/hooks/useQfexBooks";
import { useVariationalQuotes } from "@/hooks/useVariationalQuotes";
import { formatClock } from "@/lib/format";
import { PAIR_IDS, PAIRS } from "@/lib/types";

const VAR_TICKERS = PAIR_IDS.map((id) => PAIRS[id].varTicker);
const QFEX_SYMBOLS = PAIR_IDS.map((id) => PAIRS[id].qfexSymbol);

export default function Dashboard() {
  const { quotes: varQuotes, error: varError, fetchedAt } =
    useVariationalQuotes(VAR_TICKERS);
  const { books: qfexBooks, connected, error: qfexError } =
    useQfexBooks(QFEX_SYMBOLS);
  const { positions, update, clear } = usePositions();

  const errors = [varError, qfexError].filter(Boolean);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p
              className="text-3xl font-semibold sm:text-4xl"
              style={{ color: "var(--arb-light)" }}
            >
              Variational × QFEX
            </p>
            <p className="text-sm" style={{ color: "var(--arb-text)" }}>
              Gold and US100 swap books vs QFEX · entry, exit, and add-size spreads
            </p>
            <p className="text-xs" style={{ opacity: 0.75 }}>
              Variational {formatClock(fetchedAt)}
              {"  ·  "}
              QFEX {connected ? "live" : "connecting"}
            </p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {PAIR_IDS.map((id) => {
          const pair = PAIRS[id];
          return (
            <PairCard
              key={id}
              pair={pair}
              varBook={varQuotes[pair.varTicker]}
              qfexBook={qfexBooks[pair.qfexSymbol]}
              position={positions[id]}
              onChange={(patch) => update(id, patch)}
              onClear={() => clear(id)}
            />
          );
        })}
      </div>
    </main>
  );
}
