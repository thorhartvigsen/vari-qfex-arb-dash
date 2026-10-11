"use client";

import { useEffect, useState } from "react";
import { normalizeLevels, sortAsks, sortBids, topOfBook } from "@/lib/book";
import { QFEX_MDS, type Bbo } from "@/lib/types";

const REST_MS = 3_000;
const WS_FRESH_MS = 8_000;

function hasLiveBook(book: Bbo | undefined): boolean {
  return Boolean(
    book &&
      book.bid != null &&
      book.ask != null &&
      book.bid > 0 &&
      book.ask > 0 &&
      Date.now() - (book.updatedAt ?? 0) < WS_FRESH_MS,
  );
}

export function useQfexBooks(symbols: string[]): {
  books: Record<string, Bbo>;
  connected: boolean;
  error: string | null;
} {
  const [books, setBooks] = useState<Record<string, Bbo>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = symbols.join(",");

  useEffect(() => {
    const subscribed = key.split(",").filter(Boolean);
    if (subscribed.length === 0) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pollTimer: number | undefined;

    function mergeRest(incoming: Record<string, Bbo>) {
      setBooks((prev) => {
        const next = { ...prev };
        for (const [symbol, snap] of Object.entries(incoming)) {
          if (hasLiveBook(prev[symbol])) continue;
          next[symbol] = snap;
        }
        return next;
      });
    }

    async function pollRest() {
      if (cancelled) return;
      try {
        const response = await fetch(
          `/api/qfex/books?symbols=${encodeURIComponent(key)}`,
          { cache: "no-store" },
        );
        const json = (await response.json()) as {
          ok?: boolean;
          books?: Record<string, Bbo>;
          error?: string;
        };
        if (!response.ok || json.ok === false) {
          throw new Error(json.error ?? `QFEX books ${response.status}`);
        }
        if (!cancelled && json.books) mergeRest(json.books);
      } catch {
        // REST is a fallback for empty L2; WS errors still surface via onerror.
      }
    }

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(QFEX_MDS);

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
        ws?.send(
          JSON.stringify({
            type: "subscribe",
            channels: ["level2"],
            symbols: subscribed,
          }),
        );
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            symbol?: string;
            bid?: unknown;
            ask?: unknown;
            bids?: unknown;
            asks?: unknown;
          };
          if (message.type !== "level2" || !message.symbol) return;
          if (!subscribed.includes(message.symbol)) return;

          const bids = sortBids(
            normalizeLevels(
              (message.bid ?? message.bids ?? []) as Parameters<
                typeof normalizeLevels
              >[0],
            ),
          );
          const asks = sortAsks(
            normalizeLevels(
              (message.ask ?? message.asks ?? []) as Parameters<
                typeof normalizeLevels
              >[0],
            ),
          );
          const bid = topOfBook(bids);
          const ask = topOfBook(asks);
          // Empty weekend books must not wipe a last/index mark from REST.
          if (bid === null || ask === null) return;

          setBooks((prev) => ({
            ...prev,
            [message.symbol as string]: {
              bid,
              ask,
              bids,
              asks,
              mark: (bid + ask) / 2,
              updatedAt: Date.now(),
            },
          }));
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        if (!cancelled) setError("QFEX websocket error");
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        reconnectTimer = window.setTimeout(connect, 1_500);
      };
    }

    connect();
    void pollRest();
    pollTimer = window.setInterval(() => void pollRest(), REST_MS);
    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [key]);

  return { books, connected, error };
}
