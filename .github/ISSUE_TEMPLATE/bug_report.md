---
name: Bug report
about: Something is broken or behaving unexpectedly
title: '[bug] '
labels: bug
assignees: ''
---

## What happened

A clear, concise description of the bug.

## Steps to reproduce

1. Run command `/...`
2. ...
3. See error

## Expected behavior

What you expected the bot to do.

## Actual behavior

What the bot actually did. Include the full text of any error embed if applicable.

## Bot logs

Paste the relevant lines from the bot's logs:

- If running in Docker: `docker compose logs --tail=50 wannabet`
- If running natively: copy from your terminal

```
<paste logs here>
```

## Discord error code (if any)

If the error embed mentioned a Discord API error code (e.g. `10062`, `50001`), put it here.

## Environment

- OS: <macOS / Linux / Windows + version>
- Node version: <`node --version`>
- Running mode: <native `npm start` / `npm run dev` / Docker>
- Bot version / commit: <`git rev-parse --short HEAD`>
- discord.js version: <from `package.json`>

## Additional context

Anything else that might help — DB state, related commands run before, screenshots, etc.
