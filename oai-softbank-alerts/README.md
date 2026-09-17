# OAI / SoftBank Telegram alerts

Railway worker in this repo (`oai-softbank-alerts/`). The Next.js dash still deploys on Vercel from the repo root.

Watches Entropy `io:OAI` vs QFEX `SOFTBANK-JPY` listing-relative spread (JPY converted to USD with TradeXYZ `xyz:JPY`) and pings Telegram when it **crosses**:

| Level | Action |
|---|---|
| **+18** | short OAI / long SoftBank |
| **+8** | flatten (converge) |
| **−2** | long OAI / short SoftBank |

Spread is percentage points: OAI % since 2 Sep 13:00 UTC listing − SoftBank **USD** % since listing (`¥ / USDJPY`). Same series as `/oai-softbank`.

Each spread level fires once per visit, then re-arms after the print moves **0.75 pp** away so a hover on +8 does not spam.

Liquidation distance (chat `-5325885280`) fires when **either venue** is **15%**, then **10%**, then **5%** of price from its liquidation. Re-arms after the buffer recovers 2 pp above that level. Checked every **5 seconds**. QFEX SoftBank liq is in JPY (QFEX PnLs yen 1:1 into USDC).

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
