CREATE TABLE purchase_confirmations (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
 contract_hash TEXT NOT NULL CHECK(length(contract_hash)=64),
 encrypted_contract TEXT NOT NULL,
 encrypted_recipient TEXT,
 state TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK(state IN ('awaiting_payment','ready','sending','sent','uncertain','cancelled')),
 attempt_id TEXT UNIQUE,
 attempted_at INTEGER,
 delivered_at INTEGER,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 CHECK(updated_at>=created_at),
 CHECK((attempt_id IS NULL AND attempted_at IS NULL) OR (attempt_id IS NOT NULL AND attempted_at>=created_at)),
 CHECK((state='sent' AND delivered_at IS NOT NULL AND delivered_at>=attempted_at AND encrypted_recipient IS NULL) OR (state!='sent' AND delivered_at IS NULL)),
 CHECK(state NOT IN ('sending','uncertain','sent') OR attempt_id IS NOT NULL),
 CHECK(state NOT IN ('ready','sending','uncertain') OR encrypted_recipient IS NOT NULL),
 CHECK(state!='cancelled' OR encrypted_recipient IS NULL)
);
--> statement-breakpoint
CREATE INDEX purchase_confirmation_delivery_idx ON purchase_confirmations(state,updated_at,order_id);
--> statement-breakpoint
CREATE TRIGGER purchase_confirmation_immutable BEFORE UPDATE OF order_id,contract_hash,encrypted_contract,created_at ON purchase_confirmations BEGIN
 SELECT RAISE(ABORT,'purchase confirmation is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER purchase_confirmation_transition BEFORE UPDATE ON purchase_confirmations BEGIN
 SELECT CASE WHEN NEW.version!=OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN RAISE(ABORT,'purchase confirmation version mismatch') END;
 SELECT CASE WHEN NOT (
 (OLD.state='awaiting_payment' AND NEW.state IN ('ready','cancelled')) OR
 (OLD.state='ready' AND NEW.state IN ('sending','cancelled')) OR
 (OLD.state='sending' AND NEW.state IN ('sent','uncertain','ready')) OR
 (OLD.state='uncertain' AND NEW.state IN ('sent','cancelled'))
 ) THEN RAISE(ABORT,'purchase confirmation transition rejected') END;
END;

--> statement-breakpoint
CREATE TRIGGER purchase_confirmation_new_order BEFORE INSERT ON purchase_confirmations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commerce_orders WHERE id=NEW.order_id AND state='pending' AND created_at=NEW.created_at AND immediate_delivery_consent_at=NEW.created_at) THEN RAISE(ABORT,'purchase confirmation requires new pending order') END;
END;

--> statement-breakpoint
CREATE TRIGGER purchase_confirmation_minimise AFTER INSERT ON retention_order_minimisation BEGIN
 DELETE FROM purchase_confirmations WHERE order_id=NEW.order_id;
END;
