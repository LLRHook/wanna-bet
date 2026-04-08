import type Database from 'better-sqlite3';
import type { Client, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getGuild } from './PlayerService';
import { COLORS } from '../ui/colors';
import { logger } from '../logger';

/**
 * AuditService — writes to audit_log and optionally posts to the guild's audit channel.
 *
 * Always call as a fire-and-forget side effect after a successful operation.
 */

export type AuditActionType =
  | 'PLAYER_REGISTER'
  | 'PLAYER_UNREGISTER'
  | 'DAILY_CLAIM'
  | 'BET_CREATED'
  | 'BET_JOINED'
  | 'BET_DECLINED'
  | 'BET_RESOLVED'
  | 'BET_CANCELLED'
  | 'RESOLUTION_PROPOSED'
  | 'RESOLUTION_CONFIRMED'
  | 'RESOLUTION_DISPUTED'
  | 'ADMIN_GRANT'
  | 'ADMIN_SEIZE'
  | 'ADMIN_RESOLVE'
  | 'ADMIN_CANCEL'
  | 'ADMIN_BAN'
  | 'ADMIN_UNBAN'
  | 'ADMIN_REVOKED'
  | 'ELECTION_STARTED'
  | 'ELECTION_CLOSED'
  | 'ELECTION_FAILED'
  | 'BANK_SEEDED'
  | 'INACTIVITY_SWEEP';

export interface AuditEntry {
  guildId: string;
  actorId: string;
  actionType: AuditActionType;
  payload?: Record<string, unknown>;
}

/**
 * Inserts an audit log entry and optionally posts to the audit channel.
 * Errors are caught and logged — audit failures never block the main flow.
 */
export async function audit(
  db: Database.Database,
  client: Client,
  entry: AuditEntry
): Promise<void> {
  try {
    db.prepare<[string, string, string, string]>(
      `INSERT INTO audit_log (guild_id, actor_id, action_type, payload_json)
       VALUES (?, ?, ?, ?)`
    ).run(
      entry.guildId,
      entry.actorId,
      entry.actionType,
      JSON.stringify(entry.payload ?? {})
    );
  } catch (err) {
    logger.error({ err, entry }, 'Failed to write audit log entry');
    return;
  }

  // Post to audit channel if configured
  try {
    const guild = getGuild(db, entry.guildId);
    if (!guild?.audit_channel_id) return;

    const channel = client.channels.cache.get(guild.audit_channel_id) as TextChannel | undefined;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.BLUE)
      .setTitle(`Audit: ${entry.actionType}`)
      .addFields(
        { name: 'Actor', value: `<@${entry.actorId}>`, inline: true },
        { name: 'Action', value: entry.actionType, inline: true }
      )
      .setTimestamp();

    if (entry.payload && Object.keys(entry.payload).length > 0) {
      embed.addFields({
        name: 'Details',
        value: `\`\`\`json\n${JSON.stringify(entry.payload, null, 2).slice(0, 900)}\n\`\`\``,
      });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error({ err, entry }, 'Failed to post audit embed to channel');
  }
}

/**
 * Synchronous audit-log-only write (no Discord post).
 * Use for cron jobs and system events where client may not be available.
 */
export function auditSync(
  db: Database.Database,
  entry: AuditEntry
): void {
  try {
    db.prepare<[string, string, string, string]>(
      `INSERT INTO audit_log (guild_id, actor_id, action_type, payload_json)
       VALUES (?, ?, ?, ?)`
    ).run(
      entry.guildId,
      entry.actorId,
      entry.actionType,
      JSON.stringify(entry.payload ?? {})
    );
  } catch (err) {
    logger.error({ err, entry }, 'Failed to write audit log entry (sync)');
  }
}
