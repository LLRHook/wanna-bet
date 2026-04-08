import cron from 'node-cron';
import { getDb } from '../db/connection';
import { transfer } from '../services/BalanceService';
import { auditSync } from '../services/AuditService';
import { logger } from '../logger';

/**
 * Bank Seeding Cron Job
 * Schedule: Sunday 00:00 UTC — "0 0 * * 0"
 *
 * For each guild where bank.balance < (player_count * 10000):
 *   Add $25.00 (2500 cents) to the bank.
 *
 * Idempotent: the check is transactional and runs at most once per week.
 */

interface GuildBankRow {
  guild_id: string;
  balance: number;
  player_count: number;
}

export function startBankSeedingCron(): cron.ScheduledTask {
  return cron.schedule(
    '0 0 * * 0', // Sunday 00:00 UTC
    async () => {
      logger.info('Bank seeding cron running...');
      const db = getDb();

      const guilds = db
        .prepare<[], GuildBankRow>(
          `SELECT g.guild_id, b.balance,
                  (SELECT COUNT(*) FROM players WHERE guild_id = g.guild_id AND status = 'active') AS player_count
           FROM guilds g
           JOIN bank b ON b.guild_id = g.guild_id`
        )
        .all();

      let seededCount = 0;

      for (const guild of guilds) {
        const cap = guild.player_count * 10000; // $100 per active player

        if (guild.balance < cap) {
          const seedAmount = 2500; // $25.00

          const xfer = transfer(db, {
            guildId: guild.guild_id,
            toBank: seedAmount,
          });

          if (xfer.success) {
            seededCount++;
            auditSync(db, {
              guildId: guild.guild_id,
              actorId: 'SYSTEM',
              actionType: 'BANK_SEEDED',
              payload: {
                amount: seedAmount,
                balanceBefore: guild.balance,
                balanceAfter: xfer.bankBalance,
                cap,
              },
            });
            logger.info(
              { guildId: guild.guild_id, amount: seedAmount, balanceBefore: guild.balance },
              'Bank seeded'
            );
          } else {
            logger.error({ guildId: guild.guild_id, error: xfer.error }, 'Bank seeding failed');
          }
        } else {
          logger.debug(
            { guildId: guild.guild_id, balance: guild.balance, cap },
            'Bank at or above cap; skipping seeding'
          );
        }
      }

      logger.info({ seededCount, totalGuilds: guilds.length }, 'Bank seeding cron complete');
    },
    {
      timezone: 'UTC',
    }
  );
}
