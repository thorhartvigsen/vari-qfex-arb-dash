import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";

export const TRADER_BLOB_PATH = "oai-softbank/trader-status.json";
export const TRADER_ONLINE_MS = 20_000;

export interface OaiSbTraderStatus {
  updatedAt: string;
  online: boolean;
  live: boolean;
  dryRun: boolean;
  host?: string;
  note?: string | null;
}

function blobEnabled(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
}

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.cwd() === "/var/task",
  );
}

function localPath(): string {
  if (isServerless()) {
    return path.join("/tmp", "vari-qfex-arb-dash", "oai-softbank-trader.json");
  }
  return path.join(process.cwd(), ".data", "oai-softbank-trader.json");
}

function emptyStatus(): OaiSbTraderStatus {
  return {
    updatedAt: new Date(0).toISOString(),
    online: false,
    live: false,
    dryRun: true,
  };
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

async function readRaw(): Promise<OaiSbTraderStatus> {
  if (blobEnabled()) {
    try {
      const result = await get(TRADER_BLOB_PATH, {
        access: "public",
        useCache: false,
      });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return emptyStatus();
      }
      return JSON.parse(await streamToText(result.stream)) as OaiSbTraderStatus;
    } catch {
      return emptyStatus();
    }
  }
  try {
    const raw = await fs.readFile(localPath(), "utf8");
    return JSON.parse(raw) as OaiSbTraderStatus;
  } catch {
    return emptyStatus();
  }
}

export async function writeOaiSbTraderStatus(
  status: Omit<OaiSbTraderStatus, "updatedAt" | "online">,
): Promise<OaiSbTraderStatus> {
  const next: OaiSbTraderStatus = {
    updatedAt: new Date().toISOString(),
    online: true,
    live: Boolean(status.live),
    dryRun: Boolean(status.dryRun),
    host: status.host,
    note: status.note ?? null,
  };
  const body = JSON.stringify(next);
  if (blobEnabled()) {
    await put(TRADER_BLOB_PATH, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 5,
    });
    return next;
  }
  await fs.mkdir(path.dirname(localPath()), { recursive: true });
  await fs.writeFile(localPath(), body, "utf8");
  return next;
}

export async function readOaiSbTraderStatus(): Promise<
  OaiSbTraderStatus & {
    ageMs: number;
    isLive: boolean;
    isWatching: boolean;
  }
> {
  const status = await readRaw();
  const ageMs = Date.now() - Date.parse(status.updatedAt || "0");
  const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs < TRADER_ONLINE_MS;
  const online = fresh && status.online !== false;
  const isLive = online && status.live === true;
  const isWatching = online && !isLive;
  return {
    ...status,
    online,
    ageMs: Number.isFinite(ageMs) ? ageMs : Infinity,
    isLive,
    isWatching,
  };
}
