import {
  HL_SLIPPAGE_SCHEDULE_BPS,
  MAX_LEV,
  OAI_COIN,
  OAI_ISOLATED_LEV,
  OAI_PRICE_DECIMALS,
  OAI_SIZE_DECIMALS,
  RETRY_COOLDOWN_MS,
  SB_SIZE_DECIMALS,
  SB_SYMBOL,
  TRADE_COOLDOWN_MS,
  WALK_USD,
  fmtPx,
  listingSpreadPp,
  minClipUsd,
  telegramOrdersChatId,
  traderDryRun,
  traderLive,
  tradingEnabled,
} from "../config.ts";
import type { LiveMids } from "../hl.ts";
import { esc, telegramSend } from "../telegram.ts";
import type { HlExecClient, HlOrderResult } from "./hlExec.ts";
import {
  availablePairedUsd,
  conservativeEntrySpread,
  entryMinDistPp,
  entryTouchPx,
  entryTouchSpreadPp,
  entryWalkSpreadPp,
} from "./liquidity.ts";
import type { QfexOrderResult, QfexTradeClient } from "./qfexExec.ts";
import { fetchBookPositions } from "./positions.ts";
import {
  clipUsd,
  directionLabel,
  entryLeverage,
  formatExitBands,
  formatLevBands,
  planBook,
  positionDir,
  reduceOnly,
  sideOfMid,
  roundSize,
  signedNotional,
  targetSignedUsd,
  type TradeAction,
  type TradeDir,
} from "./signal.ts";
import { postTraderHeartbeat } from "./heartbeat.ts";

export interface TraderHandle {
  qfex: QfexTradeClient | null;
  hl: HlExecClient | null;
  lastTradeAt: number;
  lastHeartbeatAt: number;
  lastError: string | null;
  lastAction: string | null;
  busy: boolean;
}

export function emptyTrader(): TraderHandle {
  return {
    qfex: null,
    hl: null,
    lastTradeAt: 0,
    lastHeartbeatAt: 0,
    lastError: null,
    lastAction: null,
    busy: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  if (n > 0) return `+$${abs}`;
  if (n < 0) return `-$${abs}`;
  return `$${abs}`;
}

function fmtUsdAbs(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPp(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)} pp`;
}

function legFilled(
  res: { ok: boolean; avgPrice: number | null; filledQty?: number | null; filledSize?: number | null },
): boolean {
  const qty = res.filledQty ?? res.filledSize ?? null;
  return res.ok && (qty == null || qty > 0);
}

function sizeFromDeltaUsd(deltaUsd: number, px: number, decimals: number): {
  isBuy: boolean;
  size: number;
} {
  const isBuy = deltaUsd > 0;
  const size = roundSize(Math.abs(deltaUsd) / px, decimals);
  return { isBuy, size };
}

async function sendOrders(text: string): Promise<void> {
  await telegramSend(telegramOrdersChatId(), text);
}

async function notifyFill(opts: {
  dryRun: boolean;
  action: TradeAction;
  dir: TradeDir;
  fillStatus: "both" | "partial" | "failed";
  midPp: number;
  touchPp: number | null;
  executedPp: number | null;
  lev: number;
  targetUsd: number;
  oaiSide: string | null;
  sbSide: string | null;
  oaiSize: number;
  sbSize: number;
  oaiPx: number | null;
  sbJpy: number | null;
  oaiUsd: number;
  sbUsd: number;
  retrying?: boolean;
}): Promise<void> {
  const verb =
    opts.action === "take_profit"
      ? "TAKE PROFIT"
      : opts.action === "flatten"
        ? "FLATTEN"
        : opts.action === "scale"
          ? "SCALE"
          : "ENTER";
  const title = opts.dryRun
    ? `🧪 <b>DRY — would ${esc(opts.action)}</b>`
    : opts.fillStatus === "both"
      ? `🚀 <b>${verb} filled</b>`
      : opts.fillStatus === "partial"
        ? `⚠️ <b>${verb} PARTIAL</b>`
        : `❌ <b>${verb} failed</b>`;

  const lines = [
    `${title} · <b>OAI / SoftBank</b>`,
    "",
    `🧭 ${esc(directionLabel(opts.dir))} · ${opts.lev}× · ${esc(fmtUsdAbs(opts.targetUsd))}/side`,
    "",
    "📐 <b>Spreads</b>",
    `Mid: ${esc(fmtPp(opts.midPp))}`,
    `Touch: <b>${esc(opts.touchPp != null ? fmtPp(opts.touchPp) : "n/a")}</b>`,
    `Fill: <b>${esc(opts.executedPp != null ? fmtPp(opts.executedPp) : "n/a")}</b>`,
    "",
    "💱 <b>Fills</b>",
    `OAI ${esc(opts.oaiSide ?? "—")} ${esc(fmtPx(opts.oaiSize, 3))} @ $${esc(opts.oaiPx != null ? fmtPx(opts.oaiPx, 1) : "n/a")}  (${esc(fmtUsd(opts.oaiUsd))})`,
    `SoftBank ${esc(opts.sbSide ?? "—")} ${esc(fmtPx(opts.sbSize, 4))} @ ¥${esc(opts.sbJpy != null ? fmtPx(opts.sbJpy, 1) : "n/a")}  (${esc(fmtUsd(opts.sbUsd))} QFEX)`,
  ];
  if (opts.fillStatus === "partial") {
    lines.push(
      "",
      opts.retrying
        ? "<i>One leg incomplete — re-adding now. Completing both books matters more than the exact print.</i>"
        : "<i>One leg incomplete — will retry next tick.</i>",
    );
  }
  await sendOrders(lines.join("\n"));
}

export async function sendTraderStarted(live: boolean, dry: boolean): Promise<void> {
  await sendOrders(
    [
      live
        ? "<b>OAI / SoftBank trader live</b>"
        : dry
          ? "<b>OAI / SoftBank trader up · DRY RUN</b>"
          : "<b>OAI / SoftBank trader idle</b> — missing HL/QFEX keys",
      "Paired by $ notional · OAI USD vs SoftBank JPY (QFEX 1:1 USDC)",
      "Scale-in on executable TOB / $1k walk · mid only for TP through 8%",
      "Fill both legs first · retry incomplete",
      `Max ${MAX_LEV}× of min venue equity`,
      `Scale-in: ${formatLevBands()}`,
      `Take-profit: ${formatExitBands()}`,
    ].join("\n"),
  );
}

export async function runTraderTick(
  rt: TraderHandle,
  mids: LiveMids,
  oaiBase: number,
  sbBase: number,
): Promise<void> {
  if (!tradingEnabled()) return;
  if (rt.busy) return;
  rt.busy = true;
  try {
    if (Date.now() - rt.lastHeartbeatAt > 4_000) {
      rt.lastHeartbeatAt = Date.now();
      void postTraderHeartbeat({
        note: rt.lastAction,
      });
    }
    await runTraderTickInner(rt, mids, oaiBase, sbBase);
  } catch (err) {
    rt.lastError = err instanceof Error ? err.message : String(err);
    console.warn("[trader] tick failed", rt.lastError);
  } finally {
    rt.busy = false;
  }
}

async function runTraderTickInner(
  rt: TraderHandle,
  mids: LiveMids,
  oaiBase: number,
  sbBase: number,
): Promise<void> {
  const midSpread = listingSpreadPp(mids.oai, mids.sbUsd, oaiBase, sbBase);
  if (midSpread == null) throw new Error("spread null");

  const pos = await fetchBookPositions();
  const oaiNow = signedNotional(pos.oai.size, mids.oai);
  const sbNow = signedNotional(pos.softbank.size, mids.sbJpy);
  const baseUsd = Math.min(pos.oaiEquity, pos.sbEquity);
  const books = {
    oaiBids: mids.oaiBids,
    oaiAsks: mids.oaiAsks,
    sbBids: mids.sbBids,
    sbAsks: mids.sbAsks,
    usdJpy: mids.usdJpy,
  };
  const shortTob = entryTouchSpreadPp({
    ...books,
    dir: "short_oai",
    oaiBase,
    sbBase,
  });
  const longTob = entryTouchSpreadPp({
    ...books,
    dir: "long_oai",
    oaiBase,
    sbBase,
  });
  const shortWalk = entryWalkSpreadPp({
    ...books,
    dir: "short_oai",
    oaiBase,
    sbBase,
    usd: WALK_USD,
  });
  const longWalk = entryWalkSpreadPp({
    ...books,
    dir: "long_oai",
    oaiBase,
    sbBase,
    usd: WALK_USD,
  });
  const shortExec = shortWalk.filled
    ? conservativeEntrySpread("short_oai", shortTob, shortWalk.spreadPp)
    : null;
  const longExec = longWalk.filled
    ? conservativeEntrySpread("long_oai", longTob, longWalk.spreadPp)
    : null;
  const shortLev = shortExec == null ? 0 : entryLeverage(shortExec);
  const longLev = longExec == null ? 0 : entryLeverage(longExec);
  const posDir = positionDir(oaiNow, sbNow);
  let touchSpread: number | null;
  if (posDir === "short_oai") touchSpread = shortExec;
  else if (posDir === "long_oai") touchSpread = longExec;
  else if (shortLev >= longLev && shortLev > 0) touchSpread = shortExec;
  else if (longLev > 0) touchSpread = longExec;
  else touchSpread = null;
  const watchDir =
    touchSpread == null ? sideOfMid(midSpread) : sideOfMid(touchSpread);
  const touch = entryTouchPx({ dir: watchDir, ...books });
  const plan = planBook(midSpread, oaiNow, sbNow, baseUsd, touchSpread);
  const lev = plan.targetLev;
  const dir = plan.dir;
  const targetUsd = lev * baseUsd;
  let wanted = targetSignedUsd(dir, targetUsd);
  let dOai = clipUsd(wanted.oaiUsd - oaiNow);
  let dSb = clipUsd(wanted.sbUsd - sbNow);
  const spreadLabel = `mid ${fmtPp(midSpread)} shortTOB ${fmtPp(shortTob)} $1k ${fmtPp(shortWalk.spreadPp)} exec ${fmtPp(touchSpread)} eq ${fmtUsdAbs(pos.oaiEquity)}/${fmtUsdAbs(pos.sbEquity)}`;

  if (plan.action === "hold") {
    rt.lastAction = `hold ${dir} ${plan.currentLev.toFixed(2)}× ${spreadLabel} (entry ${plan.entryLev}× / tp ${plan.exitLev}×)`;
    return;
  }
  if (dOai === 0 && dSb === 0) {
    rt.lastAction = `${plan.action} skip Δ0 ${spreadLabel} target ${fmtUsdAbs(targetUsd)} (entry ${plan.entryLev}×)`;
    return;
  }

  if (plan.action === "enter" || plan.action === "scale") {
    const minDist = entryMinDistPp(plan.targetLev);
    const needUsd = Math.max(Math.abs(dOai), Math.abs(dSb));
    const avail = availablePairedUsd({
      dir,
      oaiBids: mids.oaiBids,
      oaiAsks: mids.oaiAsks,
      sbBids: mids.sbBids,
      sbAsks: mids.sbAsks,
      usdJpy: mids.usdJpy,
      oaiBase,
      sbBase,
      minDistPp: minDist,
      maxUsd: needUsd,
    });
    if (avail + 1e-6 < minClipUsd()) {
      rt.lastAction = `wait liq ${spreadLabel} need ${needUsd.toFixed(0)} avail ${avail.toFixed(0)}`;
      return;
    }
    const cap = Math.min(needUsd, avail);
    const oaiSign = Math.sign(dOai) || (dir === "short_oai" ? -1 : 1);
    const sbSign = Math.sign(dSb) || (dir === "short_oai" ? 1 : -1);
    dOai = clipUsd(oaiSign * cap);
    dSb = clipUsd(sbSign * cap);
    if (dOai === 0 && dSb === 0) {
      rt.lastAction = `wait liq clip ${spreadLabel}`;
      return;
    }
    wanted = { oaiUsd: oaiNow + dOai, sbUsd: sbNow + dSb };
  }

  const now = Date.now();
  const cooldown =
    Math.abs(dOai) > 0 && Math.abs(dSb) > 0
      ? TRADE_COOLDOWN_MS
      : RETRY_COOLDOWN_MS;
  if (now - rt.lastTradeAt < cooldown) return;

  const oaiTargetSize = roundSize(wanted.oaiUsd / mids.oai, OAI_SIZE_DECIMALS);
  const sbTargetSize = roundSize(wanted.sbUsd / mids.sbJpy, SB_SIZE_DECIMALS);
  const action = plan.action;

  rt.lastAction = `${action} ${dir} ${lev}× ${spreadLabel} ΔOAI ${fmtUsd(dOai)} ΔSB ${fmtUsd(dSb)}`;

  if (!traderLive() || !rt.hl || !rt.qfex) {
    console.warn(
      `[trader] not live — ${rt.lastAction} enabled=${tradingEnabled()} dry=${traderDryRun()} hl=${Boolean(rt.hl)} qfex=${Boolean(rt.qfex)} key=${Boolean(process.env.HL_PRIVATE_KEY)} wallet=${Boolean(process.env.HL_WALLET_ADDRESS)}`,
    );
    return;
  }

  let remainingOai = dOai;
  let remainingSb = dSb;
  let lastOai: HlOrderResult = {
    ok: false,
    avgPrice: null,
    filledSize: null,
    raw: null,
  };
  let lastSb: QfexOrderResult = {
    ok: false,
    orderId: null,
    status: "NOT_SENT",
    avgPrice: null,
    filledQty: null,
    raw: null,
  };
  let oaiFillUsd = 0;
  let sbFillUsd = 0;
  let oaiFillSz = 0;
  let sbFillSz = 0;
  let oaiSizeNow = pos.oai.size;
  let sbSizeNow = pos.softbank.size;

  for (let attempt = 0; attempt < HL_SLIPPAGE_SCHEDULE_BPS.length; attempt++) {
    const slip = HL_SLIPPAGE_SCHEDULE_BPS[attempt]!;
    const oaiClip = Math.abs(remainingOai) >= 150 ? remainingOai : 0;
    const sbClip = Math.abs(remainingSb) >= 150 ? remainingSb : 0;
    if (oaiClip === 0 && sbClip === 0) break;

    const oaiRef =
      (action === "enter" || action === "scale") && touch
        ? touch.oaiPx
        : mids.oai;
    const oaiNext = sizeFromDeltaUsd(oaiClip, oaiRef, OAI_SIZE_DECIMALS);
    const sbNext = sizeFromDeltaUsd(
      sbClip,
      (action === "enter" || action === "scale") && touch
        ? touch.sbJpy
        : mids.sbJpy,
      SB_SIZE_DECIMALS,
    );

    const jobs: Array<Promise<void>> = [];
    if (oaiClip !== 0 && oaiNext.size > 0) {
      jobs.push(
        (async () => {
          lastOai = await rt.hl!.marketOrder({
            isBuy: oaiNext.isBuy,
            size: oaiNext.size,
            refPx: oaiRef,
            slippageBps: slip,
            reduceOnly: reduceOnly(oaiSizeNow, oaiTargetSize),
            coin: OAI_COIN,
            priceDecimals: OAI_PRICE_DECIMALS,
            sizeDecimals: OAI_SIZE_DECIMALS,
          });
        })(),
      );
    }
    if (sbClip !== 0 && sbNext.size > 0) {
      jobs.push(
        (async () => {
          lastSb = await rt.qfex!.marketOrder({
            side: sbNext.isBuy ? "BUY" : "SELL",
            quantity: sbNext.size,
            symbol: SB_SYMBOL,
            reduceOnly: reduceOnly(sbSizeNow, sbTargetSize),
          });
        })(),
      );
    }
    await Promise.all(jobs);

    const oaiQty = lastOai.filledSize ?? 0;
    const sbQty = lastSb.filledQty ?? 0;
    const oaiPxFill = lastOai.avgPrice ?? mids.oai;
    const sbPxFill = lastSb.avgPrice ?? mids.sbJpy;
    if (legFilled(lastOai) && oaiQty > 0) {
      oaiFillUsd += (oaiNext.isBuy ? 1 : -1) * oaiQty * oaiPxFill;
      oaiFillSz += oaiQty;
    }
    if (legFilled(lastSb) && sbQty > 0) {
      sbFillUsd += (sbNext.isBuy ? 1 : -1) * sbQty * sbPxFill;
      sbFillSz += sbQty;
    }

    await sleep(400);
    try {
      const after = await fetchBookPositions();
      oaiSizeNow = after.oai.size;
      sbSizeNow = after.softbank.size;
      remainingOai = wanted.oaiUsd - signedNotional(after.oai.size, mids.oai);
      remainingSb = wanted.sbUsd - signedNotional(after.softbank.size, mids.sbJpy);
    } catch (err) {
      console.warn(
        "[trader] position refresh failed",
        err instanceof Error ? err.message : err,
      );
      remainingOai -= (oaiNext.isBuy ? 1 : -1) * ((lastOai.filledSize ?? 0) * (lastOai.avgPrice ?? mids.oai));
      remainingSb -= (sbNext.isBuy ? 1 : -1) * ((lastSb.filledQty ?? 0) * (lastSb.avgPrice ?? mids.sbJpy));
    }

    const oaiDone = Math.abs(remainingOai) < 150;
    const sbDone = Math.abs(remainingSb) < 150;
    const fillStatus: "both" | "partial" | "failed" =
      oaiDone && sbDone
        ? "both"
        : oaiFillSz > 0 || sbFillSz > 0 || legFilled(lastOai) || legFilled(lastSb)
          ? "partial"
          : "failed";

    const oaiFillPx = lastOai.avgPrice;
    const sbFillJpy = lastSb.avgPrice;
    const sbFillUsdPx =
      sbFillJpy != null && mids.usdJpy > 0 ? sbFillJpy / mids.usdJpy : null;
    const executedPp =
      oaiFillPx != null && sbFillUsdPx != null
        ? listingSpreadPp(oaiFillPx, sbFillUsdPx, oaiBase, sbBase)
        : null;

    const retrying =
      fillStatus !== "both" && attempt < HL_SLIPPAGE_SCHEDULE_BPS.length - 1;
    await notifyFill({
      dryRun: false,
      action,
      dir,
      fillStatus,
      midPp: midSpread,
      touchPp: touchSpread,
      executedPp,
      lev,
      targetUsd,
      oaiSide: oaiClip === 0 ? null : oaiNext.isBuy ? "BUY" : "SELL",
      sbSide: sbClip === 0 ? null : sbNext.isBuy ? "BUY" : "SELL",
      oaiSize: oaiFillSz || oaiNext.size,
      sbSize: sbFillSz || sbNext.size,
      oaiPx: oaiFillPx,
      sbJpy: sbFillJpy,
      oaiUsd: oaiFillUsd || oaiClip,
      sbUsd: sbFillUsd || sbClip,
      retrying,
    });

    rt.lastTradeAt = Date.now();
    console.log(
      `[trader] ${action} ${fillStatus} attempt=${attempt + 1} ${spreadLabel} oai=${lastOai.avgPrice ?? "n/a"} sb=${lastSb.avgPrice ?? "n/a"} remOAI=${remainingOai.toFixed(0)} remSB=${remainingSb.toFixed(0)}`,
    );

    if (fillStatus === "both") break;
    if (!retrying) break;
    await sleep(RETRY_COOLDOWN_MS);
  }
}

export async function ensureHlLeverage(hl: HlExecClient): Promise<void> {
  try {
    await hl.setIsolatedLeverage(OAI_COIN, OAI_ISOLATED_LEV);
    console.log(`[trader] OAI isolated leverage set to ${OAI_ISOLATED_LEV}×`);
  } catch (err) {
    console.warn(
      "[trader] set OAI leverage failed",
      err instanceof Error ? err.message : err,
    );
  }
}
