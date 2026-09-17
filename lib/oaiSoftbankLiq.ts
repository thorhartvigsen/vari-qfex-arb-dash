import "server-only";
import {
  HL_INFO,
  JPY_COIN,
  OAI_COIN,
  OAI_DEX,
  SB_SYMBOL,
  bookMid,
  jpyToUsd,
} from "@/lib/oaiSoftbank";
import {
  distToLiqPct,
  estimateLiqPrice,
  sideFromSize,
  type LiqLeg,
  type OaiSbLiqPayload,
} from "@/lib/liqTypes";
import { qfexAuthedGet } from "@/lib/qfexAuth";

export type { LiqLeg, OaiSbLiqPayload };

interface QfexPositionsResponse {
  positions?: Array<{
    symbol?: string;
    position?: number;
    average_price?: number;
    maintenance_margin?: number;
    unrealised_pnl?: number;
  }>;
  balance?: {
    deposit?: number;
    unrealised_pnl?: number;
    realised_pnl?: number;
    net_funding?: number;
  };
}

interface HlClearinghouse {
  marginSummary?: {
    accountValue?: string;
  };
  crossMaintenanceMarginUsed?: string;
  assetPositions?: Array<{
    position?: {
      coin?: string;
      szi?: string;
      entryPx?: string;
      positionValue?: string;
      liquidationPx?: string | null;
      unrealizedPnl?: string;
    };
  }>;
}

interface HlBook {
  levels?: Array<Array<{ px?: string }>>;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid ${body.type as string} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function hlMid(coin: string): Promise<number | null> {
  const book = await postInfo<HlBook>({ type: "l2Book", coin });
  const bid = num(book.levels?.[0]?.[0]?.px);
  const ask = num(book.levels?.[1]?.[0]?.px);
  return bookMid(bid, ask);
}

async function qfexMid(symbol: string): Promise<number | null> {
  const response = await fetch(
    `https://api.qfex.com/md/orderbook/${encodeURIComponent(symbol)}`,
    { cache: "no-store" },
  );
  if (!response.ok) return null;
  const book = (await response.json()) as {
    bids?: Array<[string | number, string | number]>;
    asks?: Array<[string | number, string | number]>;
  };
  return bookMid(num(book.bids?.[0]?.[0]), num(book.asks?.[0]?.[0]));
}

/** QFEX mark/index in quote currency. JPY names PnL in USDC as q × (P_jpy − entry). */
async function qfexIndex(symbol: string): Promise<number | null> {
  const response = await fetch(
    `https://api.qfex.com/md/contracts?symbol=${encodeURIComponent(symbol)}`,
    { cache: "no-store" },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    data?: Array<{ ticker_id?: string; index_price?: string; last_price?: string }>;
  };
  const row =
    (body.data ?? []).find((item) => item.ticker_id === symbol) ?? body.data?.[0];
  return num(row?.index_price) ?? num(row?.last_price);
}

function qfexEquityUsd(balance: QfexPositionsResponse["balance"]): number | null {
  if (!balance) return null;
  const equity =
    Number(balance.deposit ?? 0) +
    Number(balance.realised_pnl ?? 0) +
    Number(balance.unrealised_pnl ?? 0) +
    Number(balance.net_funding ?? 0);
  return Number.isFinite(equity) ? equity : null;
}

/** QFEX MM/PnL uses quote units as USDC 1:1, including JPY and KRW names. */
function qfexQuoteNotional(nativePx: number, size: number): number {
  return Math.abs(size) * nativePx;
}

export async function fetchOaiSoftbankLiq(): Promise<OaiSbLiqPayload> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const [oaiState, qfexPos, oaiMark, fx, sbIndex, sbMid] = await Promise.all([
    postInfo<HlClearinghouse>({
      type: "clearinghouseState",
      user: wallet,
      dex: OAI_DEX,
    }),
    qfexAuthedGet<QfexPositionsResponse>("/user/positions"),
    hlMid(OAI_COIN),
    hlMid(JPY_COIN),
    qfexIndex(SB_SYMBOL),
    qfexMid(SB_SYMBOL),
  ]);
  const sbMarkJpy =
    sbIndex != null && sbIndex > 0
      ? sbIndex
      : sbMid != null && sbMid > 0
        ? sbMid
        : null;

  const oaiRaw =
    (oaiState.assetPositions ?? [])
      .map((row) => row.position)
      .find((p) => p?.coin === OAI_COIN) ?? null;
  const oaiSize = num(oaiRaw?.szi) ?? 0;
  const oaiSide = sideFromSize(oaiSize);
  let oai: LiqLeg | null = null;
  if (oaiRaw && oaiSide !== "flat" && oaiMark != null && oaiMark > 0) {
    const apiLiq = num(oaiRaw.liquidationPx);
    let liq = apiLiq != null && apiLiq > 0 ? apiLiq : null;
    if (liq == null) {
      const equity = num(oaiState.marginSummary?.accountValue);
      const posValue = num(oaiRaw.positionValue);
      const mmUsed = num(oaiState.crossMaintenanceMarginUsed);
      if (equity != null && posValue != null && posValue > 0 && mmUsed != null) {
        const estimated = estimateLiqPrice({
          size: oaiSize,
          mark: oaiMark,
          equity,
          maintRate: mmUsed / posValue,
        });
        if (
          estimated != null &&
          ((oaiSize > 0 && estimated < oaiMark) ||
            (oaiSize < 0 && estimated > oaiMark))
        ) {
          liq = estimated;
        }
      }
    }
    oai = {
      venue: "oai",
      label: "Entropy OAI",
      side: oaiSide,
      size: oaiSize,
      mark: oaiMark,
      markUsd: oaiMark,
      liq,
      liqUsd: liq,
      distPct: distToLiqPct(oaiSize, oaiMark, liq),
      quote: "USD",
    };
  }

  const equity = qfexEquityUsd(qfexPos.balance);
  const sbRaw =
    (qfexPos.positions ?? []).find((p) => p.symbol === SB_SYMBOL) ?? null;
  const sbSize = num(sbRaw?.position) ?? 0;
  const sbSide = sideFromSize(sbSize);
  const sbMaint = num(sbRaw?.maintenance_margin);
  let mmOther = 0;
  for (const row of qfexPos.positions ?? []) {
    const symbol = row.symbol ?? "";
    if (symbol === SB_SYMBOL) continue;
    const size = num(row.position) ?? 0;
    const avg = num(row.average_price) ?? 0;
    const maint = num(row.maintenance_margin);
    if (size === 0 || maint == null || !(avg > 0)) continue;
    mmOther += maint * qfexQuoteNotional(avg, size);
  }

  let softbank: LiqLeg | null = null;
  if (
    sbRaw &&
    sbSide !== "flat" &&
    sbMarkJpy != null &&
    sbMarkJpy > 0 &&
    equity != null &&
    sbMaint != null
  ) {
    const equityForSb = equity - mmOther;
    const liqJpy = estimateLiqPrice({
      size: sbSize,
      mark: sbMarkJpy,
      equity: equityForSb,
      maintRate: sbMaint,
    });
    const onSide =
      liqJpy != null &&
      ((sbSize > 0 && liqJpy < sbMarkJpy) ||
        (sbSize < 0 && liqJpy > sbMarkJpy));
    const liqKept = onSide ? liqJpy : null;
    const markUsd =
      fx != null && fx > 0 ? jpyToUsd(sbMarkJpy, fx) : sbMarkJpy;
    const liqUsd =
      liqKept != null && fx != null && fx > 0
        ? jpyToUsd(liqKept, fx)
        : liqKept;
    softbank = {
      venue: "softbank",
      label: "QFEX SoftBank",
      side: sbSide,
      size: sbSize,
      mark: sbMarkJpy,
      markUsd: markUsd ?? sbMarkJpy,
      liq: liqKept,
      liqUsd: liqUsd,
      distPct: distToLiqPct(sbSize, sbMarkJpy, liqKept),
      quote: "JPY",
    };
  }

  return {
    oai,
    softbank,
    fetchedAt: Date.now(),
  };
}
