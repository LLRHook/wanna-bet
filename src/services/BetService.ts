import type Database from 'better-sqlite3';
import { transfer, computeFee, dollarsToCents, formatCents } from './BalanceService';
import { logger } from '../logger';

/**
 * BetService — manages the full bet lifecycle.
 *
 * create → join (escrow) → propose → confirm/dispute → settle / cancel
 *
 * ALL balance mutations go through BalanceService.transfer().
 * This service owns the proportional payout calculation.
 */

export interface BetRow {
  bet_id: string;
  guild_id: string;
  channel_id: string;
  creator_id: string;
  description: string;
  side_a_label: string;
  side_b_label: string;
  initiator_side: 'A' | 'B';
  direct_opponent_id: string | null;
  is_lobby: number;
  window_minutes: number;
  window_closes_at: number;
  status: 'open' | 'locked' | 'proposed' | 'disputed' | 'resolved' | 'cancelled';
  proposed_outcome: 'A' | 'B' | 'neither' | null;
  proposer_id: string | null;
  proposal_message_id: string | null;
  resolved_at: number | null;
  resolved_outcome: 'A' | 'B' | 'neither' | null;
  resolver_id: string | null;
  created_at: number;
}

export interface ParticipantRow {
  id: number;
  bet_id: string;
  guild_id: string;
  user_id: string;
  side: 'A' | 'B';
  stake: number;
  fee_paid: number;
  joined_at: number;
}

export interface PoolTotals {
  poolA: number;
  poolB: number;
  participantCount: number;
}

/** Generates a 4-character uppercase alphanumeric bet ID */
function generateBetId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** Gets a unique bet ID (retries on collision) */
function getUniqueBetId(db: Database.Database, guildId: string): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateBetId();
    const exists = db
      .prepare<[string, string], { bet_id: string }>(
        'SELECT bet_id FROM bets WHERE bet_id = ? AND guild_id = ?'
      )
      .get(id, guildId);
    if (!exists) return id;
  }
  throw new Error('Failed to generate unique bet ID after 10 attempts.');
}

export interface CreateBetParams {
  guildId: string;
  channelId: string;
  creatorId: string;
  description: string;
  sideALabel: string;
  sideBLabel: string;
  initiatorSide: 'A' | 'B';
  wagerDollars: number;
  opponentId?: string;
  isLobby?: boolean;
  windowMinutes?: number;
}

export interface CreateBetResult {
  success: boolean;
  error?: string;
  bet?: BetRow;
  fee?: number;
  netStake?: number;
}

/**
 * Creates a new bet and escrows the creator's wager.
 */
export function createBet(db: Database.Database, params: CreateBetParams): CreateBetResult {
  const {
    guildId,
    channelId,
    creatorId,
    description,
    sideALabel,
    sideBLabel,
    initiatorSide,
    wagerDollars,
    opponentId,
    isLobby = false,
    windowMinutes = 10,
  } = params;

  const wagerCents = dollarsToCents(wagerDollars);
  const fee = computeFee(wagerCents);
  const netStake = wagerCents - fee;

  const txn = db.transaction((): CreateBetResult => {
    // Re-read player balance inside transaction
    const player = db
      .prepare<[string, string], { balance: number; status: string }>(
        'SELECT balance, status FROM players WHERE guild_id = ? AND user_id = ?'
      )
      .get(guildId, creatorId);

    if (!player || player.status !== 'active') {
      return { success: false, error: 'You must be registered and active to create a bet.' };
    }
    if (player.balance < wagerCents) {
      return {
        success: false,
        error: `Insufficient balance. You need ${formatCents(wagerCents)} but have ${formatCents(player.balance)}.`,
      };
    }

    const betId = getUniqueBetId(db, guildId);
    const now = Date.now();
    const windowClosesAt = now + windowMinutes * 60000;

    db.prepare<[string, string, string, string, string, string, string, string, string | null, number, number, number]>(
      `INSERT INTO bets (bet_id, guild_id, channel_id, creator_id, description,
                         side_a_label, side_b_label, initiator_side, direct_opponent_id,
                         is_lobby, window_minutes, window_closes_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      betId, guildId, channelId, creatorId, description,
      sideALabel, sideBLabel, initiatorSide, opponentId ?? null,
      isLobby ? 1 : 0, windowMinutes, windowClosesAt
    );

    // Transfer: creator wallet → bank (fee) + pool (stake)
    const xfer = transfer(db, {
      guildId,
      fromWallet: { userId: creatorId, amount: wagerCents },
      toBank: fee,
    });

    if (!xfer.success) {
      return { success: false, error: xfer.error };
    }

    // Record participant
    db.prepare<[string, string, string, string, number, number]>(
      `INSERT INTO bet_participants (bet_id, guild_id, user_id, side, stake, fee_paid)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(betId, guildId, creatorId, initiatorSide, netStake, fee);

    const bet = db
      .prepare<[string, string], BetRow>('SELECT * FROM bets WHERE bet_id = ? AND guild_id = ?')
      .get(betId, guildId);

    return { success: true, bet: bet ?? undefined, fee, netStake };
  });

  return txn.immediate();
}

export interface JoinBetParams {
  guildId: string;
  betId: string;
  userId: string;
  side: 'A' | 'B';
  wagerDollars: number;
}

export interface JoinBetResult {
  success: boolean;
  error?: string;
  fee?: number;
  netStake?: number;
  poolTotals?: PoolTotals;
}

/**
 * Joins an existing bet (escrows the joiner's wager).
 * Race-safe: uses BEGIN IMMEDIATE and re-validates inside transaction.
 */
export function joinBet(db: Database.Database, params: JoinBetParams): JoinBetResult {
  const { guildId, betId, userId, side, wagerDollars } = params;
  const wagerCents = dollarsToCents(wagerDollars);
  const fee = computeFee(wagerCents);
  const netStake = wagerCents - fee;

  const txn = db.transaction((): JoinBetResult => {
    // Re-read bet inside transaction
    const bet = db
      .prepare<[string, string], BetRow>(
        'SELECT * FROM bets WHERE bet_id = ? AND guild_id = ?'
      )
      .get(betId, guildId);

    if (!bet) {
      return { success: false, error: 'Bet not found.' };
    }
    if (bet.status !== 'open') {
      return { success: false, error: `Bet is not open (status: ${bet.status}).` };
    }
    if (Date.now() > bet.window_closes_at) {
      return { success: false, error: 'The betting window has closed.' };
    }

    // Check if already a participant
    const existing = db
      .prepare<[string, string, string], { id: number }>(
        'SELECT id FROM bet_participants WHERE bet_id = ? AND guild_id = ? AND user_id = ?'
      )
      .get(betId, guildId, userId);
    if (existing) {
      return { success: false, error: 'You are already a participant in this bet.' };
    }

    // Re-read balance inside transaction
    const player = db
      .prepare<[string, string], { balance: number; status: string }>(
        'SELECT balance, status FROM players WHERE guild_id = ? AND user_id = ?'
      )
      .get(guildId, userId);

    if (!player || player.status !== 'active') {
      return { success: false, error: 'You must be registered and active to join a bet.' };
    }
    if (player.balance < wagerCents) {
      return {
        success: false,
        error: `Insufficient balance. You need ${formatCents(wagerCents)} but have ${formatCents(player.balance)}.`,
      };
    }

    // Transfer: joiner wallet → bank (fee) + pool
    const xfer = transfer(db, {
      guildId,
      fromWallet: { userId, amount: wagerCents },
      toBank: fee,
    });

    if (!xfer.success) {
      return { success: false, error: xfer.error };
    }

    // Record participant
    db.prepare<[string, string, string, string, number, number]>(
      `INSERT INTO bet_participants (bet_id, guild_id, user_id, side, stake, fee_paid)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(betId, guildId, userId, side, netStake, fee);

    const poolTotals = getPoolTotals(db, betId, guildId);
    return { success: true, fee, netStake, poolTotals };
  });

  return txn.immediate();
}

/**
 * Gets pool totals for a bet.
 */
export function getPoolTotals(
  db: Database.Database,
  betId: string,
  guildId: string
): PoolTotals {
  const row = db
    .prepare<
      [string, string],
      { poolA: number; poolB: number; participantCount: number }
    >(
      `SELECT
         SUM(CASE WHEN side='A' THEN stake ELSE 0 END) as poolA,
         SUM(CASE WHEN side='B' THEN stake ELSE 0 END) as poolB,
         COUNT(*) as participantCount
       FROM bet_participants WHERE bet_id=? AND guild_id=?`
    )
    .get(betId, guildId);

  return {
    poolA: row?.poolA ?? 0,
    poolB: row?.poolB ?? 0,
    participantCount: row?.participantCount ?? 0,
  };
}

export interface DeclineBetResult {
  success: boolean;
  error?: string;
}

/**
 * Declines a direct bet invitation.
 * Refunds the creator's stake AND fee (bet never became bilateral).
 */
export function declineBet(
  db: Database.Database,
  guildId: string,
  betId: string,
  callerId: string
): DeclineBetResult {
  const txn = db.transaction((): DeclineBetResult => {
    const bet = db
      .prepare<[string, string], BetRow>(
        'SELECT * FROM bets WHERE bet_id = ? AND guild_id = ?'
      )
      .get(betId, guildId);

    if (!bet) return { success: false, error: 'Bet not found.' };
    if (bet.status !== 'open') return { success: false, error: 'Bet is not open.' };
    if (bet.direct_opponent_id !== callerId) {
      return { success: false, error: 'You are not the invited opponent for this bet.' };
    }

    // Make sure caller hasn't already joined
    const callerPart = db
      .prepare<[string, string, string], { id: number }>(
        'SELECT id FROM bet_participants WHERE bet_id=? AND guild_id=? AND user_id=?'
      )
      .get(betId, guildId, callerId);
    if (callerPart) {
      return { success: false, error: 'You have already joined this bet. Use /resolve instead.' };
    }

    // Get all current participants (only creator at this point)
    const participants = db
      .prepare<[string, string], ParticipantRow>(
        'SELECT * FROM bet_participants WHERE bet_id=? AND guild_id=?'
      )
      .all(betId, guildId);

    // Mark cancelled
    db.prepare<[number, string, string]>(
      "UPDATE bets SET status='cancelled', resolved_at=? WHERE bet_id=? AND guild_id=?"
    ).run(Date.now(), betId, guildId);

    // Refund: on decline, fees ARE refunded (bet never bilateral)
    for (const p of participants) {
      const refund = p.stake + p.fee_paid;
      const xfer = transfer(db, {
        guildId,
        fromBank: p.fee_paid,
        toWallet: { userId: p.user_id, amount: refund },
      });
      if (!xfer.success) {
        logger.error({ betId, userId: p.user_id }, 'Failed to refund on decline');
      }
    }

    return { success: true };
  });

  return txn.immediate();
}

export interface CancelBetResult {
  success: boolean;
  error?: string;
  refunds?: Array<{ userId: string; amount: number }>;
}

/**
 * Admin cancels a bet. Stakes refunded; fees retained by bank.
 */
export function adminCancelBet(
  db: Database.Database,
  guildId: string,
  betId: string
): CancelBetResult {
  const txn = db.transaction((): CancelBetResult => {
    const bet = db
      .prepare<[string, string], BetRow>(
        'SELECT * FROM bets WHERE bet_id = ? AND guild_id = ?'
      )
      .get(betId, guildId);

    if (!bet) return { success: false, error: 'Bet not found.' };
    if (!['open', 'locked', 'proposed', 'disputed'].includes(bet.status)) {
      return { success: false, error: `Cannot cancel a bet with status '${bet.status}'.` };
    }

    const participants = db
      .prepare<[string, string], ParticipantRow>(
        'SELECT * FROM bet_participants WHERE bet_id=? AND guild_id=?'
      )
      .all(betId, guildId);

    db.prepare<[number, string, string]>(
      "UPDATE bets SET status='cancelled', resolved_at=? WHERE bet_id=? AND guild_id=?"
    ).run(Date.now(), betId, guildId);

    const refunds: Array<{ userId: string; amount: number }> = [];

    // On admin cancel: stakes returned, fees retained by bank
    for (const p of participants) {
      const xfer = transfer(db, {
        guildId,
        toWallet: { userId: p.user_id, amount: p.stake },
      });
      if (xfer.success) {
        refunds.push({ userId: p.user_id, amount: p.stake });
      } else {
        logger.error({ betId, userId: p.user_id }, 'Failed to refund stake on admin cancel');
      }
    }

    return { success: true, refunds };
  });

  return txn.immediate();
}

export interface SettleResult {
  success: boolean;
  error?: string;
  payouts?: Array<{ userId: string; payout: number }>;
}

/**
 * Settles a bet by paying out winners proportionally.
 *
 * Proportional payout formula:
 *   winner_payout = winner.stake + floor(winner.stake / total_winner_stake * total_loser_pool)
 *
 * Rounding remainder is assigned to the winner with the largest stake
 * to minimize visible unfairness. This choice is documented here and in comments below.
 *
 * For "neither" outcome: each participant gets back their stake only. Fees stay in bank.
 */
export function settleBet(
  db: Database.Database,
  guildId: string,
  betId: string,
  outcome: 'A' | 'B' | 'neither',
  resolverId: string
): SettleResult {
  const txn = db.transaction((): SettleResult => {
    // Atomic status check + update — prevents double-settle
    const updateResult = db
      .prepare<[string, string, number, string, string]>(
        `UPDATE bets SET status='resolved', resolved_outcome=?, resolver_id=?, resolved_at=?
         WHERE bet_id=? AND guild_id=? AND status IN ('proposed','open','locked','disputed')`
      )
      .run(outcome, resolverId, Date.now(), betId, guildId);

    if (updateResult.changes === 0) {
      return { success: false, error: 'Bet has already been resolved or cannot be settled.' };
    }

    const participants = db
      .prepare<[string, string], ParticipantRow>(
        'SELECT * FROM bet_participants WHERE bet_id=? AND guild_id=?'
      )
      .all(betId, guildId);

    const payouts: Array<{ userId: string; payout: number }> = [];

    if (outcome === 'neither') {
      // Each participant gets back their stake; fees stay in bank
      for (const p of participants) {
        const xfer = transfer(db, {
          guildId,
          toWallet: { userId: p.user_id, amount: p.stake },
        });
        if (xfer.success) {
          payouts.push({ userId: p.user_id, payout: p.stake });
        } else {
          logger.error({ betId, userId: p.user_id }, 'Failed to return stake on neither');
        }
      }
    } else {
      // Winning side takes loser pool proportionally
      const winners = participants.filter((p) => p.side === outcome);
      const losers = participants.filter((p) => p.side !== outcome);

      const totalWinnerStake = winners.reduce((sum, p) => sum + p.stake, 0);
      const totalLoserPool = losers.reduce((sum, p) => sum + p.stake, 0);

      if (winners.length === 0) {
        // Edge case: no one on winning side — return all stakes
        for (const p of participants) {
          const xfer = transfer(db, {
            guildId,
            toWallet: { userId: p.user_id, amount: p.stake },
          });
          if (xfer.success) {
            payouts.push({ userId: p.user_id, payout: p.stake });
          }
        }
        return { success: true, payouts };
      }

      // Sort winners descending by stake for rounding assignment
      const sortedWinners = [...winners].sort((a, b) => b.stake - a.stake);

      let distributed = 0;
      const winnerPayouts: Array<{ participant: ParticipantRow; share: number }> = [];

      for (const winner of sortedWinners) {
        // Pro-rata share of loser pool (floor to avoid over-distribution)
        const share =
          totalWinnerStake > 0
            ? Math.floor((winner.stake / totalWinnerStake) * totalLoserPool)
            : 0;
        winnerPayouts.push({ participant: winner, share });
        distributed += share;
      }

      // Assign remainder (due to floor rounding) to winner with largest stake (first in sorted list)
      const remainder = totalLoserPool - distributed;
      if (winnerPayouts[0] && remainder > 0) {
        winnerPayouts[0].share += remainder;
      }

      for (const { participant, share } of winnerPayouts) {
        const payout = participant.stake + share;
        const xfer = transfer(db, {
          guildId,
          toWallet: { userId: participant.user_id, amount: payout },
        });
        if (xfer.success) {
          payouts.push({ userId: participant.user_id, payout });
        } else {
          logger.error({ betId, userId: participant.user_id }, 'Failed payout on settlement');
        }
      }
    }

    return { success: true, payouts };
  });

  return txn.immediate();
}

/**
 * Gets a bet by ID within a guild.
 */
export function getBet(
  db: Database.Database,
  guildId: string,
  betId: string
): BetRow | null {
  return (
    db
      .prepare<[string, string], BetRow>(
        'SELECT * FROM bets WHERE bet_id=? AND guild_id=?'
      )
      .get(betId, guildId) ?? null
  );
}

/**
 * Gets all participants for a bet.
 */
export function getParticipants(
  db: Database.Database,
  betId: string,
  guildId: string
): ParticipantRow[] {
  return db
    .prepare<[string, string], ParticipantRow>(
      'SELECT * FROM bet_participants WHERE bet_id=? AND guild_id=?'
    )
    .all(betId, guildId);
}

/**
 * Checks if a user is a participant in a bet.
 */
export function isParticipant(
  db: Database.Database,
  betId: string,
  guildId: string,
  userId: string
): boolean {
  const row = db
    .prepare<[string, string, string], { id: number }>(
      'SELECT id FROM bet_participants WHERE bet_id=? AND guild_id=? AND user_id=?'
    )
    .get(betId, guildId, userId);
  return row != null;
}

/**
 * Proposes a resolution outcome. Marks bet as 'proposed' and records proposer's confirm.
 */
export function proposeResolution(
  db: Database.Database,
  guildId: string,
  betId: string,
  proposerId: string,
  outcome: 'A' | 'B' | 'neither'
): { success: boolean; error?: string } {
  const txn = db.transaction(() => {
    const bet = db
      .prepare<[string, string], BetRow>(
        'SELECT * FROM bets WHERE bet_id=? AND guild_id=?'
      )
      .get(betId, guildId);

    if (!bet) return { success: false, error: 'Bet not found.' };
    if (!['open', 'locked'].includes(bet.status)) {
      return { success: false, error: `Bet cannot be proposed (status: ${bet.status}).` };
    }
    if (!isParticipant(db, betId, guildId, proposerId)) {
      return { success: false, error: 'You must be a participant to propose a resolution.' };
    }

    db.prepare<[string, string, string, string]>(
      `UPDATE bets SET status='proposed', proposed_outcome=?, proposer_id=?
       WHERE bet_id=? AND guild_id=?`
    ).run(outcome, proposerId, betId, guildId);

    // Auto-confirm for proposer
    db.prepare<[string, string, string]>(
      `INSERT OR REPLACE INTO resolution_responses (bet_id, guild_id, user_id, response)
       VALUES (?, ?, ?, 'confirm')`
    ).run(betId, guildId, proposerId);

    return { success: true };
  });

  return txn.immediate();
}

/**
 * Records a participant's confirm or dispute response.
 * Returns the current tally and whether all have responded.
 */
export function recordResolutionResponse(
  db: Database.Database,
  guildId: string,
  betId: string,
  userId: string,
  response: 'confirm' | 'dispute'
): {
  success: boolean;
  error?: string;
  allConfirmed?: boolean;
  hasDispute?: boolean;
} {
  const txn = db.transaction(() => {
    db.prepare<[string, string, string, string]>(
      `INSERT OR REPLACE INTO resolution_responses (bet_id, guild_id, user_id, response)
       VALUES (?, ?, ?, ?)`
    ).run(betId, guildId, userId, response);

    // Check for any dispute
    const disputeCount = db
      .prepare<[string, string], { count: number }>(
        `SELECT COUNT(*) as count FROM resolution_responses
         WHERE bet_id=? AND guild_id=? AND response='dispute'`
      )
      .get(betId, guildId);

    if (disputeCount && disputeCount.count > 0) {
      db.prepare<[string, string]>(
        "UPDATE bets SET status='disputed' WHERE bet_id=? AND guild_id=?"
      ).run(betId, guildId);
      return { success: true, hasDispute: true, allConfirmed: false };
    }

    // Check if all participants have confirmed
    const participantCount = db
      .prepare<[string, string], { count: number }>(
        'SELECT COUNT(*) as count FROM bet_participants WHERE bet_id=? AND guild_id=?'
      )
      .get(betId, guildId);

    const confirmCount = db
      .prepare<[string, string], { count: number }>(
        `SELECT COUNT(*) as count FROM resolution_responses
         WHERE bet_id=? AND guild_id=? AND response='confirm'`
      )
      .get(betId, guildId);

    const allConfirmed =
      (participantCount?.count ?? 0) > 0 &&
      confirmCount?.count === participantCount?.count;

    return { success: true, allConfirmed, hasDispute: false };
  });

  return txn.immediate();
}
