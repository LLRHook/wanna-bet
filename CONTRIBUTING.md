# Contributing to Wanna Bet Bot

Thanks for considering a contribution. This is a small TypeScript Discord bot — patches, bug reports, and feature suggestions are all welcome.

## Quick start for local development

**Important**: do **not** use Docker on macOS for local development. Docker Desktop's networking layer on Mac introduces multi-second latency on the WebSocket connection to Discord's gateway, which causes interactions to expire before the bot can acknowledge them. Run the bot natively with Node instead. On Linux (and the production VPS deploy target), Docker works fine.

```bash
# 1. Clone and install
git clone https://github.com/llrhook/wanna-bet.git
cd wanna-bet
npm install

# 2. Set up your bot in the Discord Developer Portal
#    See README.md "Setup" section for the full walkthrough.
#    Key things: enable the SERVER MEMBERS INTENT, copy your bot token,
#    invite the bot with both `bot` AND `applications.commands` scopes.

# 3. Configure environment
cp .env.example .env
# edit .env and set DISCORD_TOKEN

# 4. Initialize the database
npm run db:migrate

# 5. Register slash commands (one-time, or after command changes)
npm run register-commands

# 6. Run in dev mode (hot reload via tsx)
npm run dev
```

The dev script uses `tsx watch` so source changes restart the bot automatically.

## Project layout

```
src/
├── index.ts                  Entry point — Discord client, event dispatch
├── config.ts                 Typed env loader
├── logger.ts                 pino structured logger
├── commands/                 Slash command handlers
│   ├── economy/              register, unregister, balance, daily, ...
│   ├── bets/                 wanna-bet, accept, decline, resolve, bets
│   ├── admin/                admin subcommands, setup
│   ├── election/             vote-admin
│   └── register.ts           Standalone CLI: registers slash commands with Discord
├── services/                 Business logic — single source of truth
│   ├── BalanceService.ts     THE only place that mutates player.balance / bank.balance
│   ├── BetService.ts         Bet lifecycle and settlement math
│   ├── PlayerService.ts      Registration, activity, lifecycle
│   ├── ElectionService.ts    Admin election state machine
│   └── AuditService.ts       Audit log + audit channel posts
├── cron/                     node-cron jobs (Sunday bank seeding, daily inactivity sweep)
├── ui/                       Embed/button/table builders
└── db/                       SQLite connection + migration script

migrations/001_initial.sql    Schema (single migration file)
```

## Architectural invariant

**`BalanceService.transfer()` is the only function that may UPDATE `players.balance` or `bank.balance`.** Every monetary movement — escrow, payouts, fees, grants, daily claims, weekly seeding — must call through it. This is the single most important rule of the codebase. If you find yourself writing `UPDATE players SET balance` anywhere outside `BalanceService.ts`, stop.

The transfer helper wraps every mutation in a `BEGIN IMMEDIATE` SQLite transaction (via `.immediate()`) so concurrent operations are serialized at the engine level, not by accident of the JS event loop.

## Branch and commit conventions

- Branch names: descriptive, kebab-case. Examples: `fix/leaderboard-pagination`, `feat/lottery-command`, `docs/contributing`.
- Commit messages: concise, imperative subject line, optional body. Conventional Commits style is welcome but not required.
- Keep commits focused. One logical change per commit. Squash WIP commits before opening a PR.

## Pull request checklist

Before opening a PR:

- [ ] `npm run build` passes cleanly under strict TypeScript (no errors, no warnings)
- [ ] `npm run db:migrate` succeeds against a fresh database
- [ ] If you added a new slash command, you registered it via `npm run register-commands` and tested it in a real Discord server
- [ ] If you touched `BalanceService` or any settlement math, the worked examples in the existing tests / `BetService.settleBet` still produce correct payouts
- [ ] No secrets in the diff (`git diff main` doesn't show `.env` or token strings)
- [ ] README is updated if behavior changed
- [ ] Commit messages are clean

## Testing in a real Discord server

The bot has no automated test suite — testing is manual against a real Discord server. The recommended flow:

1. Create a private "test" Discord server
2. Invite the bot to it
3. Register a couple of test accounts (alts or friends)
4. Walk through the flows: register, daily, wanna-bet, accept, resolve, leaderboard, etc.

When testing on macOS, **run the bot natively with `npm run dev`**, not Docker. See the warning at the top.

## Reporting bugs

Open an issue using the bug report template. Please include:

- Steps to reproduce
- What you expected to happen
- What actually happened
- Bot logs (`docker compose logs wannabet` if Docker, otherwise the terminal output)
- The Discord error code if any (e.g., 50001, 10062)
- Whether the bot is running natively or in Docker, and on what OS

## Suggesting features

Open an issue using the feature request template. Bonus points for sketching how the feature would interact with the existing economy rules — fees, escrow, and the BalanceService invariant.

## Security issues

Please **do not** open public issues for security vulnerabilities. See `SECURITY.md` for the disclosure process.

## License

By contributing, you agree your contributions will be licensed under the MIT License.
