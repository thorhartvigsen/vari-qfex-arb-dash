import { createServer } from "node:http";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
  fmtPp,
  fmtPx,
  healthPort,
  hysteresisPp,
  listingSpreadPp,
  pollMs,
  telegramChatId,
} from "./config.ts";
import { fetchListingBases, fetchLiveMids } from "./hl.ts";
import { crossedLevels, freshArmed, type AlertLevel } from "./levels.ts";
import { esc, telegramSend } from "./telegram.ts";

const once = process.argv.includes("--once");

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
  lastError: string | null;
  ticks: number;
  alerts: number;
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
  lastError: null,
  ticks: 0,
  alerts: 0,
};

const armed = freshArmed();
let prevSpread: number | null = null;
let lastSentId: AlertLevel["id"] | null = null;
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

async function tick(): Promise<void> {
  const { oai, sbJpy, usdJpy, sbUsd } = await fetchLiveMids();
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
      console.log(`[alert] skip consecutive converge @ ${fmtPp(spread)}`);
      continue;
    }
    const text = alertBody(level, spread, oai, sbJpy, sbUsd, usdJpy);
    await telegramSend(telegramChatId(), text);
    lastSentId = level.id;
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
