-- migrations/001_initial.sql
-- Wanna Bet Bot — initial schema
-- All monetary values stored as integer CENTS. $1.00 = 100. $100.00 = 10000.
-- Fee formula: max(100, floor(wager_cents * 0.01))

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Guilds ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guilds (
  guild_id               TEXT    NOT NULL PRIMARY KEY,
  gambler_role_id        TEXT,
  audit_channel_id       TEXT,
  current_admin_id       TEXT,               -- user_id of elected admin, NULL if none
  last_vote_started_at   INTEGER,            -- unix ms; for 24h cooldown gate
  vote_cooldown_waived   INTEGER NOT NULL DEFAULT 0, -- 1 = waived after admin auto-revoke
  created_at             INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ─── Bank ─────────────────────────────────────────────────────────────────────
-- Singleton row per guild. INSERT on first guild interaction.

CREATE TABLE IF NOT EXISTS bank (
  guild_id  TEXT    NOT NULL PRIMARY KEY REFERENCES guilds(guild_id),
  balance   INTEGER NOT NULL DEFAULT 0
  -- NOTE: stored in CENTS. $1.00 = 100.
);

-- ─── Players ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS players (
  guild_id             TEXT    NOT NULL,
  user_id              TEXT    NOT NULL,
  balance              INTEGER NOT NULL DEFAULT 0,   -- cents
  status               TEXT    NOT NULL DEFAULT 'active'
                                CHECK(status IN ('active','inactive','banned')),
  registered_at        INTEGER NOT NULL,              -- unix ms
  last_active_at       INTEGER NOT NULL,              -- unix ms
  last_daily_utc_date  TEXT,                          -- 'YYYY-MM-DD' UTC
  prior_balance        INTEGER,                       -- preserved on inactivation
  PRIMARY KEY (guild_id, user_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id)
);

CREATE INDEX IF NOT EXISTS idx_players_guild_status
  ON players(guild_id, status);

CREATE INDEX IF NOT EXISTS idx_players_last_active
  ON players(guild_id, last_active_at);

-- ─── Bets ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bets (
  bet_id                TEXT    NOT NULL,                -- 4-char alphanumeric, e.g. A3F7
  guild_id              TEXT    NOT NULL,
  channel_id            TEXT    NOT NULL,
  creator_id            TEXT    NOT NULL,
  description           TEXT    NOT NULL,
  side_a_label          TEXT    NOT NULL,
  side_b_label          TEXT    NOT NULL,
  initiator_side        TEXT    NOT NULL CHECK(initiator_side IN ('A','B')),
  direct_opponent_id    TEXT,                           -- NULL = open/lobby
  is_lobby              INTEGER NOT NULL DEFAULT 0,      -- boolean
  window_minutes        INTEGER NOT NULL DEFAULT 10,
  window_closes_at      INTEGER NOT NULL,                -- unix ms
  status                TEXT    NOT NULL DEFAULT 'open'
                        CHECK(status IN ('open','locked','proposed','disputed',
                                         'resolved','cancelled')),
  proposed_outcome      TEXT    CHECK(proposed_outcome IN ('A','B','neither')),
  proposer_id           TEXT,
  proposal_message_id   TEXT,                           -- Discord message ID for button collectors
  resolved_at           INTEGER,                        -- unix ms
  resolved_outcome      TEXT    CHECK(resolved_outcome IN ('A','B','neither')),
  resolver_id           TEXT,                           -- who actually settled it
  created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  PRIMARY KEY (bet_id, guild_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bets_bet_id_guild
  ON bets(bet_id, guild_id);

CREATE INDEX IF NOT EXISTS idx_bets_guild_status
  ON bets(guild_id, status);

CREATE INDEX IF NOT EXISTS idx_bets_creator
  ON bets(guild_id, creator_id);

-- ─── Bet Participants ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bet_participants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id          TEXT    NOT NULL,
  guild_id        TEXT    NOT NULL,
  user_id         TEXT    NOT NULL,
  side            TEXT    NOT NULL CHECK(side IN ('A','B')),
  stake           INTEGER NOT NULL,  -- cents; amount AFTER fee deducted (net into pool)
  fee_paid        INTEGER NOT NULL,  -- cents; amount sent to bank at join time
  payout_received INTEGER,           -- cents; gross amount returned to wallet at settlement (NULL until resolved)
  joined_at       INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  UNIQUE(bet_id, guild_id, user_id),
  FOREIGN KEY (bet_id, guild_id) REFERENCES bets(bet_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_bp_bet
  ON bet_participants(bet_id, guild_id);

CREATE INDEX IF NOT EXISTS idx_bp_user
  ON bet_participants(guild_id, user_id);

-- ─── Resolution Confirmations ─────────────────────────────────────────────────
-- Tracks each participant's Confirm/Dispute response to a resolution proposal.

CREATE TABLE IF NOT EXISTS resolution_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id       TEXT    NOT NULL,
  guild_id     TEXT    NOT NULL,
  user_id      TEXT    NOT NULL,
  response     TEXT    NOT NULL CHECK(response IN ('confirm','dispute')),
  responded_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  UNIQUE(bet_id, guild_id, user_id),
  FOREIGN KEY (bet_id, guild_id) REFERENCES bets(bet_id, guild_id)
);

-- ─── Elections ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS elections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT    NOT NULL,
  started_at      INTEGER NOT NULL,   -- unix ms
  ends_at         INTEGER NOT NULL,   -- unix ms (started_at + 1 hour)
  status          TEXT    NOT NULL DEFAULT 'open'
                  CHECK(status IN ('open','closed','failed')),
  result_admin_id TEXT,               -- NULL until closed with a winner
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id)
);

CREATE INDEX IF NOT EXISTS idx_elections_guild_status
  ON elections(guild_id, status);

-- ─── Nominations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nominations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id  INTEGER NOT NULL REFERENCES elections(id),
  candidate_id TEXT    NOT NULL,
  nominated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  UNIQUE(election_id, candidate_id)
);

-- ─── Votes ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS votes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id  INTEGER NOT NULL REFERENCES elections(id),
  voter_id     TEXT    NOT NULL,
  candidate_id TEXT    NOT NULL,
  voted_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  UNIQUE(election_id, voter_id)
);

-- ─── Audit Log ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  actor_id     TEXT    NOT NULL,
  action_type  TEXT    NOT NULL,
  payload_json TEXT    NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_audit_guild
  ON audit_log(guild_id, created_at DESC);
