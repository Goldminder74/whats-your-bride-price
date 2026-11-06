ALTER TABLE paid_daily_plays ADD COLUMN boosted INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS paid_cowrie_ledger (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cowrie_spend_booster_v1','cowrie_spend_freeze_v1','cowrie_spend_frame_v1')),
  ref_id TEXT NOT NULL UNIQUE,
  cowries INTEGER NOT NULL CHECK (cowries > 0),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_booster_uses (
  use_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  round_kind TEXT NOT NULL CHECK (round_kind IN ('game','daily')),
  kind TEXT NOT NULL CHECK (kind IN ('fifty','hint','skip','second')),
  edition TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  replacement_json TEXT,
  cowries INTEGER NOT NULL CHECK (cowries > 0),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS paid_booster_one_kind ON paid_booster_uses(player_id, round_id, kind);
CREATE TABLE IF NOT EXISTS paid_round_slots (
  player_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  question_json TEXT NOT NULL,
  PRIMARY KEY (player_id, round_id, slot)
);
CREATE TABLE IF NOT EXISTS paid_streak_freezes (
  player_id TEXT PRIMARY KEY,
  held INTEGER NOT NULL CHECK (held >= 0 AND held <= 2),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_frame_grants (
  grant_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  frame_key TEXT NOT NULL,
  cowries INTEGER NOT NULL CHECK (cowries > 0),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS paid_frame_owner ON paid_frame_grants(player_id, frame_key);
