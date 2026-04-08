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

**Production** (pm2):
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
