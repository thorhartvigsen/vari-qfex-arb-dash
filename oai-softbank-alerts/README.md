# OAI / SoftBank Telegram alerts

Railway worker in this repo (`oai-softbank-alerts/`). The Next.js dash still deploys on Vercel from the repo root.

Watches Entropy `io:OAI` vs TradeXYZ `xyz:SOFTBANK` listing-relative spread and pings Telegram when it **crosses**:

| Level | Action |
|---|---|
| **+18** | short OAI / long SoftBank |
| **+8** | flatten (converge) |
| **−2** | long OAI / short SoftBank |

Spread is percentage points: OAI % since 2 Sep 13:00 UTC listing − SoftBank % since listing. Same series as `/oai-softbank`.

Each level fires once per visit, then re-arms after the print moves **0.75 pp** away so a hover on +8 does not spam.

## Local

```bash
cd oai-softbank-alerts
cp .env.example .env
# put TELEGRAM_BOT_TOKEN in .env
npm install
npm run once          # print live spread, no loop
npm start             # poll + Telegram + health on :8080
```

Startup sends one “watcher up” message to chat `-5462179063`.

## Railway (same GitHub repo)

1. Railway → **New service** → **GitHub repo** `vari-qfex-arb-dash`.
2. **Settings → Root Directory** = `oai-softbank-alerts` so it uses this folder’s Dockerfile, not the Next app.
3. Builder = **Dockerfile** if it did not pick `railway.toml`.
4. **Variables:**

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_CHAT_ID` | `-5462179063` |
| `POLL_MS` | `2000` |
| `PORT` | Railway sets this |

5. Settings → Deploy → **Restart policy = Always**. Do **not** add an HTTP healthcheck on the wrong port. The process binds `0.0.0.0:$PORT` and serves `/health`.
6. Deploy. Logs: `[watch] health on 0.0.0.0:…` then a `watcher up` Telegram.

The bot must be in that chat (add it to the group if the id is a group).
