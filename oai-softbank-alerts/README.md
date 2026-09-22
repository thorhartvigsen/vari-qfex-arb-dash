# OAI / SoftBank Telegram alerts

Railway worker in this repo (`oai-softbank-alerts/`). The Next.js dash still deploys on Vercel from the repo root.

Watches Entropy `io:OAI` vs QFEX `SOFTBANK-JPY` listing-relative spread (JPY converted to USD with TradeXYZ `xyz:JPY`) and pings Telegram when it **crosses**:

| Level | Action |
|---|---|
| **+18** | short OAI / long SoftBank |
| **+8** | flatten (converge) |
| **−2** | long OAI / short SoftBank |

Spread is percentage points: OAI % since 2 Sep 13:00 UTC listing − SoftBank **USD** % since listing (`¥ / USDJPY`). Same series as `/oai-softbank`.

Each spread level fires once per visit, then re-arms after the print moves **0.75 pp** away. A second **+8 converge** ping is skipped for **12 hours** if the last spread message was also +8; +18 / −2 always send.

Liquidation distance (chat `-5325885280`) fires when **either venue** is **15%**, then **10%**, then **5%** of price from its liquidation. Re-arms after the buffer recovers 2 pp above that level. Checked every **5 seconds**. QFEX SoftBank liq is in JPY (QFEX PnLs yen 1:1 into USDC).

The same risk chat also fires when **USD notional** (Entropy OAI vs QFEX SoftBank) differs by **more than $10,000**. Re-arms after the gap falls $2,000 below that ($8,000).

## Live trader (same Railway service)

IOC / market both legs, sized in **account dollars** (OAI USD notional vs SoftBank `size × JPY`, QFEX’s yen-as-USDC). Completing both books beats capturing the exact print; a missed or partial leg is pinged on **orders chat `-5344711654`** and retried.

Target leverage vs **|listing-spread − 8 pp|**, max **3×** of the thinner venue’s equity.

**Scale-in** (add when the print is this far from 8%):

| Distance from 8% | Spreads | Size |
|---|---|---|
| 2 pp | 6% / 10% | 0.3× |
| 3 pp | 5% / 11% | 0.6× |
| 4.5 pp | 3.5% / 12.5% | 1× |
| 6 pp | 2% / 14% | 1.5× |
| 10 pp | −2% / 18% | 2× |
| 14 pp | −6% / 22% | 2.5× |
| 18 pp | −10% / 26% | 3× |

**Take-profit** (reduce as it mean-reverts; does not immediately undo a scale-in):

| Distance from 8% | Spreads | Reduce to |
|---|---|---|
| 0 (mid) | 8% | 0× |
| 1 pp | 7% / 9% | 0.3× |
| 2 pp | 6% / 10% | 0.6× |
| 3.5 pp | 4.5% / 11.5% | 1× |
| 5 pp | 3% / 13% | 1.5× |
| 8 pp | 0% / 16% | 2× |
| 10 pp | −2% / 18% | 2.5× |

Scale-in size is the USD gap to target, **capped to paired L2 depth** that still prints at least that entry rung. Flatten / TP sends the full reduce (fill both first).

Above mid: short OAI / long SoftBank. Below mid: long OAI / short SoftBank.

Heartbeat to the dash (green light):

`TRADER_STATUS_URL=https://vari-qfex-arb-dash.vercel.app/api/oai-softbank/trader`

Set on the Railway service (same keys as the dash / US500 trader):

```
HL_WALLET_ADDRESS=
HL_PRIVATE_KEY=0x…
QFEX_PUBLIC_KEY=
QFEX_SECRET_KEY=
TRADING_ENABLED=true
TRADER_DRY_RUN=false
```

`TRADING_ENABLED=false` or `TRADER_DRY_RUN=true` keeps the watcher/liq bot and does not send orders.


## Local

```bash
cd oai-softbank-alerts
npm install
npm run once          # print live spread, no loop
npm start             # poll + Telegram + health on :8080
```

Bot token and chat `-5462179063` are already in `src/config.ts` (same bot as tgalerter). Startup sends one “watcher up” message.

## Railway (same GitHub repo)

1. Railway → **New service** → **GitHub repo** `vari-qfex-arb-dash`.
2. **Settings → Root Directory** = `oai-softbank-alerts` so it uses this folder’s Dockerfile, not the Next app.
3. Builder = **Dockerfile** if it did not pick `railway.toml`.
4. No Telegram variables needed — bot + chat are in `src/config.ts`. Leave `PORT` alone.
5. Settings → Deploy → **Restart policy = Always**. Do **not** add an HTTP healthcheck on the wrong port. The process binds `0.0.0.0:$PORT` and serves `/health`.
6. Deploy. Logs: `[watch] health on 0.0.0.0:…` then a `watcher up` Telegram.

The bot must be in that chat (add it to the group if the id is a group).
