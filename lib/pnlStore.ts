import { promises as fs } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";

export const PNL_BLOB_PATH = "oai-softbank/pnl.json";
export const SNAPSHOT_MS = 30 * 60 * 1000;
export const SNAPSHOT_DEDUP_MS = 25 * 60 * 1000;
export const MAX_PNL_POINTS = 20_000;

export interface PnlPoint {
  time: number;
  qfex: number;
  hl: number;
  total: number;
}

export interface PnlStore {
  updatedAt: string;
  points: PnlPoint[];
}

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

function localPath(): string {
  if (isServerless()) {
    return path.join("/tmp", "vari-qfex-arb-dash", "oai-softbank-pnl.json");
  }
  return path.join(process.cwd(), ".data", "oai-softbank-pnl.json");
}

function emptyStore(): PnlStore {
  return { updatedAt: new Date(0).toISOString(), points: [] };
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

async function readLocal(): Promise<PnlStore> {
  try {
    const raw = await fs.readFile(localPath(), "utf8");
    const parsed = JSON.parse(raw) as PnlStore;
    if (!parsed || !Array.isArray(parsed.points)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

async function writeLocal(store: PnlStore): Promise<void> {
  const filePath = localPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store), "utf8");
}

async function readBlob(): Promise<PnlStore> {
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(PNL_BLOB_PATH, {
      access: "private",
      useCache: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not\s*found|404|does not exist/i.test(message)) return emptyStore();
    throw err;
  }
  if (!result) return emptyStore();
  const status = Number(result.statusCode);
  if (status === 404) return emptyStore();
  if (status !== 200 || !result.stream) {
    throw new Error(`pnl blob get failed status=${status || "unknown"}`);
  }
  const raw = await streamToText(result.stream);
  if (!raw.trim()) return emptyStore();
  const parsed = JSON.parse(raw) as PnlStore;
  if (!parsed || !Array.isArray(parsed.points)) {
    throw new Error("pnl blob missing points");
  }
  return parsed;
}

async function writeBlob(store: PnlStore): Promise<void> {
  await put(PNL_BLOB_PATH, JSON.stringify(store), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readPnlStore(): Promise<PnlStore> {
  if (blobEnabled()) return readBlob();
  return readLocal();
}

export async function writePnlStore(store: PnlStore): Promise<void> {
  if (blobEnabled()) {
    await writeBlob(store);
    return;
  }
  if (isServerless()) {
    console.warn("[pnl] no Vercel Blob store — 30m snapshots will not persist");
  }
  await writeLocal(store);
}

export async function appendPnlPoint(point: PnlPoint): Promise<PnlStore> {
  const store = await readPnlStore();
  const last = store.points[store.points.length - 1];
  if (last && Math.abs(point.time - last.time) < SNAPSHOT_DEDUP_MS) {
    return store;
  }
  const points = [...store.points, point]
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_PNL_POINTS);
  const next: PnlStore = {
    updatedAt: new Date().toISOString(),
    points,
  };
  await writePnlStore(next);
  return next;
}
