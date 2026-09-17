"use client";

import { useEffect, useState } from "react";
import { normalizeLevels, sortAsks, sortBids, topOfBook } from "@/lib/book";
import { QFEX_MDS, type Bbo } from "@/lib/types";

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
          if (bid === null || ask === null) return;

          setBooks((prev) => ({
            ...prev,
            [message.symbol as string]: {
              bid,
              ask,
              bids,
              asks,
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
    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [key]);

  return { books, connected, error };
}
