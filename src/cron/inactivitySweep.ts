import cron from 'node-cron';
import { getDb } from '../db/connection';
import { auditSync } from '../services/AuditService';
import { logger } from '../logger';

/**
 * Inactivity Sweep Cron Job
 * Schedule: Daily 00:05 UTC — "5 0 * * *"
 * (5 minutes after midnight to avoid contention with daily claim resets)
 *
 * Marks players inactive if they haven't been active in 30+ days.
 * Does NOT touch bets — inactive players' stakes remain locked.
 * (This is intentional — inactivity does not cancel bets they're in.)
 *
 * Does NOT use BalanceService since we're not mutating balances here —
 * we're preserving the balance by writing it to prior_balance.
 */

interface InactiveCandidate {
  guild_id: string;
  user_id: string;
  balance: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function startInactivitySweepCron(): cron.ScheduledTask {
  return cron.schedule(
    '5 0 * * *', // Daily 00:05 UTC
    async () => {
      logger.info('Inactivity sweep cron running...');
      const db = getDb();

      const cutoff = Date.now() - THIRTY_DAYS_MS;

      const candidates = db
        .prepare<[number], InactiveCandidate>(
          `SELECT guild_id, user_id, balance
           FROM players
           WHERE status = 'active'
             AND last_active_at < ?`
        )
        .all(cutoff);

      if (candidates.length === 0) {
        logger.info('Inactivity sweep: no inactive players found');
        return;
      }

      const markInactive = db.prepare<[string, string]>(
        `UPDATE players
         SET status = 'inactive',
             prior_balance = balance
         WHERE guild_id = ? AND user_id = ?`
      );

      // Batch update inside a transaction for performance
      const batchUpdate = db.transaction((rows: InactiveCandidate[]) => {
        for (const row of rows) {
          markInactive.run(row.guild_id, row.user_id);
        }
      });

      batchUpdate.immediate(candidates);

      // Audit each guild's sweep
      const byGuild = new Map<string, number>();
      for (const c of candidates) {
        byGuild.set(c.guild_id, (byGuild.get(c.guild_id) ?? 0) + 1);
      }

      for (const [guildId, count] of byGuild) {
        auditSync(db, {
          guildId,
          actorId: 'SYSTEM',
          actionType: 'INACTIVITY_SWEEP',
          payload: { playersDeactivated: count },
        });
      }

      logger.info(
        { totalDeactivated: candidates.length, guilds: byGuild.size },
        'Inactivity sweep complete'
      );
    },
    {
      timezone: 'UTC',
    }
  );
}
