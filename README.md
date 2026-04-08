# Wanna Bet Bot

[![CI](https://github.com/llrhook/wanna-bet/actions/workflows/ci.yml/badge.svg)](https://github.com/llrhook/wanna-bet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Discord gambling-economy bot. Per-guild virtual currency, two-sided bet pools with escrow, an elected admin who can grant/seize/force-resolve, and a daily inflation tap. TypeScript + discord.js v14 + SQLite.

> **[➤ Add Wanna Bet Bot to your Discord server](https://discord.com/oauth2/authorize?client_id=1491240385031311470&permissions=2147568640&integration_type=0&scope=bot+applications.commands)**
> No setup, no hosting, no `.env` — click, pick a server, authorize, then run `/help`.

The Quickstart below is for **self-hosting** your own copy of the bot. If you just want to use the existing public bot in your Discord server, the link above is all you need.

## Quickstart

### 1. Create the bot in Discord

1. https://discord.com/developers/applications → New Application → Bot tab → Add Bot
2. Enable **SERVER MEMBERS INTENT** (required)
3. OAuth2 → URL Generator → scopes: `bot` + `applications.commands`, permissions: Send Messages, Embed Links, Read Message History
4. Visit the generated URL, add the bot to your server
5. Copy the bot token

### 2. Run it locally

```bash
git clone https://github.com/llrhook/wanna-bet.git
cd wanna-bet
npm install
cp .env.example .env        # paste your DISCORD_TOKEN
npm run db:migrate          # creates data/wanna-bet.db
npm run register-commands   # one-time, registers slash commands
npm run dev                 # tsx watch — auto-reloads on save
```

> ⚠️ On macOS, **don't use Docker for local dev**. Docker Desktop's network layer adds multi-second latency to Discord's gateway and breaks interaction acks. Run natively as above. Docker on Linux is fine.

### 3. Deploy to a VPS (Docker)

```bash
git clone https://github.com/llrhook/wanna-bet.git
cd wanna-bet
cp .env.example .env && nano .env
docker compose up -d --build
docker compose run --rm wannabet node dist/commands/register.js
```

`docker compose down` stops it (data preserved in named volume), `docker compose logs -f` tails logs.

## Commands

| Command | What it does |
|---|---|
| `/register` | Join the economy. New players start with $100. |
| `/unregister` | Leave the economy. Balance preserved for re-registration. |
| `/balance` | Your wallet balance. |
| `/daily` | Claim $5/day. Resets at UTC midnight. |
| `/wanna-bet` | Create a two-sided pool. Pick Side A label, Side B label, your side, your wager. |
| `/accept <bet-id>` | Join an open bet on either side. |
| `/decline <bet-id>` | Decline a direct bet (full refund — fee included). |
| `/resolve <bet-id> <A\|B\|neither>` | Propose an outcome. Other participants confirm or dispute via DM buttons. |
| `/bets active` | List open bets. |
| `/bank` | Bank balance + cap. |
| `/leaderboard` | Top 10 by balance. |
| `/stats [@user]` | W/L, total wagered, net P/L, biggest win/loss, current streak. |
| `/history [@user]` | Paginated bet history. |
| `/vote-admin start\|nominate\|cast\|status` | Elect a server admin. 1-hour window, ≥50% quorum, plurality wins, ties random. |
| `/admin grant\|seize\|resolve\|cancel\|ban\|unban` | Admin powers (elected admin only). Cannot print money or change rates. |
| `/setup role` | Set the gambler role required for lobby bets (Manage Guild permission). |

## Economy model

All amounts stored as integer **cents**. $1.00 = 100.

- **Fee per bet side**: `max($1, 1% of wager)`, deducted from the wager (not on top). $5 wager → $5 leaves your wallet, $1 to bank, $4 enters the pool.
- **Settlement**: winners get their stake back plus a pro-rata share of the loser pool (`floor(stake / total_winner_stake * loser_pool)`). Rounding remainder goes to the largest-stake winner.
- **"Neither" outcome**: each participant gets their stake back, fees stay in bank.
- **Inflation taps**: starting balance $100, daily $5 (per-user, UTC midnight). The bank only grows from bet fees — no automatic seeding.

## Architecture

`BalanceService.transfer()` is the **only** function that mutates `players.balance` or `bank.balance`. Every grant, payout, fee, escrow, and refund goes through it, wrapped in a `BEGIN IMMEDIATE` transaction. No exceptions. This is the load-bearing invariant of the codebase.

Other services: `BetService` (bet lifecycle, settlement math), `PlayerService` (registration, lifecycle), `ElectionService` (admin elections), `AuditService` (synchronous append to the `audit_log` table). One SQLite connection in WAL mode.

Slash commands are registered globally — first registration takes up to ~1 hour to propagate, updates are near-instant.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: clone, install, `npm run dev`, follow the BalanceService rule, run the build before opening a PR.

## License

MIT — see [`LICENSE`](LICENSE).
