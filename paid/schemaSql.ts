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
`.trim();
