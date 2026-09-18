import { createServer } from "node:http";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
  convergeCooldownMs,
  fmtPp,
  fmtPx,
  healthPort,
  hysteresisPp,
  imbalanceHysteresisUsd,
  imbalanceUsdThreshold,
  liqHysteresisPct,
  liqPollMs,
  listingSpreadPp,
  pnlPingUrl,
  pollMs,
  telegramChatId,
  telegramLiqChatId,
  traderLive,
  tradingEnabled,
} from "./config.ts";
import { fetchListingBases, fetchLiveMids } from "./hl.ts";
import { crossedLevels, freshArmed, type AlertLevel } from "./levels.ts";
import {
  crossedImbalance,
  crossedLiqLevels,
  fetchLiqSnapshot,
  freshLiqArmed,
  notionalUsd,
  venueImbalanceUsd,
  type LiqLeg,
  type LiqLevel,
  type LiqSnapshot,
} from "./liq.ts";
import { esc, telegramSend } from "./telegram.ts";
import {
  emptyTrader,
  ensureHlLeverage,
  runTraderTick,
  sendTraderStarted,
} from "./trader/tick.ts";
import { createHlExecFromEnv, resolveIoAsset } from "./trader/hlExec.ts";
import { QfexTradeClient } from "./trader/qfexExec.ts";

const once = process.argv.includes("--once");
const SNAPSHOT_MS = 3 * 60 * 1000;
let lastPnlPing = 0;

async function pingPnlSnapshot(): Promise<void> {
  const url = pnlPingUrl();
  if (!url) return;
  const now = Date.now();
  if (now - lastPnlPing < SNAPSHOT_MS) return;
  lastPnlPing = now;
  try {
    const target = new URL(url);
    target.searchParams.set("snapshot", "1");
    const response = await fetch(target, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.warn(`[pnl] ping ${response.status}`);
      return;
    }
    console.log("[pnl] snapshot pinged");
  } catch (err) {
    console.warn("[pnl] ping failed", err instanceof Error ? err.message : err);
  }
}

interface HealthState {
  startedAt: string;
  oaiBase: number | null;
  sbBase: number | null;
  lastTickAt: string | null;
  lastSpreadPp: number | null;
  lastOai: number | null;
  lastSbJpy: number | null;
  lastSbUsd: number | null;
  lastUsdJpy: number | null;
  lastAlert: string | null;
  lastLiqAlert: string | null;
  lastLiqAt: string | null;
  lastOaiDistPct: number | null;
  lastSbDistPct: number | null;
  lastImbalanceUsd: number | null;
  lastImbalanceAlert: string | null;
  lastTraderAction: string | null;
  lastTraderError: string | null;
  traderLive: boolean;
  lastError: string | null;
  ticks: number;
  alerts: number;
  liqAlerts: number;
  imbalanceAlerts: number;
}

const health: HealthState = {
  startedAt: new Date().toISOString(),
  oaiBase: null,
  sbBase: null,
  lastTickAt: null,
  lastSpreadPp: null,
  lastOai: null,
  lastSbJpy: null,
  lastSbUsd: null,
  lastUsdJpy: null,
  lastAlert: null,
  lastLiqAlert: null,
  lastLiqAt: null,
  lastOaiDistPct: null,
  lastSbDistPct: null,
  lastImbalanceUsd: null,
  lastImbalanceAlert: null,
  lastTraderAction: null,
  lastTraderError: null,
  traderLive: false,
  lastError: null,
  ticks: 0,
  alerts: 0,
  liqAlerts: 0,
  imbalanceAlerts: 0,
};

const armed = freshArmed();
const oaiLiqArmed = freshLiqArmed();
const sbLiqArmed = freshLiqArmed();
const imbalanceArmed = { current: true };
const trader = emptyTrader();
let prevSpread: number | null = null;
let lastSentId: AlertLevel["id"] | null = null;
let lastConvergeAt = 0;
let lastLiqPoll = 0;
let oaiBase = 0;
let sbBase = 0;

function alertBody(
  level: AlertLevel,
  spread: number,
  oai: number,
  sbJpy: number,
  sbUsd: number,
  usdJpy: number,
): string {
  return [
    `<b>OAI / SoftBank  ${esc(fmtPp(spread))}</b>`,
    `Level: ${esc(level.title)}`,
    `<b>${esc(level.action)}</b>`,
    "",
    `OAI ${esc(fmtPx(oai, 2))}`,
    `SoftBank ¥${esc(fmtPx(sbJpy, 1))}  ($${esc(fmtPx(sbUsd, 3))})`,
    `USDJPY ${esc(fmtPx(usdJpy, 2))}`,
  ].join("\n");
}

function liqHeadline(level: LiqLevel): string {
  if (level === 5) return "🚨🚨 <b>5% from liquidation</b>";
  if (level === 10) return "🚨 <b>10% from liquidation</b>";
  return "⚠️ <b>15% from liquidation</b>";
}

function formatNativePx(leg: LiqLeg, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (leg.quote === "JPY") return `¥${fmtPx(value, 1)}`;
  return `$${fmtPx(value, 2)}`;
}

function liqAlertBody(level: LiqLevel, leg: LiqLeg): string {
  const dist =
    leg.distPct == null ? "n/a" : `${leg.distPct.toFixed(1)}%`;
  const against = leg.side === "long" ? "down" : "up";
  const liqUsd =
    leg.quote === "JPY" && leg.liqUsd != null
      ? `  ($${fmtPx(leg.liqUsd, 3)})`
      : "";
  const markUsd =
    leg.quote === "JPY" ? `  ($${fmtPx(leg.markUsd, 3)})` : "";
  return [
    `${liqHeadline(level)} · <b>${esc(leg.label)}</b>`,
    "",
    `${esc(leg.side)} ${esc(String(leg.size))}`,
    `Mark ${esc(formatNativePx(leg, leg.mark))}${esc(markUsd)}`,
    `Liq ${esc(formatNativePx(leg, leg.liq))}${esc(liqUsd)}`,
    `Buffer <b>${esc(dist)}</b> · price can still move ${esc(against)} this far`,
  ].join("\n");
}

function fmtUsd(n: number): string {
  return `$${fmtPx(n, 0)}`;
}

function formatLegNotional(leg: LiqLeg | null, label: string): string {
  const n = notionalUsd(leg);
  if (!leg || n == null) {
    return `${esc(label)}  flat  ${esc(fmtUsd(0))}`;
  }
  return `${esc(leg.label)}  ${esc(leg.side)}  ${esc(fmtPx(Math.abs(leg.size), 2))}  ·  ${esc(fmtUsd(n))}`;
}

function imbalanceAlertBody(snap: LiqSnapshot, gap: number, threshold: number): string {
  const oaiN = notionalUsd(snap.oai) ?? 0;
  const sbN = notionalUsd(snap.softbank) ?? 0;
  const heavier =
    oaiN === sbN
      ? "even"
      : oaiN > sbN
        ? "Entropy OAI is larger"
        : "QFEX SoftBank is larger";
  return [
    `⚠️ <b>Notional imbalance &gt; ${esc(fmtUsd(threshold))}</b>`,
    "",
    `Gap <b>${esc(fmtUsd(gap))}</b> · ${esc(heavier)}`,
    "",
    formatLegNotional(snap.oai, "Entropy OAI"),
    formatLegNotional(snap.softbank, "QFEX SoftBank"),
  ].join("\n");
}

async function emitImbalance(snap: LiqSnapshot): Promise<void> {
  const threshold = imbalanceUsdThreshold();
  const gap = venueImbalanceUsd(snap);
  health.lastImbalanceUsd = gap;
  const hit = crossedImbalance(
    gap,
    imbalanceArmed,
    threshold,
    imbalanceHysteresisUsd(),
  );
  if (!hit || gap == null) return;
  const oaiN = notionalUsd(snap.oai) ?? 0;
  const sbN = notionalUsd(snap.softbank) ?? 0;
  const summary = `${fmtUsd(gap)} (OAI ${fmtUsd(oaiN)} vs SB ${fmtUsd(sbN)})`;
  if (once) {
    console.log(`[imbalance] would alert ${summary}`);
    return;
  }
  await telegramSend(telegramLiqChatId(), imbalanceAlertBody(snap, gap, threshold));
  health.lastImbalanceAlert = summary;
  health.imbalanceAlerts += 1;
  console.log(`[imbalance] ${summary}`);
}

async function emitLiqHits(leg: LiqLeg | null, armed: ReturnType<typeof freshLiqArmed>): Promise<void> {
  const hits = crossedLiqLevels(
    leg?.distPct ?? null,
    armed,
    liqHysteresisPct(),
  );
  if (!leg || hits.length === 0) return;
  for (const level of hits) {
    const summary = `${leg.label} ${level}% @ ${leg.distPct?.toFixed(1)}%`;
    if (once) {
      console.log(`[liq] would alert ${summary}`);
      continue;
    }
    await telegramSend(telegramLiqChatId(), liqAlertBody(level, leg));
    health.lastLiqAlert = summary;
    health.liqAlerts += 1;
    console.log(`[liq] ${summary}`);
  }
}

async function tickLiq(): Promise<void> {
  const now = Date.now();
  if (!once && now - lastLiqPoll < liqPollMs()) return;
  lastLiqPoll = now;
  const snap = await fetchLiqSnapshot();
  health.lastLiqAt = new Date().toISOString();
  health.lastOaiDistPct = snap.oai?.distPct ?? null;
  health.lastSbDistPct = snap.softbank?.distPct ?? null;
  await emitLiqHits(snap.oai, oaiLiqArmed);
  await emitLiqHits(snap.softbank, sbLiqArmed);
  await emitImbalance(snap);
  if (once || health.ticks % 15 === 1) {
    console.log(
      `[liq] oai=${snap.oai?.distPct?.toFixed(1) ?? "n/a"}%  sb=${snap.softbank?.distPct?.toFixed(1) ?? "n/a"}%  imb=${health.lastImbalanceUsd == null ? "n/a" : `$${health.lastImbalanceUsd.toFixed(0)}`}  alerts=${health.liqAlerts} imbAlerts=${health.imbalanceAlerts}`,
    );
  }
}

async function tick(): Promise<void> {
  const mids = await fetchLiveMids();
  const { oai, sbJpy, usdJpy, sbUsd } = mids;
  const spread = listingSpreadPp(oai, sbUsd, oaiBase, sbBase);
  if (spread == null) throw new Error("spread null");

  health.lastTickAt = new Date().toISOString();
  health.lastSpreadPp = spread;
  health.lastOai = oai;
  health.lastSbJpy = sbJpy;
  health.lastSbUsd = sbUsd;
  health.lastUsdJpy = usdJpy;
  health.lastError = null;
  health.ticks += 1;

  const hits = crossedLevels(prevSpread, spread, armed, hysteresisPp());
  prevSpread = spread;

  for (const level of hits) {
    if (level.id === "mid" && lastSentId === "mid") {
      const wait = convergeCooldownMs();
      const elapsed = Date.now() - lastConvergeAt;
      if (wait > 0 && elapsed < wait) {
        const leftMin = Math.ceil((wait - elapsed) / 60_000);
        console.log(
          `[alert] skip converge cooldown ${leftMin}m left @ ${fmtPp(spread)}`,
        );
        continue;
      }
    }
    const text = alertBody(level, spread, oai, sbJpy, sbUsd, usdJpy);
    await telegramSend(telegramChatId(), text);
    lastSentId = level.id;
    if (level.id === "mid") lastConvergeAt = Date.now();
    health.lastAlert = `${level.title} @ ${fmtPp(spread)}`;
    health.alerts += 1;
    console.log(
      `[alert] ${health.lastAlert}  oai=${oai} sbJPY=${sbJpy} usdJpy=${usdJpy}`,
    );
  }

  if (once || health.ticks % 15 === 1) {
    console.log(
      `[watch] ${fmtPp(spread)}  oai=${fmtPx(oai, 2)}  sb=¥${fmtPx(sbJpy, 1)}  $${fmtPx(sbUsd, 3)}  usdJpy=${fmtPx(usdJpy, 2)}  alerts=${health.alerts}`,
    );
  }

  if (!once) await pingPnlSnapshot();
  try {
    await tickLiq();
  } catch (err) {
    console.warn("[liq] tick failed", err instanceof Error ? err.message : err);
  }
  if (!once) {
    try {
      await runTraderTick(trader, mids, oaiBase, sbBase);
      health.lastTraderAction = trader.lastAction;
      health.lastTraderError = trader.lastError;
      health.traderLive = traderLive();
    } catch (err) {
      health.lastTraderError = err instanceof Error ? err.message : String(err);
      console.warn("[trader] tick failed", health.lastTraderError);
    }
  }
}

function startHealthServer(): void {
  const port = healthPort();
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/health" || url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...health }, null, 2));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[watch] health on 0.0.0.0:${port}  poll=${pollMs()}ms`);
  });
}

async function main(): Promise<void> {
  const bases = await fetchListingBases();
  oaiBase = bases.oaiBase;
  sbBase = bases.sbBase;
  health.oaiBase = oaiBase;
  health.sbBase = sbBase;
  console.log(`[watch] listing bases OAI ${oaiBase}  SoftBank USD ${sbBase}`);

  if (once) {
    await tick();
    return;
  }

  startHealthServer();

  if (tradingEnabled()) {
    const pub = process.env.QFEX_PUBLIC_KEY;
    const sec = process.env.QFEX_SECRET_KEY;
    try {
      if (pub && sec) {
        trader.qfex = new QfexTradeClient(pub, sec);
        await trader.qfex.connect();
        console.log("[trader] QFEX trade WS connected");
      } else {
        console.warn("[trader] QFEX keys missing — orders disabled");
      }
      if (process.env.HL_PRIVATE_KEY?.startsWith("0x")) {
        trader.hl = await createHlExecFromEnv();
        const asset = await resolveIoAsset();
        console.log(
          `[trader] HL asset ${asset.assetId} szDecimals=${asset.szDecimals}`,
        );
        await ensureHlLeverage(trader.hl);
      } else {
        console.warn("[trader] HL_PRIVATE_KEY missing — orders disabled");
      }
    } catch (err) {
      console.warn(
        "[trader] init failed",
        err instanceof Error ? err.message : err,
      );
    }
    health.traderLive = traderLive();
  }

  await tick();
  await telegramSend(
    telegramChatId(),
    [
      "<b>OAI / SoftBank watcher up</b>",
      "QFEX SOFTBANK-JPY · USD via xyz:JPY",
      health.lastSpreadPp != null ? `Live ${esc(fmtPp(health.lastSpreadPp))}` : "Live n/a",
      "Alerting +18 / +8 / −2",
    ].join("\n"),
  );
  await telegramSend(
    telegramLiqChatId(),
    [
      "<b>OAI / SoftBank liq watcher up</b>",
      "Alerting when a venue is 15% / 10% / 5% from liquidation",
      `or notional imbalance exceeds $${imbalanceUsdThreshold().toLocaleString("en-US")}`,
      "Entropy OAI and QFEX SoftBank, separately",
      health.lastOaiDistPct != null
        ? `OAI now ${health.lastOaiDistPct.toFixed(1)}% from liq`
        : "OAI liq n/a",
      health.lastSbDistPct != null
        ? `SoftBank now ${health.lastSbDistPct.toFixed(1)}% from liq`
        : "SoftBank liq n/a",
      health.lastImbalanceUsd != null
        ? `Notional gap now $${health.lastImbalanceUsd.toFixed(0)}`
        : "Notional gap n/a",
    ].join("\n"),
  );
  try {
    await sendTraderStarted(traderLive(), process.env.TRADER_DRY_RUN === "true");
  } catch (err) {
    console.warn("[trader] startup telegram failed", err);
  }

  while (true) {
    await new Promise((r) => setTimeout(r, pollMs()));
    try {
      await tick();
    } catch (err) {
      health.lastError = err instanceof Error ? err.message : String(err);
      console.error("[watch] tick failed", err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
