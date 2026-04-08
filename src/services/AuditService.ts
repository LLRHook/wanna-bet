import type Database from 'better-sqlite3';
import { logger } from '../logger';

/**
 * AuditService — synchronous append to the audit_log table.
 * Audit failures are logged but never block the calling flow.
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
  | 'ELECTION_FAILED';

export interface AuditEntry {
  guildId: string;
  actorId: string;
  actionType: AuditActionType;
  payload?: Record<string, unknown>;
}

export function audit(db: Database.Database, entry: AuditEntry): void {
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
  }
}
