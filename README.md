# Wanna Bet Bot

A Discord gambling-economy bot for server-wide fun. Manages a per-guild virtual currency, two-sided bet pools with escrow, an elected admin system, and a full suite of slash commands.

## Tech Stack

- **Runtime**: Node.js v20+ (tested on v25.9.0)
- **Language**: TypeScript (strict mode)
- **Discord**: discord.js v14
- **Database**: better-sqlite3 (WAL mode, single process)
- **Scheduler**: node-cron
- **Process Manager**: pm2
- **Logger**: pino

## Setup

### 1. Discord Developer Portal

1. Go to https://discord.com/developers/applications
2. Create a New Application → give it a name
3. Go to **Bot** tab → **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - **SERVER MEMBERS INTENT** (required — bot will fail without this)
5. Under **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Read Message History`
6. Copy the generated URL and invite the bot to your server
7. Copy the **Bot Token** from the Bot tab

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your bot's token from the Discord Developer Portal |
| `GUILD_ID` | The Discord server (guild) ID where the bot operates |

To get your Guild ID: Enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click your server → Copy Server ID.

### 3. Install Dependencies

```bash
npm install
```

If better-sqlite3 fails to build (Node 25+ requires build from source):

```bash
npm install better-sqlite3 --build-from-source
```

### 4. Run Database Migration

```bash
npm run db:migrate
```

This creates `data/wanna-bet.db` with the full schema.

### 5. Register Slash Commands

```bash
npm run register-commands
```

This registers all slash commands to your guild instantly (guild-scoped, no 1-hour wait).

### 6. Start the Bot

**Development** (with hot reload):
```bash
npm run dev
```

**Production**:

For VPS deployment, use Docker — see the next section. The pm2 path below is the legacy alternative if Docker is unavailable.

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
```

**Direct**:
```bash
npm run build
npm start
```

## Docker Deployment (recommended for VPS)

Single-command spin-up. Builds a multi-stage image (~200 MB), runs the bot as a non-root user, persists the SQLite database in a named volume, and survives host reboots.

### Prerequisites

- Docker 20.10+ and Docker Compose v2 on the VPS
- A Discord bot token and guild ID (see Setup §1)

### First-time setup on the VPS

```bash
# 1. Clone the repo
git clone <your-repo-url> wanna-bet
cd wanna-bet

# 2. Create the .env file from the template and fill in real values
cp .env.example .env
nano .env   # set DISCORD_TOKEN and GUILD_ID

# 3. Build and start (detached)
docker compose up -d --build

# 4. Register slash commands (one-time after deploy or after command changes)
docker compose run --rm wannabet node dist/commands/register.js
```

That's it. The bot is now running, will restart automatically on host reboot, and will survive `docker compose down` (data is in a named volume).

### Day-to-day operations

```bash
# View live logs
docker compose logs -f

# Restart the bot
docker compose restart

# Stop the bot (data preserved)
docker compose down

# Stop the bot AND delete all data (destructive — use carefully)
docker compose down -v

# Status
docker compose ps
```

### Updating after a code change

```bash
git pull
docker compose up -d --build

# Re-register slash commands if you changed any /command signatures
docker compose run --rm wannabet node dist/commands/register.js
```

The migration script runs automatically on every start. It is idempotent (`CREATE TABLE IF NOT EXISTS`) so re-running it is safe.

### Backups

The SQLite database lives in the `wannabet-data` named volume. Use `sqlite3 .backup` (online, atomic, safe even while the bot is running) and a bind-mounted host directory:

```bash
# Snapshot to ./backups/ on the host
docker compose exec wannabet sqlite3 /app/data/wanna-bet.db ".backup /app/backups/wanna-bet-$(date +%F).db"
ls -la backups/
```

Restore by stopping the bot, replacing the volume contents, and starting again:

```bash
docker compose down
docker run --rm -v wanna-bet_wannabet-data:/data -v "$PWD/backups:/backup" alpine \
  cp /backup/wanna-bet-2026-01-15.db /data/wanna-bet.db
docker compose up -d
```

### Inspecting the running container

```bash
# Open a shell inside the container
docker compose exec wannabet sh

# Run an ad-hoc sqlite3 query
docker compose exec wannabet sqlite3 /app/data/wanna-bet.db "SELECT COUNT(*) FROM players"

# Check the bot's effective config (DISCORD_TOKEN is masked by Discord on output)
docker compose exec wannabet env | grep -E '^(NODE_ENV|GUILD_ID)='
```

### Notes

- Bot runs as user `wannabet` (UID 1001) inside the container, not root.
- SQLite database is in WAL mode and uses `sqlite3 .backup` for safe live backups — no need to stop the bot.
- The `init: true` setting in `docker-compose.yml` ensures `SIGTERM` is forwarded to Node so graceful shutdown works (15-second grace period).
- The image bundles `sqlite3` for ad-hoc queries and backups.

## Commands

### Economy

| Command | Description |
|---|---|
| `/register` | Register and receive $100 starting balance |
| `/unregister` | Deactivate your account (balance preserved) |
| `/balance` | Check your wallet balance |
| `/daily` | Claim $5 daily bonus (resets at UTC midnight) |
| `/bank` | View the guild bank balance and seeding info |
| `/leaderboard` | Top 10 players by balance |
| `/stats [@user]` | Win/loss stats for yourself or another player |
| `/history [@user]` | Paginated bet history |

### Betting

| Command | Description |
|---|---|
| `/wanna-bet` | Create a new bet with custom sides and labels |
| `/accept <bet-id>` | Accept an open bet (choose your side and wager) |
| `/decline <bet-id>` | Decline a direct bet invitation (fee refunded) |
| `/resolve <bet-id>` | Propose a resolution outcome |
| `/bets active` | View all active bets in the guild |

### Admin (elected admin only)

| Command | Description |
|---|---|
| `/admin grant @user <amount>` | Grant funds from bank to player |
| `/admin seize @user <amount>` | Seize funds from player to bank |
| `/admin resolve <bet-id>` | Force-resolve any bet |
| `/admin cancel <bet-id>` | Cancel a bet (stakes refunded, fees retained) |
| `/admin ban @user` | Ban a player from the economy |
| `/admin unban @user` | Unban a player |

### Elections

| Command | Description |
|---|---|
| `/vote-admin start` | Start a 1-hour admin election |
| `/vote-admin nominate` | Nominate yourself as a candidate |
| `/vote-admin cast @candidate` | Vote for a candidate |
| `/vote-admin status` | View current election status |

### Setup (Manage Guild permission)

| Command | Description |
|---|---|
| `/setup role @role` | Set the gambler role for lobby bets |
| `/setup audit-channel #channel` | Set channel for audit log messages |

## Economy Model

### Escrow System

When a bet is created or joined, funds are immediately escrowed:
- **Fee**: `max($1.00, 1% of wager)` — paid to the guild bank immediately
- **Net Stake**: `wager - fee` — held in the virtual bet pool

Fees go to the bank regardless of bet outcome.

### Settlement (Winner)

Winners receive their net stake back PLUS a pro-rata share of the losing pool:

```
winner_payout = winner.stake + floor(winner.stake / total_winner_stake * total_loser_pool)
```

Rounding remainder (from integer division) is assigned to the winner with the largest stake.

### Settlement (Neither)

Each participant gets back their net stake only. Fees are retained by the bank.

### Admin Cancel

Stakes are refunded; fees are **not** refunded (fees already absorbed by bank).

### Decline

If the invited opponent declines before joining, the creator's full wager including fee is refunded (the bet never became bilateral).

### Bank Seeding

Every Sunday at 00:00 UTC, if the bank balance is below `active_player_count × $100`, the bank receives $25.00.

### Daily Bonus

$5.00 per day per player, resets at UTC midnight.

### Inactivity

Players inactive for 30+ days are automatically marked inactive. Their balance is preserved. Re-register to restore.

## Database

SQLite in WAL mode at `data/wanna-bet.db`. All monetary values stored as integer cents ($1.00 = 100).

## Architecture Notes

- **BalanceService** is the ONLY code that may mutate `players.balance` or `bank.balance`. All transfers go through it.
- Every balance-mutating operation uses `BEGIN IMMEDIATE` transactions for race-safety.
- Bet IDs are 4-character uppercase alphanumeric (e.g., `A3F7`).
- Multi-guild safe: all queries are scoped by `guild_id`.

## License

MIT
