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
