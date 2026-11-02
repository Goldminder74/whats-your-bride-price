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
