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
