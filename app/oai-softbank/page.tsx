"use client";

import { Suspense, useMemo, useState } from "react";
import OaiSoftbankCard from "@/components/OaiSoftbankCard";
import OaiSoftbankChart from "@/components/OaiSoftbankChart";
import OaiSoftbankFillsLog from "@/components/OaiSoftbankFillsLog";
import OaiSoftbankFundingChart from "@/components/OaiSoftbankFundingChart";
import OaiSoftbankPnlChart, {
  type PnlSeries,
} from "@/components/OaiSoftbankPnlChart";
import OaiSoftbankSignalPanel from "@/components/OaiSoftbankSignalPanel";
import OaiSoftbankTraderLight from "@/components/OaiSoftbankTraderLight";
import SiteNav from "@/components/SiteNav";
import ThemeToggle from "@/components/ThemeToggle";
import ToggleGroup from "@/components/ToggleGroup";
import { useHlBook } from "@/hooks/useHlBook";
import { useOaiSoftbankFills } from "@/hooks/useOaiSoftbankFills";
import { useOaiSoftbankFunding } from "@/hooks/useOaiSoftbankFunding";
import { useOaiSoftbankPnl } from "@/hooks/useOaiSoftbankPnl";
import { useOaiSoftbankPositions } from "@/hooks/useOaiSoftbankPositions";
import { useOaiSoftbankSpread } from "@/hooks/useOaiSoftbankSpread";
import { useQfexBooks } from "@/hooks/useQfexBooks";
import { formatClock } from "@/lib/format";
import {
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  JPY_COIN,
  OAI_COIN,
  SB_SYMBOL,
  SPREAD_RANGE_MS,
  SPREAD_RANGES,
  bookMid,
  jpyToUsd,
  listingSpreadPp,
  type OaiSbRange,
} from "@/lib/oaiSoftbank";

const RANGE_LABELS: Record<OaiSbRange, string> = {
  "1d": "1d",
  "3d": "3d",
  "7d": "7d",
  all: "since listing",
};

const PNL_SERIES = ["total", "pnl"] as const;
const PNL_SERIES_LABELS: Record<PnlSeries, string> = {
  total: "Total value",
  pnl: "Net P&L",
};

export default function OaiSoftbankPage() {
  const [spreadRange, setSpreadRange] = useState<OaiSbRange>("7d");
  const [pnlRange, setPnlRange] = useState<OaiSbRange>("7d");
  const [pnlSeries, setPnlSeries] = useState<PnlSeries>("total");
  const { data, error: posError } = useOaiSoftbankPositions();
  const { data: fills, error: fillsError } = useOaiSoftbankFills();
  const { book: oaiBook, connected: oaiConnected, error: oaiError } = useHlBook(OAI_COIN);
  const { book: jpyBook, connected: jpyConnected, error: jpyError } = useHlBook(JPY_COIN);
  const {
    books: qfexBooks,
    connected: sbConnected,
    error: sbError,
  } = useQfexBooks([SB_SYMBOL]);
  const sbBook = qfexBooks[SB_SYMBOL];
  const {
    data: spread,
    error: spreadError,
    loading: spreadLoading,
  } = useOaiSoftbankSpread();
  const {
    data: funding,
    error: fundingError,
    loading: fundingLoading,
  } = useOaiSoftbankFunding();
  const {
    data: pnl,
    error: pnlError,
    loading: pnlLoading,
  } = useOaiSoftbankPnl();

  const oaiBase = spread?.oaiBase ?? FALLBACK_OAI_BASE;
  const sbBase = spread?.sbBase ?? FALLBACK_SB_BASE;
  const usdJpy = bookMid(jpyBook?.bid, jpyBook?.ask);
  const liveSpread = listingSpreadPp(
    bookMid(oaiBook?.bid, oaiBook?.ask),
    jpyToUsd(bookMid(sbBook?.bid, sbBook?.ask), usdJpy),
    oaiBase,
    sbBase,
  );

  const chartPoints = useMemo(() => {
    const points = spread?.points ?? [];
    const windowMs = SPREAD_RANGE_MS[spreadRange];
    if (windowMs == null) return points;
    const cutoff = Date.now() - windowMs;
    return points.filter((point) => point.time >= cutoff);
  }, [spread?.points, spreadRange]);

  const fundingPoints = useMemo(() => {
    const points = funding?.points ?? [];
    const windowMs = SPREAD_RANGE_MS[spreadRange];
    if (windowMs == null) return points;
    const cutoff = Date.now() - windowMs;
    return points.filter((point) => point.time >= cutoff);
  }, [funding?.points, spreadRange]);

  const pnlPoints = useMemo(() => {
    const points = pnl?.points ?? [];
    const windowMs = SPREAD_RANGE_MS[pnlRange];
    if (windowMs == null) return points;
    const cutoff = Date.now() - windowMs;
    return points.filter((point) => point.time >= cutoff);
  }, [pnl?.points, pnlRange]);

  const errors = [posError, oaiError, sbError, jpyError].filter(Boolean);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
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
                OAI × SoftBank
              </p>
              <p className="text-sm" style={{ color: "var(--arb-text)" }}>
                Entropy io:OAI vs QFEX SOFTBANK-JPY · USD via xyz:JPY · +8 pp listing-relative mid
              </p>
              <p className="text-xs" style={{ opacity: 0.75 }}>
                Positions {formatClock(data?.fetchedAt)}
                {"  ·  "}
                OAI {oaiConnected ? "live" : "connecting"}
                {"  ·  "}
                SoftBank {sbConnected ? "live" : "connecting"}
                {"  ·  "}
                USDJPY {jpyConnected ? "live" : "connecting"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            <ThemeToggle />
            <OaiSoftbankTraderLight />
          </div>
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

      <OaiSoftbankCard
        oaiBook={oaiBook}
        sbBook={sbBook}
        oaiLeg={data?.oai ?? null}
        sbLeg={data?.softbank ?? null}
        oaiBase={oaiBase}
        sbBase={sbBase}
        usdJpy={usdJpy}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--arb-light)" }}
            >
              Listing-relative spread
            </h2>
            <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
              OAI % since 2 Sep 13:00 UTC − SoftBank USD % (JPY ÷ USDJPY) · +8 mid, ±10 bands
            </p>
          </div>
          <ToggleGroup
            options={SPREAD_RANGES}
            labels={RANGE_LABELS}
            value={spreadRange}
            onChange={setSpreadRange}
          />
        </div>
        <OaiSoftbankChart
          data={chartPoints}
          loading={spreadLoading}
          error={spreadError}
          note={spread?.note}
          liveSpreadPp={liveSpread}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--arb-light)" }}
          >
            Hourly funding
          </h2>
          <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
            Entropy OAI and QFEX SoftBank · same window as the spread
          </p>
        </div>
        <OaiSoftbankFundingChart
          data={fundingPoints}
          live={funding?.live ?? null}
          loading={fundingLoading}
          error={fundingError}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--arb-light)" }}
          >
            Execution log
          </h2>
          <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
            Entropy fills and QFEX SoftBank trades from 17 Sep 2026 00:00 UTC · clustered within 5 minutes · listing-relative entry spread in USD
          </p>
        </div>
        <OaiSoftbankFillsLog
          executions={fills?.executions ?? []}
          error={fillsError}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--arb-light)" }}
            >
              Collateral P&amp;L
            </h2>
            <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
              Combined QFEX + Hyperliquid USDC · 3-minute snapshots
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              options={PNL_SERIES}
              labels={PNL_SERIES_LABELS}
              value={pnlSeries}
              onChange={setPnlSeries}
            />
            <ToggleGroup
              options={SPREAD_RANGES}
              labels={RANGE_LABELS}
              value={pnlRange}
              onChange={setPnlRange}
            />
          </div>
        </div>
        <OaiSoftbankPnlChart
          data={pnlPoints}
          live={pnl?.live ?? null}
          loading={pnlLoading}
          error={pnlError}
          persist={pnl?.persist ?? null}
          series={pnlSeries}
        />
      </section>

      <OaiSoftbankSignalPanel />
    </main>
  );
}
