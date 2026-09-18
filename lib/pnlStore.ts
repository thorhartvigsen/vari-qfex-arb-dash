import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { get, head, list, put } from "@vercel/blob";
import type { PnlPersist, PnlPoint } from "@/lib/pnlTypes";
import { START_COLLATERAL } from "@/lib/pnlTypes";

export type { PnlPoint };

export const PNL_BLOB_PATH = "oai-softbank/pnl.json";
export const SNAPSHOT_MS = 3 * 60 * 1000;
export const SNAPSHOT_DEDUP_MS = 2.5 * 60 * 1000;
export const MAX_PNL_POINTS = 20_000;

export interface PnlStore {
  updatedAt: string;
  points: PnlPoint[];
}

let memoryStore: PnlStore | null = null;

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.cwd() === "/var/task",
  );
}

function blobEnabled(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
}

export function pnlPersistMode(): PnlPersist {
  if (blobEnabled()) return "blob";
  if (isServerless()) return "ephemeral";
  return "local";
}

function localPath(): string {
  if (isServerless()) {
    return path.join("/tmp", "vari-qfex-arb-dash", "oai-softbank-pnl.json");
  }
  return path.join(process.cwd(), ".data", "oai-softbank-pnl.json");
}

function emptyStore(): PnlStore {
  return { updatedAt: new Date(0).toISOString(), points: [] };
}

/** Deposit print so the series does not start at live equity. */
export const PNL_GENESIS_MS = Date.parse("2026-09-17T00:00:00.000Z");
export const PNL_GENESIS: PnlPoint = {
  time: PNL_GENESIS_MS,
  qfex: START_COLLATERAL / 2,
  hl: START_COLLATERAL / 2,
  total: START_COLLATERAL,
};

function needsGenesis(points: PnlPoint[]): boolean {
  const first = points[0];
  if (!first) return true;
  return first.time > PNL_GENESIS_MS + 60_000;
}

function parseStore(raw: string): PnlStore {
  if (!raw.trim()) return emptyStore();
  const parsed = JSON.parse(raw) as PnlStore;
  if (!parsed || !Array.isArray(parsed.points)) {
    throw new Error("pnl store missing points");
  }
  return parsed;
}

function mergePoints(...lists: PnlPoint[][]): PnlPoint[] {
  const byMinute = new Map<number, PnlPoint>();
  for (const list of lists) {
    for (const point of list) {
      if (!Number.isFinite(point.time) || !(point.total > 0)) continue;
      const key = Math.round(point.time / 60_000);
      const prev = byMinute.get(key);
      if (!prev || point.time >= prev.time) byMinute.set(key, point);
    }
  }
  return [...byMinute.values()]
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_PNL_POINTS);
}

function mergeStores(...stores: Array<PnlStore | null | undefined>): PnlStore {
  const points = mergePoints(...stores.map((store) => store?.points ?? []));
  const updatedAt =
    stores
      .map((store) => store?.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? new Date().toISOString();
  return { updatedAt, points };
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

async function readLocal(): Promise<PnlStore> {
  try {
    const raw = await fs.readFile(localPath(), "utf8");
    return parseStore(raw);
  } catch {
    return emptyStore();
  }
}

async function writeLocal(store: PnlStore): Promise<void> {
  const filePath = localPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store), "utf8");
}

async function readBlobBody(pathnameOrUrl: string): Promise<PnlStore | null> {
  const result = await get(pathnameOrUrl, {
    access: "public",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return parseStore(await streamToText(result.stream));
}

async function readBlob(): Promise<PnlStore> {
  try {
    const direct = await readBlobBody(PNL_BLOB_PATH);
    if (direct) return direct;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/not\s*found|404|does not exist/i.test(message)) {
      console.warn("[pnl] blob get failed", message);
    }
  }

  try {
    const meta = await head(PNL_BLOB_PATH);
    const fromUrl = await readBlobBody(meta.url);
    if (fromUrl) return fromUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/not\s*found|404|does not exist/i.test(message)) {
      console.warn("[pnl] blob head failed", message);
    }
  }

  try {
    const listed = await list({ prefix: PNL_BLOB_PATH, limit: 10 });
    const match =
      listed.blobs.find((row) => row.pathname === PNL_BLOB_PATH) ??
      listed.blobs[0];
    if (match) {
      const fromList = await readBlobBody(match.url);
      if (fromList) return fromList;
    }
  } catch (err) {
    console.warn(
      "[pnl] blob list failed",
      err instanceof Error ? err.message : err,
    );
  }

  return emptyStore();
}

async function writeBlob(store: PnlStore): Promise<void> {
  await put(PNL_BLOB_PATH, JSON.stringify(store), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

export async function readPnlStore(): Promise<PnlStore> {
  const persisted = blobEnabled() ? await readBlob() : await readLocal();
  const merged = mergeStores(memoryStore, persisted);
  if (!needsGenesis(merged.points)) {
    memoryStore = merged;
    return merged;
  }
  const seeded: PnlStore = {
    updatedAt: new Date().toISOString(),
    points: mergePoints([PNL_GENESIS], merged.points),
  };
  memoryStore = seeded;
  if (blobEnabled()) await writeBlob(seeded);
  else await writeLocal(seeded);
  return seeded;
}

export async function writePnlStore(store: PnlStore): Promise<void> {
  const merged = mergeStores(memoryStore, store);
  memoryStore = merged;
  if (blobEnabled()) {
    await writeBlob(merged);
    return;
  }
  if (isServerless()) {
    console.warn("[pnl] no Vercel Blob store — 3m snapshots will not persist");
  }
  await writeLocal(merged);
}

export async function appendPnlPoint(point: PnlPoint): Promise<PnlStore> {
  const store = await readPnlStore();
  const last = store.points[store.points.length - 1];
  if (last && Math.abs(point.time - last.time) < SNAPSHOT_DEDUP_MS) {
    return store;
  }
  const next: PnlStore = {
    updatedAt: new Date().toISOString(),
    points: mergePoints(store.points, [point]),
  };
  if (next.points.length < store.points.length) {
    return store;
  }
  await writePnlStore(next);
  return next;
}
