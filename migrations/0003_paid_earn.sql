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
