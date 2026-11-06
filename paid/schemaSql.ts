/** Kept identical to migrations/0001_paid_orders.sql. A test fails if they drift. */
export const paidSchemaSql = `
CREATE TABLE IF NOT EXISTS paid_orders (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  product_key TEXT NOT NULL,
  player_id TEXT NOT NULL,
  email TEXT NOT NULL,
  residence_country TEXT NOT NULL,
  base_currency TEXT NOT NULL CHECK (base_currency = 'gbp'),
  base_amount_minor INTEGER NOT NULL CHECK (base_amount_minor > 0),
  waiver_version TEXT,
  waiver_accepted_at INTEGER,
  adult_confirmed INTEGER NOT NULL CHECK (adult_confirmed = 1),
  state TEXT NOT NULL CHECK (state IN ('pending','fulfilled','refunded','review_required','failed')),
  checkout_session_id TEXT UNIQUE,
  checkout_url TEXT,
  payment_intent_id TEXT,
  presentment_currency TEXT,
  presentment_amount_minor INTEGER,
  receipt_status TEXT NOT NULL DEFAULT 'pending' CHECK (receipt_status IN ('pending','sent','failed','skipped')),
  receipt_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS paid_orders_payment_intent_idx ON paid_orders(payment_intent_id);
CREATE TABLE IF NOT EXISTS paid_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  order_id TEXT,
  received_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_entitlements (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  state TEXT NOT NULL CHECK (state IN ('active','revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS paid_entitlements_player_idx ON paid_entitlements(player_id, state);
ALTER TABLE paid_entitlements ADD COLUMN expires_at INTEGER;
CREATE TABLE IF NOT EXISTS paid_players (
  player_id TEXT PRIMARY KEY,
  completed_games INTEGER NOT NULL DEFAULT 0,
  welcome_granted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_attempts (
  attempt_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  edition TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('free','paid')),
  state TEXT NOT NULL CHECK (state IN ('open','completed')),
  cowries_spent INTEGER NOT NULL DEFAULT 0 CHECK (cowries_spent >= 0),
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS paid_attempts_one_open ON paid_attempts(player_id) WHERE state = 'open';
CREATE TABLE IF NOT EXISTS paid_stats_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (day, event, detail)
);
CREATE TABLE IF NOT EXISTS paid_earn_grants (
  grant_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('perfect','share','referral_referrer','referral_new')),
  day TEXT NOT NULL,
  attempt_id TEXT,
  related_player_id TEXT,
  cowries INTEGER NOT NULL CHECK (cowries >= 0),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS paid_earn_perfect_attempt ON paid_earn_grants(attempt_id) WHERE kind = 'perfect';
CREATE UNIQUE INDEX IF NOT EXISTS paid_earn_perfect_day ON paid_earn_grants(player_id, day) WHERE kind = 'perfect' AND cowries > 0;
CREATE UNIQUE INDEX IF NOT EXISTS paid_earn_share_day ON paid_earn_grants(player_id, day) WHERE kind = 'share';
CREATE TABLE IF NOT EXISTS paid_referrals (
  player_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_referral_arrivals (
  new_player_id TEXT PRIMARY KEY,
  referrer_player_id TEXT NOT NULL,
  code TEXT NOT NULL,
  rewarded INTEGER NOT NULL DEFAULT 0 CHECK (rewarded IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_daily_plays (
  player_id TEXT NOT NULL,
  edition TEXT NOT NULL,
  day TEXT NOT NULL,
  round_id TEXT NOT NULL,
  score INTEGER,
  duration_ms INTEGER,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  PRIMARY KEY (player_id, edition, day)
);
CREATE INDEX IF NOT EXISTS paid_daily_plays_board ON paid_daily_plays(edition, day);
CREATE TABLE IF NOT EXISTS paid_streaks (
  player_id TEXT PRIMARY KEY,
  streak INTEGER NOT NULL,
  last_day TEXT,
  started_day TEXT
);
CREATE TABLE IF NOT EXISTS paid_nicknames (
  player_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_streak_grants (
  grant_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  day TEXT NOT NULL,
  cowries INTEGER NOT NULL CHECK (cowries >= 0),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paid_reveals (
  order_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  edition TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 12),
  display_name TEXT NOT NULL,
  certificate TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
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
`.trim();
