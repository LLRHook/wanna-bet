# Security Policy

## Supported versions

This is a hobby project. Only the `main` branch is actively maintained. No backports.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue in Wanna Bet Bot — anything that could leak Discord tokens, allow privilege escalation in the bot's economy, corrupt the SQLite database, or compromise the host running the bot — please report it privately:

- Email: `victor.n.ivanov@gmail.com`
- Subject line: `[wanna-bet] security: <short description>`

I'll do my best to acknowledge within a few days and discuss a fix. Once a patch is available, the issue can be disclosed publicly with credit to the reporter (if desired).

## Things that are not security issues

- The bot is a gambling-economy game. The "currency" is fictional. Players intentionally have access to bet against each other and exchange virtual money via the documented commands.
- The elected admin can grant and seize money from the central bank. This is intentional gameplay design, not a privilege escalation bug.
- The bot uses an honor-system resolution flow with admin override. Disputes are by design.

## Things that ARE security issues

- Any way to steal or read another player's wallet directly without going through bets / admin / daily
- Any way to make `BalanceService.transfer()` mutate balances without a corresponding source/sink (i.e. minting money outside the documented inflation taps)
- Any SQL injection
- Any way to leak the `DISCORD_TOKEN` from the bot's runtime
- Any way to crash the bot persistently with a single user input
- Any way for a non-admin user to invoke `/admin` subcommands
