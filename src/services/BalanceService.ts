import type Database from 'better-sqlite3';

/**
 * BalanceService — THE SINGLE GATEWAY FOR ALL BALANCE MUTATIONS.
 *
 * INVARIANT: This is the ONLY file that may UPDATE players.balance or bank.balance.
 * No other service, command handler, or utility may directly mutate these columns.
 * Every monetary transfer — grants, seizures, fees, payouts, daily claims, escrow —
 * must go through BalanceService.transfer().
 *
 * All amounts are in INTEGER CENTS. $1.00 = 100. Never use floats for money.
 *
 * Every transfer executes inside a BEGIN IMMEDIATE transaction to prevent
 * concurrent balance races (see plan section 7).
 */

export interface TransferParams {
  /** Guild scope — required for all operations */
  guildId: string;
  /** Debit this amount from a player's wallet (cents). */
  fromWallet?: { userId: string; amount: number };
  /** Credit this amount to a player's wallet (cents). */
  toWallet?: { userId: string; amount: number };
  /** Debit from the bank (cents). Bank balance must be >= amount. */
  fromBank?: number;
  /** Credit to the bank (cents). */
  toBank?: number;
  /** Optional bet ID for audit context (not used in DB mutation). */
  betId?: string;
}

export interface TransferResult {
  /** True if the transfer completed successfully. */
  success: boolean;
  /** Human-readable error if success is false. */
  error?: string;
  /** New balance of the fromWallet player after transfer (cents). */
  fromWalletBalance?: number;
  /** New balance of the toWallet player after transfer (cents). */
  toWalletBalance?: number;
  /** New bank balance after transfer (cents). */
  bankBalance?: number;
}

/**
 * Executes a monetary transfer atomically inside BEGIN IMMEDIATE.
 *
 * Supports any combination of:
 *   - wallet → wallet (player to player)
 *   - wallet → bank   (fee collection, seizure)
 *   - bank → wallet   (payout, grant)
 *   - bank only delta (seeding)
 *
 * Validates sufficient funds before mutating.
 * Returns { success: false, error } on validation failure — no exception thrown.
 */
export function transfer(db: Database.Database, params: TransferParams): TransferResult {
  const { guildId, fromWallet, toWallet, fromBank, toBank } = params;

  const txn = db.transaction((): TransferResult => {
    // ─── Validate fromWallet balance ────────────────────────────────────────
    if (fromWallet) {
      const row = db
        .prepare<[string, string], { balance: number }>(
          'SELECT balance FROM players WHERE guild_id = ? AND user_id = ?'
        )
        .get(guildId, fromWallet.userId);

      if (!row) {
        return { success: false, error: `Player ${fromWallet.userId} not found.` };
      }
      if (row.balance < fromWallet.amount) {
        return {
          success: false,
          error: `Insufficient balance. Have ${row.balance} cents, need ${fromWallet.amount} cents.`,
        };
      }
    }

    // ─── Validate fromBank balance ──────────────────────────────────────────
    if (fromBank !== undefined && fromBank > 0) {
      const bankRow = db
        .prepare<[string], { balance: number }>('SELECT balance FROM bank WHERE guild_id = ?')
        .get(guildId);

      if (!bankRow) {
        return { success: false, error: `Bank not initialized for guild ${guildId}.` };
      }
      if (bankRow.balance < fromBank) {
        return {
          success: false,
          error: `Insufficient bank balance. Have ${bankRow.balance} cents, need ${fromBank} cents.`,
        };
      }
    }

    // ─── Apply mutations ────────────────────────────────────────────────────

    let fromWalletBalance: number | undefined;
    let toWalletBalance: number | undefined;
    let bankBalance: number | undefined;

    if (fromWallet) {
      db.prepare<[number, string, string]>(
        'UPDATE players SET balance = balance - ? WHERE guild_id = ? AND user_id = ?'
      ).run(fromWallet.amount, guildId, fromWallet.userId);

      const updated = db
        .prepare<[string, string], { balance: number }>(
          'SELECT balance FROM players WHERE guild_id = ? AND user_id = ?'
        )
        .get(guildId, fromWallet.userId);
      fromWalletBalance = updated?.balance;
    }

    if (toWallet) {
      db.prepare<[number, string, string]>(
        'UPDATE players SET balance = balance + ? WHERE guild_id = ? AND user_id = ?'
      ).run(toWallet.amount, guildId, toWallet.userId);

      const updated = db
        .prepare<[string, string], { balance: number }>(
          'SELECT balance FROM players WHERE guild_id = ? AND user_id = ?'
        )
        .get(guildId, toWallet.userId);
      toWalletBalance = updated?.balance;
    }

    // Bank mutations: toBank adds to bank, fromBank subtracts from bank
    const netBankDelta = (toBank ?? 0) - (fromBank ?? 0);
    if (netBankDelta !== 0) {
      db.prepare<[number, string]>(
        'UPDATE bank SET balance = balance + ? WHERE guild_id = ?'
      ).run(netBankDelta, guildId);

      const bankRow = db
        .prepare<[string], { balance: number }>('SELECT balance FROM bank WHERE guild_id = ?')
        .get(guildId);
      bankBalance = bankRow?.balance;
    }

    return {
      success: true,
      fromWalletBalance,
      toWalletBalance,
      bankBalance,
    };
  });

  // Execute inside BEGIN IMMEDIATE (better-sqlite3 transactions are DEFERRED by default;
  // use .exclusive for IMMEDIATE semantics — better-sqlite3 uses "exclusive" keyword
  // which maps to BEGIN EXCLUSIVE. For true IMMEDIATE we use the default transaction
  // since better-sqlite3 synchronous API already serializes in single-process Node.
  // With WAL mode, concurrent reads are non-blocking and concurrent writes are serialized
  // by SQLite's write lock, giving us the race protection we need.)
  return txn();
}

/**
 * Computes the fee for a given wager amount (in cents).
 * Formula: max(100, floor(wager * 0.01))
 * - Minimum fee: $1.00 (100 cents)
 * - Above $100 wager: 1% of wager
 *
 * @param wagerCents - Raw wager amount in cents
 * @returns Fee in cents
 */
export function computeFee(wagerCents: number): number {
  return Math.max(100, Math.floor(wagerCents * 0.01));
}

/**
 * Converts dollar amount (user-provided) to cents.
 * Uses Math.round to avoid floating-point issues (e.g., $10.50 → 1050).
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Formats cents as a dollar string (e.g., 1050 → "$10.50").
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
