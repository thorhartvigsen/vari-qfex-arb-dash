import { createHmac, randomBytes } from "crypto";
import WebSocket from "ws";

type QfexSide = "BUY" | "SELL";

interface Pending {
  resolve: (v: QfexOrderResult) => void;
  clientOrderId: string;
  orderId: string | null;
  side: QfexSide;
  quantity: number;
  timer: ReturnType<typeof setTimeout>;
  /** Accumulated fill qty/px if multiple partial fills arrive. */
  filledQty: number;
  filledNotional: number;
}

export interface QfexOrderResult {
  ok: boolean;
  orderId: string | null;
  status: string | null;
  avgPrice: number | null;
  filledQty: number | null;
  raw: unknown;
}

/**
 * Persistent QFEX trade WebSocket for market orders.
 * @see https://docs.qfex.com/websocket/channels/trade/add_order
 * @see https://docs.qfex.com/websocket/channels/trade/fills
 */
export class QfexTradeClient {
  private ws: WebSocket | null = null;
  private authed = false;
  private subscribed = false;
  private connecting: Promise<void> | null = null;
  private readonly pendingByClient = new Map<string, Pending>();
  private readonly pendingByOrder = new Map<string, Pending>();
  private readonly publicKey: string;
  private readonly secretKey: string;
  private verbose = process.env.QFEX_WS_VERBOSE === "true";

  constructor(publicKey: string, secretKey: string) {
    this.publicKey = publicKey;
    this.secretKey = secretKey;
  }

  async connect(): Promise<void> {
    if (this.authed && this.subscribed && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const url = `wss://trade.qfex.com?api_key=${encodeURIComponent(this.publicKey)}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        this.connecting = null;
        this.authed = false;
        this.subscribed = false;
        reject(err);
      };

      const done = () => {
        if (settled) return;
        settled = true;
        this.connecting = null;
        resolve();
      };

      const timer = setTimeout(
        () => fail(new Error("QFEX trade WS auth/subscribe timeout")),
        12_000,
      );

      const sendSubscribe = () => {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            params: { channels: ["order_responses", "fills"] },
          }),
        );
      };

      ws.on("open", () => {
        const nonce = randomBytes(16).toString("hex");
        const unixTs = Math.floor(Date.now() / 1000);
        const signature = createHmac("sha256", this.secretKey)
          .update(`${nonce}:${unixTs}`)
          .digest("hex");
        ws.send(
          JSON.stringify({
            type: "auth",
            params: {
              hmac: {
                public_key: this.publicKey,
                nonce,
                unix_ts: unixTs,
                signature,
              },
            },
          }),
        );
      });

      ws.on("message", (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }
        if (this.verbose) {
          console.log("[qfex ws]", JSON.stringify(msg).slice(0, 500));
        }

        if (msg.err) {
          if (!this.authed) {
            fail(new Error(JSON.stringify(msg.err)));
          } else {
            console.warn("[qfex] WS err", msg.err);
            // Rejected add_order often arrives as top-level err without
            // order_response — settle the outstanding pending so we don't TIMEOUT.
            this.settleLatestPendingOnError(msg.err);
          }
          return;
        }

        // Auth: { type: "auth", result: "success" }
        if (
          msg.type === "auth" &&
          (msg.result === "success" || msg.status === "ok")
        ) {
          this.authed = true;
          sendSubscribe();
          return;
        }
        if (
          !this.authed &&
          (msg.authenticated === true ||
            msg.status === "authenticated" ||
            msg.status === "ok")
        ) {
          this.authed = true;
          sendSubscribe();
          return;
        }

        // Subscribe acks: { subscribed: "fills" } or { type: "subscribed", ... }
        if (
          msg.subscribed === "fills" ||
          msg.subscribed === "order_responses" ||
          msg.type === "subscribed"
        ) {
          this.subscribed = true;
          clearTimeout(timer);
          done();
        }

        this.handleMessage(msg);
      });

      ws.on("error", (err) =>
        fail(err instanceof Error ? err : new Error(String(err))),
      );
      ws.on("close", () => {
        this.authed = false;
        this.subscribed = false;
        this.ws = null;
        for (const [, p] of this.pendingByClient) {
          clearTimeout(p.timer);
          p.resolve({
            ok: false,
            orderId: p.orderId,
            status: "WS_CLOSED",
            avgPrice: null,
            filledQty: null,
            raw: { note: "socket closed" },
          });
        }
        this.pendingByClient.clear();
        this.pendingByOrder.clear();
        if (!settled) fail(new Error("QFEX WS closed before ready"));
      });
    });

    return this.connecting;
  }

  private settleLatestPendingOnError(err: unknown) {
    // Prefer single outstanding order; otherwise leave them for timeout.
    if (this.pendingByClient.size !== 1) return;
    const pending = [...this.pendingByClient.values()][0];
    const status =
      typeof err === "object" && err && "code" in err
        ? String((err as { code: unknown }).code)
        : typeof err === "string"
          ? err
          : "ERROR";
    this.settle(pending, {
      ok: false,
      orderId: pending.orderId,
      status,
      avgPrice: null,
      filledQty: null,
      raw: err,
    });
  }

  private findPending(resp: Record<string, unknown>): Pending | null {
    const clientOrderId = String(resp.client_order_id ?? "");
    if (clientOrderId && this.pendingByClient.has(clientOrderId)) {
      return this.pendingByClient.get(clientOrderId)!;
    }
    const orderId = String(resp.order_id ?? "");
    if (orderId && this.pendingByOrder.has(orderId)) {
      return this.pendingByOrder.get(orderId)!;
    }
    if (this.pendingByClient.size === 1) {
      return [...this.pendingByClient.values()][0] ?? null;
    }
    return null;
  }

  private bindOrderId(pending: Pending, orderId: string | null) {
    if (!orderId) return;
    if (pending.orderId && pending.orderId !== orderId) return;
    pending.orderId = orderId;
    this.pendingByOrder.set(orderId, pending);
  }

  private settle(pending: Pending, result: QfexOrderResult) {
    clearTimeout(pending.timer);
    this.pendingByClient.delete(pending.clientOrderId);
    if (pending.orderId) this.pendingByOrder.delete(pending.orderId);
    pending.resolve(result);
  }

  private settleFromFills(pending: Pending, status: string, raw: unknown) {
    const qty = pending.filledQty;
    const avg =
      qty > 0 && pending.filledNotional > 0
        ? pending.filledNotional / qty
        : null;
    this.settle(pending, {
      ok: qty > 0,
      orderId: pending.orderId,
      status,
      avgPrice: avg,
      filledQty: qty > 0 ? qty : null,
      raw,
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    // Docs: { fill_response: { price, quantity, order_id, client_order_id, ... } }
    const fill =
      (msg.fill_response as Record<string, unknown> | undefined) ??
      (msg.type === "fill_response" ? msg : null) ??
      (msg.fill as Record<string, unknown> | undefined);

    if (fill && !Array.isArray(fill)) {
      const pending = this.findPending(fill);
      if (pending) {
        this.bindOrderId(
          pending,
          fill.order_id ? String(fill.order_id) : null,
        );
        const px = Number(fill.price ?? fill.avg_price);
        const qty = Number(fill.quantity ?? fill.size ?? fill.qty);
        if (Number.isFinite(px) && Number.isFinite(qty) && qty > 0) {
          pending.filledQty += qty;
          pending.filledNotional += px * qty;
          const remainingRaw =
            fill.remaining_quantity ?? fill.quantity_remaining;
          const remaining =
            remainingRaw !== undefined && remainingRaw !== null
              ? Number(remainingRaw)
              : NaN;
          // Only settle when remaining is explicitly done, or we hit order size.
          // Missing remaining must NOT settle early — QFEX often sends the first
          // partial fill without that field, then more fills (DRAM IOC slices).
          const remainingDone =
            Number.isFinite(remaining) && remaining <= 1e-12;
          const sizeDone = pending.filledQty + 1e-12 >= pending.quantity;
          if (remainingDone || sizeDone) {
            this.settleFromFills(pending, "FILLED_VIA_FILL", fill);
          }
        }
      } else if (this.verbose) {
        console.warn("[qfex] unmatched fill_response", fill.order_id);
      }
    }

    if (Array.isArray(msg.fills)) {
      for (const f of msg.fills as Array<Record<string, unknown>>) {
        this.handleMessage({ fill_response: f });
      }
    }

    const resp =
      (msg.order_response as Record<string, unknown> | undefined) ??
      (msg.type === "order_response" ? msg : null);
    if (!resp) return;

    const pending = this.findPending(resp);
    if (!pending) {
      console.warn(
        "[qfex] unmatched order_response",
        resp.status,
        resp.order_id,
        resp.client_order_id,
      );
      return;
    }

    this.bindOrderId(pending, resp.order_id ? String(resp.order_id) : null);

    const status = String(resp.status ?? "").toUpperCase();
    const qty = Number(resp.quantity ?? pending.quantity);
    const hasRemaining =
      resp.quantity_remaining !== undefined && resp.quantity_remaining !== null;
    const remaining = hasRemaining ? Number(resp.quantity_remaining) : NaN;
    let filled =
      Number.isFinite(qty) && Number.isFinite(remaining)
        ? Math.max(0, qty - remaining)
        : 0;
    if (
      filled <= 0 &&
      (status === "FILLED" || status === "DONE") &&
      Number.isFinite(qty) &&
      qty > 0
    ) {
      filled = qty;
    }

    if (status === "ACK" || status === "OPEN" || status === "PARTIAL") {
      // Keep waiting for fill_response / FILLED. PARTIAL may include qty.
      if (status === "PARTIAL" && filled > 0) {
        const px = Number(resp.avg_price ?? resp.price);
        if (Number.isFinite(px)) {
          pending.filledQty = Math.max(pending.filledQty, filled);
          pending.filledNotional = px * pending.filledQty;
        }
      }
      return;
    }

    const rejected =
      status === "REJECTED" || status === "ERROR" || status === "FAILED";
    if (rejected) {
      this.settle(pending, {
        ok: false,
        orderId: pending.orderId,
        status,
        avgPrice: null,
        filledQty: null,
        raw: resp,
      });
      return;
    }

    // Prefer accumulated fill channel prices when present.
    if (pending.filledQty > 0) {
      this.settleFromFills(pending, status, resp);
      return;
    }

    const avg = Number(resp.avg_price ?? resp.price);
    const filledOk = filled > 0;
    this.settle(pending, {
      ok: filledOk,
      orderId: pending.orderId,
      status,
      avgPrice: Number.isFinite(avg) && filledOk ? avg : null,
      filledQty: filledOk ? filled : null,
      raw: resp,
    });
  }

  async marketOrder(opts: {
    side: QfexSide;
    quantity: number;
    symbol: string;
    reduceOnly?: boolean;
    timeoutMs?: number;
    /** Required by QFEX schema even for MARKET (ignored by matching). */
    price?: number;
  }): Promise<QfexOrderResult> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("QFEX WS not connected");
    }
    if (!this.subscribed) {
      console.warn("[qfex] not subscribed yet — sending order anyway");
    }

    // QFEX schema requires `price` even for MARKET; send 0 (exchange sets touch).
    // Sending a real book price can yield InvalidPrice on MARKET orders.
    const price =
      opts.price !== undefined && Number.isFinite(opts.price) ? opts.price : 0;

    // Avoid float junk (e.g. 31.2030000001); exchange enforces lot_size precision.
    const quantity =
      Math.round(opts.quantity * 1e9) / 1e9;

    const clientOrderId = `oaisb-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const payload = {
      type: "add_order",
      params: {
        symbol: opts.symbol,
        side: opts.side,
        order_type: "MARKET",
        order_time_in_force: "IOC",
        quantity,
        price,
        take_profit: 0,
        stop_loss: 0,
        reduce_only: Boolean(opts.reduceOnly),
        client_order_id: clientOrderId,
      },
    };

    console.log(
      `[qfex] add_order ${opts.symbol} ${opts.side} qty=${quantity} reduce=${Boolean(opts.reduceOnly)}`,
    );

    return new Promise<QfexOrderResult>((resolve) => {
      const timer = setTimeout(() => {
        const pending = this.pendingByClient.get(clientOrderId);
        // If we saw fills but never got a terminal status, still succeed.
        if (pending && pending.filledQty > 0) {
          this.settleFromFills(pending, "TIMEOUT_WITH_FILLS", {
            note: "timeout but fills received",
          });
          return;
        }
        if (pending?.orderId) this.pendingByOrder.delete(pending.orderId);
        this.pendingByClient.delete(clientOrderId);
        resolve({
          ok: false,
          orderId: pending?.orderId ?? null,
          status: "TIMEOUT",
          avgPrice: null,
          filledQty: null,
          raw: {
            note: "no fill_response / terminal order_response within timeout",
            sent: payload.params,
          },
        });
      }, opts.timeoutMs ?? 10_000);

      this.pendingByClient.set(clientOrderId, {
        resolve,
        clientOrderId,
        orderId: null,
        side: opts.side,
        quantity,
        timer,
        filledQty: 0,
        filledNotional: 0,
      });
      this.ws!.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.authed = false;
    this.subscribed = false;
  }
}
