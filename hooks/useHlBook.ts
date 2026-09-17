"use client";

import { useEffect, useState } from "react";
import { normalizeLevels, sortAsks, sortBids, topOfBook } from "@/lib/book";
import { HL_WS } from "@/lib/entropy";
import type { Bbo } from "@/lib/types";

export function useHlBook(coin: string | null): {
  book: Bbo | undefined;
  connected: boolean;
  error: string | null;
} {
  const [book, setBook] = useState<Bbo | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!coin) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    setBook(undefined);

    function connect() {
      if (cancelled || !coin) return;
      ws = new WebSocket(HL_WS);

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
        ws?.send(
          JSON.stringify({
            method: "subscribe",
            subscription: { type: "l2Book", coin },
          }),
        );
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message = JSON.parse(String(event.data)) as {
            channel?: string;
            data?: {
              coin?: string;
              levels?: Array<Array<{ px: string; sz: string }>>;
            };
          };
          if (message.channel !== "l2Book" || !message.data?.levels) return;
          if (message.data.coin && message.data.coin !== coin) return;

          const bids = sortBids(
            normalizeLevels(
              (message.data.levels[0] ?? []).map((row) => ({
                price: row.px,
                size: row.sz,
              })),
            ),
          );
          const asks = sortAsks(
            normalizeLevels(
              (message.data.levels[1] ?? []).map((row) => ({
                price: row.px,
                size: row.sz,
              })),
            ),
          );
          const bid = topOfBook(bids);
          const ask = topOfBook(asks);
          if (bid === null || ask === null) return;
          setBook({ bid, ask, bids, asks, updatedAt: Date.now() });
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        if (!cancelled) setError("Hyperliquid websocket error");
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
  }, [coin]);

  return { book, connected, error };
}
