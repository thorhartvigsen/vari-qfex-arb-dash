"use client";

import { Suspense, useMemo, useState } from "react";
import OaiSoftbankCard from "@/components/OaiSoftbankCard";
import OaiSoftbankChart from "@/components/OaiSoftbankChart";
import OaiSoftbankFundingChart from "@/components/OaiSoftbankFundingChart";
import SiteNav from "@/components/SiteNav";
import ThemeToggle from "@/components/ThemeToggle";
import ToggleGroup from "@/components/ToggleGroup";
import { useHlBook } from "@/hooks/useHlBook";
import { useOaiSoftbankFunding } from "@/hooks/useOaiSoftbankFunding";
import { useOaiSoftbankPositions } from "@/hooks/useOaiSoftbankPositions";
import { useOaiSoftbankSpread } from "@/hooks/useOaiSoftbankSpread";
import { formatClock } from "@/lib/format";
import {
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  OAI_COIN,
  SB_COIN,
  SPREAD_RANGE_MS,
  SPREAD_RANGES,
  bookMid,
  listingSpreadPp,
  type OaiSbRange,
} from "@/lib/oaiSoftbank";

const RANGE_LABELS: Record<OaiSbRange, string> = {
  "1d": "1d",
  "3d": "3d",
  "7d": "7d",
  all: "since listing",
};

export default function OaiSoftbankPage() {
  const [spreadRange, setSpreadRange] = useState<OaiSbRange>("7d");
  const { data, error: posError } = useOaiSoftbankPositions();
  const { book: oaiBook, connected: oaiConnected, error: oaiError } = useHlBook(OAI_COIN);
  const { book: sbBook, connected: sbConnected, error: sbError } = useHlBook(SB_COIN);
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

  const oaiBase = spread?.oaiBase ?? FALLBACK_OAI_BASE;
  const sbBase = spread?.sbBase ?? FALLBACK_SB_BASE;
  const liveSpread = listingSpreadPp(
    bookMid(oaiBook?.bid, oaiBook?.ask),
    bookMid(sbBook?.bid, sbBook?.ask),
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

  const errors = [posError, oaiError, sbError].filter(Boolean);

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
                Entropy io:OAI vs TradeXYZ xyz:SOFTBANK · +8 pp listing-relative mid
              </p>
              <p className="text-xs" style={{ opacity: 0.75 }}>
                Positions {formatClock(data?.fetchedAt)}
                {"  ·  "}
                OAI {oaiConnected ? "live" : "connecting"}
                {"  ·  "}
                SoftBank {sbConnected ? "live" : "connecting"}
              </p>
            </div>
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

      <OaiSoftbankCard
        oaiBook={oaiBook}
        sbBook={sbBook}
        oaiLeg={data?.oai ?? null}
        sbLeg={data?.softbank ?? null}
        oaiBase={oaiBase}
        sbBase={sbBase}
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
              OAI % since 2 Sep 13:00 UTC − SoftBank % · +8 mid, ±10 bands
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
            Entropy OAI and TradeXYZ SoftBank · same window as the spread
          </p>
        </div>
        <OaiSoftbankFundingChart
          data={fundingPoints}
          live={funding?.live ?? null}
          loading={fundingLoading}
          error={fundingError}
        />
      </section>
    </main>
  );
}
