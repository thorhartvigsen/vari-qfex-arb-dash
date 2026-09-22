import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { HL_INFO, OAI_COIN, OAI_DEX } from "../config.ts";

interface Hip3Asset {
  assetId: number;
  szDecimals: number;
}

const assetCache = new Map<string, Hip3Asset>();

export async function resolveIoAsset(coin: string = OAI_COIN): Promise<Hip3Asset> {
  const cached = assetCache.get(coin);
  if (cached) return cached;

  const dexes = (await (
    await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "perpDexs" }),
    })
  ).json()) as Array<{ name?: string } | null>;

  const dexIdx = dexes.findIndex((d, i) => i > 0 && d && d.name === OAI_DEX);
  if (dexIdx < 1) throw new Error(`${OAI_DEX} dex not found in perpDexs`);
  const builderPos = dexIdx - 1;

  const meta = (await (
    await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta", dex: OAI_DEX }),
    })
  ).json()) as {
    universe: Array<{ name: string; szDecimals?: number }>;
  };

  const assetIndex = meta.universe.findIndex((u) => u.name === coin);
  if (assetIndex < 0) throw new Error(`${coin} not in ${OAI_DEX} universe`);
  const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 3;
  const asset: Hip3Asset = {
    assetId: 110_000 + builderPos * 10_000 + assetIndex,
    szDecimals,
  };
  assetCache.set(coin, asset);
  return asset;
}

export interface HlOrderResult {
  ok: boolean;
  avgPrice: number | null;
  filledSize: number | null;
  raw: unknown;
}

export class HlExecClient {
  private readonly client: hl.ExchangeClient;
  readonly address: `0x${string}`;
  readonly accountAddress: `0x${string}`;

  constructor(privateKey: `0x${string}`) {
    const wallet = privateKeyToAccount(privateKey);
    this.address = wallet.address;
    const master = process.env.HL_WALLET_ADDRESS;
    this.accountAddress =
      master && master.startsWith("0x")
        ? (master as `0x${string}`)
        : wallet.address;
    this.client = new hl.ExchangeClient({
      wallet,
      transport: new hl.HttpTransport(),
    });
  }

  async setIsolatedLeverage(coin: string, leverage: number): Promise<void> {
    const { assetId } = await resolveIoAsset(coin);
    await this.client.updateLeverage({
      asset: assetId,
      isCross: false,
      leverage,
    });
  }

  async marketOrder(opts: {
    isBuy: boolean;
    size: number;
    refPx: number;
    slippageBps: number;
    reduceOnly?: boolean;
    coin?: string;
    priceDecimals: number;
    sizeDecimals: number;
  }): Promise<HlOrderResult> {
    const slip = Math.max(0, opts.slippageBps) / 10_000;
    const rawPx = opts.isBuy
      ? opts.refPx * (1 + slip)
      : opts.refPx * (1 - slip);
    const coin = opts.coin ?? OAI_COIN;
    try {
      const { assetId, szDecimals } = await resolveIoAsset(coin);
      const sizeDecimals = Math.min(opts.sizeDecimals, szDecimals);
      const pxFactor = 10 ** opts.priceDecimals;
      const px = (Math.round(rawPx * pxFactor) / pxFactor).toFixed(
        opts.priceDecimals,
      );
      const szFactor = 10 ** sizeDecimals;
      const szNum = Math.floor(opts.size * szFactor + 1e-12) / szFactor;
      const sz = szNum.toFixed(sizeDecimals);
      if (szNum <= 0) {
        return {
          ok: false,
          avgPrice: null,
          filledSize: null,
          raw: { error: `HL size rounded to 0 (raw=${opts.size})` },
        };
      }

      console.log(
        `[hl] IOC ${coin} ${opts.isBuy ? "BUY" : "SELL"} sz=${sz} px=${px} a=${assetId}`,
      );

      const result = await this.client.order({
        orders: [
          {
            a: assetId,
            b: opts.isBuy,
            p: px,
            s: sz,
            r: Boolean(opts.reduceOnly),
            t: { limit: { tif: "Ioc" } },
          },
        ],
        grouping: "na",
      });

      const status = result.response.data.statuses[0] as
        | { filled: { avgPx: string; totalSz: string } }
        | { resting: { oid: number } }
        | { error: string }
        | string
        | undefined;

      if (status && typeof status === "object" && "filled" in status) {
        return {
          ok: true,
          avgPrice: Number(status.filled.avgPx),
          filledSize: Number(status.filled.totalSz),
          raw: status,
        };
      }
      if (status && typeof status === "object" && "error" in status) {
        console.warn(`[hl] order error ${coin}`, status.error);
        return { ok: false, avgPrice: null, filledSize: null, raw: status };
      }
      return {
        ok: false,
        avgPrice: null,
        filledSize: null,
        raw: status ?? result,
      };
    } catch (err) {
      console.error(`[hl] order threw ${coin}`, err);
      return {
        ok: false,
        avgPrice: null,
        filledSize: null,
        raw: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

export async function createHlExecFromEnv(): Promise<HlExecClient> {
  const key = process.env.HL_PRIVATE_KEY;
  if (!key?.startsWith("0x")) {
    throw new Error("HL_PRIVATE_KEY missing or invalid");
  }
  return new HlExecClient(key as `0x${string}`);
}
