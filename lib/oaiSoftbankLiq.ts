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

function qfexEquityUsd(balance: QfexPositionsResponse["balance"]): number | null {
  if (!balance) return null;
  const equity =
    Number(balance.deposit ?? 0) +
    Number(balance.realised_pnl ?? 0) +
    Number(balance.unrealised_pnl ?? 0) +
    Number(balance.net_funding ?? 0);
  return Number.isFinite(equity) ? equity : null;
}

function isJpySymbol(symbol: string): boolean {
  return symbol.endsWith("-JPY") || symbol.includes("JPY");
}

function positionMarkUsd(
  symbol: string,
  avgPx: number,
  usdJpy: number,
): number | null {
  if (!(avgPx > 0)) return null;
  if (isJpySymbol(symbol)) return jpyToUsd(avgPx, usdJpy);
  return avgPx;
}

export async function fetchOaiSoftbankLiq(): Promise<OaiSbLiqPayload> {
  const wallet = process.env.HL_WALLET_ADDRESS;
  if (!wallet) throw new Error("Missing HL_WALLET_ADDRESS");

  const [oaiState, qfexPos, oaiMark, fx, sbMarkJpy] = await Promise.all([
    postInfo<HlClearinghouse>({
      type: "clearinghouseState",
      user: wallet,
      dex: OAI_DEX,
    }),
    qfexAuthedGet<QfexPositionsResponse>("/user/positions"),
    hlMid(OAI_COIN),
    hlMid(JPY_COIN),
    qfexMid(SB_SYMBOL),
  ]);

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
  const sbMarkUsd =
    sbMarkJpy != null && fx != null ? jpyToUsd(sbMarkJpy, fx) : null;
  const sbMaint = num(sbRaw?.maintenance_margin);
  let mmOther = 0;
  for (const row of qfexPos.positions ?? []) {
    const symbol = row.symbol ?? "";
    if (symbol === SB_SYMBOL) continue;
    const size = num(row.position) ?? 0;
    const avg = num(row.average_price) ?? 0;
    const maint = num(row.maintenance_margin);
    if (size === 0 || maint == null || fx == null) continue;
    const markUsd = positionMarkUsd(symbol, avg, fx);
    if (markUsd == null) continue;
    mmOther += maint * Math.abs(size) * markUsd;
  }

  let softbank: LiqLeg | null = null;
  if (
    sbRaw &&
    sbSide !== "flat" &&
    sbMarkJpy != null &&
    sbMarkJpy > 0 &&
    sbMarkUsd != null &&
    equity != null &&
    sbMaint != null &&
    fx != null &&
    fx > 0
  ) {
    const equityForSb = equity - mmOther;
    const liqUsd = estimateLiqPrice({
      size: sbSize,
      mark: sbMarkUsd,
      equity: equityForSb,
      maintRate: sbMaint,
    });
    const onSide =
      liqUsd != null &&
      ((sbSize > 0 && liqUsd < sbMarkUsd) ||
        (sbSize < 0 && liqUsd > sbMarkUsd));
    const liqUsdKept = onSide ? liqUsd : null;
    const liqJpy = liqUsdKept != null ? liqUsdKept * fx : null;
    softbank = {
      venue: "softbank",
      label: "QFEX SoftBank",
      side: sbSide,
      size: sbSize,
      mark: sbMarkJpy,
      markUsd: sbMarkUsd,
      liq: liqJpy,
      liqUsd: liqUsdKept,
      distPct: distToLiqPct(sbSize, sbMarkUsd, liqUsdKept),
      quote: "JPY",
    };
  }

  return {
    oai,
    softbank,
    fetchedAt: Date.now(),
  };
}
