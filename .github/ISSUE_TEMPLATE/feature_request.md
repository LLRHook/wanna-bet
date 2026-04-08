---
name: Feature request
about: Suggest a new command, mechanic, or improvement
title: '[feat] '
labels: enhancement
assignees: ''
---

## What problem does this solve

A clear description of the gap or pain point. "I'm always frustrated when..."

## Proposed solution

What would you like the bot to do? Sketch the slash command signature if applicable:

```
/example option:value
```

## How does this interact with the existing economy

If the feature touches money — fees, payouts, the bank, daily claims, etc. — describe how it fits in. The bot has a strict invariant that `BalanceService.transfer()` is the only mutation gateway, and there are documented inflation taps (registration grant, daily, weekly bank seeding). New money sources/sinks should be motivated.

## Alternatives considered

Other approaches you thought about and why you didn't pick them.

## Additional context

Mockups, links to similar features in other bots, anything else.
