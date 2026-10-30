CREATE TABLE `retention_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text,
	`order_id` text,
	`kind` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`retain_until` integer,
	`evidence_hash` text NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `cowrie_wallets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `retention_closures` (
	`wallet_id` text PRIMARY KEY NOT NULL,
	`closed_at` integer NOT NULL,
	`financial_until` integer NOT NULL,
	`evidence_hash` text NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `cowrie_wallets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `retention_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`subject_id` text NOT NULL,
	`reason` text NOT NULL,
	`opened_at` integer NOT NULL,
	`released_at` integer,
	`evidence_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `retention_restore` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_hash` text NOT NULL,
	`verified_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `retention_settlements` (
	`order_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`reason` text NOT NULL,
	`settled_at` integer NOT NULL,
	`retain_until` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`event_id`) REFERENCES `stripe_webhook_events`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `retention_suppression` (
	`scope` text NOT NULL,
	`subject_id` text PRIMARY KEY NOT NULL,
	`unavailable_at` integer NOT NULL,
	`forget_after` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `cowrie_wallets_recovery_hash_uq`;--> statement-breakpoint
ALTER TABLE `cowrie_wallets` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `cowrie_wallets` ADD `ownership_minimized_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_wallets_recovery_hash_uq` ON `cowrie_wallets` (`recovery_credential_hash`) WHERE "cowrie_wallets"."ownership_minimized_at" is null;
--> statement-breakpoint
CREATE INDEX retention_holds_active_idx ON retention_holds(scope,subject_id) WHERE released_at IS NULL;
--> statement-breakpoint
CREATE INDEX retention_cases_due_idx ON retention_cases(retain_until,closed_at);
--> statement-breakpoint
CREATE TRIGGER retention_hold_insert_guard BEFORE INSERT ON retention_holds BEGIN
 SELECT CASE WHEN NEW.scope NOT IN ('global','wallet','order','attempt','result','case') OR NEW.reason NOT IN ('legal','tax','refund','dispute','support') OR NEW.opened_at<=0 OR NEW.released_at IS NOT NULL OR length(NEW.evidence_hash)!=64 OR NEW.evidence_hash GLOB '*[^0-9a-f]*' THEN RAISE(ABORT,'invalid retention hold') END;
END;
--> statement-breakpoint
CREATE TRIGGER retention_hold_release_guard BEFORE UPDATE ON retention_holds WHEN NEW.id IS NOT OLD.id OR NEW.scope IS NOT OLD.scope OR NEW.subject_id IS NOT OLD.subject_id OR NEW.reason IS NOT OLD.reason OR NEW.opened_at IS NOT OLD.opened_at OR NEW.evidence_hash IS NOT OLD.evidence_hash OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR NEW.released_at<OLD.opened_at BEGIN SELECT RAISE(ABORT,'hold authority immutable'); END;
--> statement-breakpoint
CREATE TRIGGER retention_case_insert_guard BEFORE INSERT ON retention_cases WHEN NEW.kind NOT IN ('support','privacy','refund','dispute') OR NEW.opened_at<=0 OR NEW.closed_at IS NOT NULL OR NEW.retain_until IS NOT NULL OR length(NEW.evidence_hash)!=64 OR NEW.evidence_hash GLOB '*[^0-9a-f]*' BEGIN SELECT RAISE(ABORT,'invalid retention case'); END;
--> statement-breakpoint
CREATE TRIGGER retention_case_close_guard BEFORE UPDATE ON retention_cases WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.wallet_id IS NOT OLD.wallet_id OR NEW.order_id IS NOT OLD.order_id OR NEW.evidence_hash IS NOT OLD.evidence_hash OR NEW.opened_at IS NOT OLD.opened_at OR OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL OR NEW.closed_at<OLD.opened_at OR NEW.retain_until IS NULL OR NEW.retain_until<=NEW.closed_at BEGIN SELECT RAISE(ABORT,'case closure immutable'); END;
--> statement-breakpoint
CREATE TRIGGER retention_settlement_guard BEFORE INSERT ON retention_settlements BEGIN
 SELECT CASE WHEN NEW.reason NOT IN ('verified_refund','verified_dispute') OR NEW.settled_at<=0 OR NEW.retain_until<=NEW.settled_at OR NOT EXISTS(
 SELECT 1 FROM commerce_orders o JOIN stripe_webhook_events e ON e.id=NEW.event_id
 WHERE o.id=NEW.order_id AND e.processing_result='processed' AND e.payment_intent_hash=o.stripe_payment_intent_hash
 AND e.amount_minor=o.amount_minor AND COALESCE(e.processed_at,e.updated_at)<=NEW.settled_at AND
 ((NEW.reason='verified_refund' AND o.state='refunded' AND e.event_type='charge.refunded' AND e.amount_refunded_minor=o.amount_minor)
 OR (NEW.reason='verified_dispute' AND o.state='disputed' AND e.event_type='charge.dispute.created'))
 AND (o.product_key='royal_reveal_v1' OR EXISTS(SELECT 1 FROM cowrie_purchase_allocations a JOIN cowrie_ledger l ON l.related_allocation_id=a.id
 WHERE a.order_id=o.id AND a.remaining_quantity=0 AND a.state IN ('refunded','disputed') AND l.related_order_id=o.id AND l.entry_type='refund_reversal' AND l.delta<0 AND l.reason_code=NEW.reason))) THEN RAISE(ABORT,'verified settlement required') END;
END;
--> statement-breakpoint
CREATE TRIGGER retention_settlement_immutable BEFORE UPDATE ON retention_settlements BEGIN SELECT RAISE(ABORT,'settlement authority immutable'); END;
--> statement-breakpoint
CREATE TRIGGER retention_closure_guard BEFORE INSERT ON retention_closures BEGIN
 SELECT CASE WHEN NEW.closed_at<=0 OR NEW.financial_until<=NEW.closed_at OR length(NEW.evidence_hash)!=64 OR NEW.evidence_hash GLOB '*[^0-9a-f]*' OR NOT EXISTS(SELECT 1 FROM cowrie_wallets w WHERE w.id=NEW.wallet_id AND w.closed_at IS NULL AND w.state IN ('active','frozen') AND w.purchased_balance=0 AND w.purchased_balance=COALESCE((SELECT SUM(l.delta) FROM cowrie_ledger l WHERE l.wallet_id=w.id AND l.bucket='purchased'),0) AND w.bonus_balance=COALESCE((SELECT SUM(l.delta) FROM cowrie_ledger l WHERE l.wallet_id=w.id AND l.bucket='bonus'),0) AND w.purchased_balance=COALESCE((SELECT SUM(a.remaining_quantity) FROM cowrie_purchase_allocations a WHERE a.wallet_id=w.id),0)) THEN RAISE(ABORT,'wallet reconciliation required') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM retention_active_wallet_holds WHERE id=NEW.wallet_id) THEN RAISE(ABORT,'active hold prevents closure') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM retention_cases c WHERE c.closed_at IS NULL AND (c.wallet_id=NEW.wallet_id OR c.order_id IN (SELECT id FROM commerce_orders WHERE cowrie_wallet_id=NEW.wallet_id))) THEN RAISE(ABORT,'unresolved case prevents closure') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM commerce_orders o WHERE o.cowrie_wallet_id=NEW.wallet_id AND (o.state IN ('pending','paid','review_required') OR (o.state IN ('refunded','disputed') AND NOT EXISTS(SELECT 1 FROM retention_settlements s WHERE s.order_id=o.id)))) OR EXISTS(SELECT 1 FROM cowrie_purchase_allocations WHERE wallet_id=NEW.wallet_id AND (remaining_quantity!=0 OR state='review_required')) THEN RAISE(ABORT,'unresolved payment prevents closure') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM stripe_webhook_events e JOIN commerce_orders o ON o.id=e.order_id OR o.stripe_payment_intent_hash=e.payment_intent_hash WHERE o.cowrie_wallet_id=NEW.wallet_id AND e.processing_result IN ('received','failed','review_required')) THEN RAISE(ABORT,'unresolved event prevents closure') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM cowrie_ledger d JOIN quiz_attempts qa ON qa.id=d.related_attempt_id WHERE d.wallet_id=NEW.wallet_id AND d.entry_type='quick_play_debit' AND qa.cowrie_issued_at IS NULL AND NOT EXISTS(SELECT 1 FROM cowrie_ledger r WHERE r.reversal_of_ledger_id=d.id AND r.entry_type='technical_reversal')) THEN RAISE(ABORT,'unresolved reversal prevents closure') END;
END;
--> statement-breakpoint
CREATE TRIGGER retention_closure_apply AFTER INSERT ON retention_closures BEGIN UPDATE cowrie_wallets SET state='deleted',closed_at=NEW.closed_at,deleted_at=NEW.closed_at,retention_expires_at=NEW.financial_until,updated_at=NEW.closed_at,version=version+1 WHERE id=NEW.wallet_id; END;
--> statement-breakpoint
CREATE TRIGGER retention_closure_immutable BEFORE UPDATE ON retention_closures BEGIN SELECT RAISE(ABORT,'closure immutable'); END;
--> statement-breakpoint
CREATE TRIGGER retention_closure_delete_guard BEFORE DELETE ON retention_closures BEGIN SELECT RAISE(ABORT,'closure cannot be forgotten'); END;
--> statement-breakpoint
CREATE TRIGGER retention_wallet_closed_guard BEFORE UPDATE ON cowrie_wallets WHEN OLD.closed_at IS NOT NULL AND (NEW.closed_at IS NOT OLD.closed_at OR NEW.state!='deleted' OR NEW.deleted_at IS NOT OLD.deleted_at OR NEW.retention_expires_at IS NOT OLD.retention_expires_at) BEGIN SELECT RAISE(ABORT,'closed wallet cannot reopen'); END;
--> statement-breakpoint
CREATE TRIGGER retention_wallet_closure_authority BEFORE UPDATE OF closed_at ON cowrie_wallets WHEN NEW.closed_at IS NOT OLD.closed_at AND NOT EXISTS(SELECT 1 FROM retention_closures WHERE wallet_id=NEW.id AND closed_at=NEW.closed_at) BEGIN SELECT RAISE(ABORT,'operator closure required'); END;
--> statement-breakpoint
CREATE TRIGGER retention_wallet_minimise_guard BEFORE UPDATE OF ownership_minimized_at,anonymous_owner_hash,recovery_credential_hash ON cowrie_wallets WHEN NEW.ownership_minimized_at IS NOT OLD.ownership_minimized_at AND (OLD.ownership_minimized_at IS NOT NULL OR NEW.ownership_minimized_at IS NULL OR NEW.closed_at IS NULL OR NEW.ownership_minimized_at<NEW.closed_at+2592000000 OR NEW.anonymous_owner_hash!=printf('%064d',0) OR NEW.recovery_credential_hash!=printf('%064d',0) OR EXISTS(SELECT 1 FROM retention_active_wallet_holds WHERE id=NEW.id)) BEGIN SELECT RAISE(ABORT,'minimisation authority required'); END;
--> statement-breakpoint
CREATE TRIGGER retention_wallet_minimised_immutable BEFORE UPDATE OF anonymous_owner_hash,recovery_credential_hash,ownership_minimized_at ON cowrie_wallets WHEN OLD.ownership_minimized_at IS NOT NULL AND (NEW.anonymous_owner_hash IS NOT OLD.anonymous_owner_hash OR NEW.recovery_credential_hash IS NOT OLD.recovery_credential_hash OR NEW.ownership_minimized_at IS NOT OLD.ownership_minimized_at) BEGIN SELECT RAISE(ABORT,'minimised ownership cannot reconnect'); END;
--> statement-breakpoint
CREATE VIEW retention_protected_attempts AS SELECT DISTINCT qa.id FROM quiz_attempts qa WHERE
 EXISTS(SELECT 1 FROM retention_holds h WHERE h.released_at IS NULL AND (h.scope='global' OR (h.scope='attempt' AND h.subject_id=qa.id) OR (h.scope='result' AND h.subject_id IN (SELECT id FROM results WHERE attempt_id=qa.id)) OR (h.scope='wallet' AND h.subject_id IN (SELECT wallet_id FROM cowrie_ledger WHERE related_attempt_id=qa.id UNION SELECT id FROM cowrie_wallets WHERE ownership_minimized_at IS NULL AND anonymous_owner_hash=qa.anonymous_subject_hash)) OR (h.scope='order' AND h.subject_id IN (SELECT id FROM commerce_orders WHERE result_id IN (SELECT id FROM results WHERE attempt_id=qa.id)))))
 OR EXISTS(SELECT 1 FROM retention_cases c WHERE c.closed_at IS NULL AND (c.wallet_id IN (SELECT wallet_id FROM cowrie_ledger WHERE related_attempt_id=qa.id UNION SELECT id FROM cowrie_wallets WHERE ownership_minimized_at IS NULL AND anonymous_owner_hash=qa.anonymous_subject_hash) OR c.order_id IN (SELECT id FROM commerce_orders WHERE result_id IN (SELECT id FROM results WHERE attempt_id=qa.id))));

--> statement-breakpoint
CREATE TRIGGER retention_closure_suppression AFTER INSERT ON retention_closures BEGIN INSERT INTO retention_suppression(scope,subject_id,unavailable_at,forget_after) VALUES('wallet',NEW.wallet_id,NEW.closed_at,NEW.closed_at+2592000000) ON CONFLICT(subject_id) DO NOTHING; END;
--> statement-breakpoint
CREATE TRIGGER retention_financial_schedule AFTER INSERT ON commerce_orders BEGIN UPDATE commerce_orders SET retention_expires_at=MAX(retention_expires_at,CAST(strftime('%s',printf('%04d-02-01',CAST(strftime('%Y',NEW.created_at/1000,'unixepoch') AS INTEGER)+CASE WHEN strftime('%m-%d %H:%M',NEW.created_at/1000,'unixepoch')>='04-05 23:00' THEN 7 ELSE 6 END)) AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
UPDATE commerce_orders SET retention_expires_at=MAX(retention_expires_at,CAST(strftime('%s',printf('%04d-02-01',CAST(strftime('%Y',created_at/1000,'unixepoch') AS INTEGER)+CASE WHEN strftime('%m-%d %H:%M',created_at/1000,'unixepoch')>='04-05 23:00' THEN 7 ELSE 6 END)) AS INTEGER)*1000);
--> statement-breakpoint
CREATE TRIGGER retention_hold_delete_guard BEFORE DELETE ON retention_holds WHEN OLD.released_at IS NULL BEGIN SELECT RAISE(ABORT,'active holds cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER retention_case_delete_guard BEFORE DELETE ON retention_cases WHEN OLD.closed_at IS NULL OR EXISTS(SELECT 1 FROM retention_active_case_holds WHERE id=OLD.id) BEGIN SELECT RAISE(ABORT,'unresolved case cannot be deleted'); END;

--> statement-breakpoint
CREATE TRIGGER retention_attempt_no_reconnect BEFORE UPDATE OF status,anonymous_subject_hash ON quiz_attempts WHEN (OLD.anonymized_at IS NOT NULL OR OLD.deleted_at IS NOT NULL) AND (NEW.status NOT IN ('anonymized','deleted','expired') OR (OLD.anonymized_at IS NOT NULL AND NEW.anonymous_subject_hash IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'purged attempt cannot reconnect'); END;
--> statement-breakpoint
CREATE TRIGGER retention_result_no_reopen BEFORE UPDATE OF state ON results WHEN (OLD.anonymized_at IS NOT NULL OR OLD.deleted_at IS NOT NULL) AND NEW.state='active' BEGIN SELECT RAISE(ABORT,'purged result cannot reopen'); END;

--> statement-breakpoint
CREATE TABLE retention_order_minimisation (order_id TEXT PRIMARY KEY NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,minimised_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER retention_order_minimisation_guard BEFORE INSERT ON retention_order_minimisation BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM retention_active_order_holds WHERE id=NEW.order_id) OR NOT EXISTS(SELECT 1 FROM commerce_orders o WHERE o.id=NEW.order_id AND o.retention_expires_at<=NEW.minimised_at AND o.state NOT IN ('pending','paid','review_required') AND (o.cowrie_wallet_id IS NULL OR EXISTS(SELECT 1 FROM retention_closures cl WHERE cl.wallet_id=o.cowrie_wallet_id AND cl.financial_until<=NEW.minimised_at)) AND NOT EXISTS(SELECT 1 FROM retention_cases c WHERE c.closed_at IS NULL AND (c.order_id=o.id OR c.wallet_id=o.cowrie_wallet_id)) AND NOT EXISTS(SELECT 1 FROM retention_settlements s WHERE s.order_id=o.id AND s.retain_until>NEW.minimised_at) AND NOT EXISTS(SELECT 1 FROM stripe_webhook_events e WHERE (e.order_id=o.id OR e.payment_intent_hash=o.stripe_payment_intent_hash) AND e.processing_result IN ('received','failed','review_required'))) THEN RAISE(ABORT,'financial dependencies still required') END;
END;
--> statement-breakpoint
CREATE TRIGGER retention_order_minimisation_immutable BEFORE UPDATE ON retention_order_minimisation BEGIN SELECT RAISE(ABORT,'minimisation immutable'); END;
--> statement-breakpoint
DROP TRIGGER commerce_order_target_immutable;
--> statement-breakpoint
CREATE TRIGGER commerce_order_target_immutable BEFORE UPDATE OF product_key,result_id,cowrie_wallet_id,anonymous_owner_hash,currency,amount_minor,stripe_payment_intent_id ON commerce_orders WHEN NEW.product_key IS NOT OLD.product_key OR NEW.result_id IS NOT OLD.result_id OR NEW.cowrie_wallet_id IS NOT OLD.cowrie_wallet_id OR NEW.currency IS NOT OLD.currency OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.stripe_payment_intent_id IS NOT OLD.stripe_payment_intent_id OR (NEW.anonymous_owner_hash IS NOT OLD.anonymous_owner_hash AND NOT (NEW.anonymous_owner_hash=printf('%064d',0) AND EXISTS(SELECT 1 FROM retention_order_minimisation WHERE order_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM retention_active_order_holds WHERE id=NEW.id))) BEGIN SELECT RAISE(ABORT,'order authority immutable'); END;
--> statement-breakpoint
CREATE TRIGGER retention_case_financial_extension AFTER UPDATE OF closed_at ON retention_cases BEGIN UPDATE commerce_orders SET retention_expires_at=MAX(retention_expires_at,NEW.retain_until) WHERE id=NEW.order_id OR cowrie_wallet_id=NEW.wallet_id; END;
--> statement-breakpoint
CREATE TRIGGER retention_settlement_financial_extension AFTER INSERT ON retention_settlements BEGIN UPDATE commerce_orders SET retention_expires_at=MAX(retention_expires_at,NEW.retain_until) WHERE id=NEW.order_id; END;

--> statement-breakpoint
CREATE TRIGGER retention_wallet_no_recovery BEFORE UPDATE OF state ON cowrie_wallets WHEN OLD.state='deleted' AND NEW.state!='deleted' BEGIN SELECT RAISE(ABORT,'deleted wallet cannot reopen'); END;
--> statement-breakpoint
CREATE TRIGGER retention_wallet_initial_authority BEFORE INSERT ON cowrie_wallets WHEN NEW.closed_at IS NOT NULL OR NEW.ownership_minimized_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'new wallet cannot invent closure'); END;

--> statement-breakpoint
CREATE TRIGGER retention_closed_wallet_identity_guard BEFORE UPDATE OF anonymous_owner_hash,recovery_credential_hash ON cowrie_wallets WHEN OLD.closed_at IS NOT NULL AND (NEW.anonymous_owner_hash IS NOT OLD.anonymous_owner_hash OR NEW.recovery_credential_hash IS NOT OLD.recovery_credential_hash) AND NOT (OLD.ownership_minimized_at IS NULL AND NEW.ownership_minimized_at>=OLD.closed_at+2592000000 AND NEW.anonymous_owner_hash=printf('%064d',0) AND NEW.recovery_credential_hash=printf('%064d',0)) BEGIN SELECT RAISE(ABORT,'closed identity cannot rotate'); END;
--> statement-breakpoint
CREATE TRIGGER retention_settlement_delete_guard BEFORE DELETE ON retention_settlements WHEN NOT EXISTS(SELECT 1 FROM retention_order_minimisation WHERE order_id=OLD.order_id AND minimised_at>=OLD.retain_until) OR EXISTS(SELECT 1 FROM retention_active_order_holds WHERE id=OLD.order_id) BEGIN SELECT RAISE(ABORT,'settlement proof still required'); END;

--> statement-breakpoint
CREATE VIEW retention_active_wallet_holds AS SELECT DISTINCT w.id FROM cowrie_wallets w WHERE EXISTS(SELECT 1 FROM retention_holds h WHERE h.released_at IS NULL AND (
 h.scope='global' OR (h.scope='wallet' AND h.subject_id=w.id)
 OR (h.scope='order' AND h.subject_id IN (SELECT id FROM commerce_orders WHERE cowrie_wallet_id=w.id))
 OR (h.scope='attempt' AND (h.subject_id IN (SELECT related_attempt_id FROM cowrie_ledger WHERE wallet_id=w.id) OR (w.ownership_minimized_at IS NULL AND h.subject_id IN (SELECT id FROM quiz_attempts WHERE anonymous_subject_hash=w.anonymous_owner_hash))))
 OR (h.scope='result' AND h.subject_id IN (SELECT r.id FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id WHERE qa.id IN (SELECT related_attempt_id FROM cowrie_ledger WHERE wallet_id=w.id) OR (w.ownership_minimized_at IS NULL AND qa.anonymous_subject_hash=w.anonymous_owner_hash)))
 OR (h.scope='case' AND h.subject_id IN (SELECT id FROM retention_cases WHERE wallet_id=w.id OR order_id IN (SELECT id FROM commerce_orders WHERE cowrie_wallet_id=w.id)))));
--> statement-breakpoint
CREATE VIEW retention_active_order_holds AS SELECT DISTINCT o.id FROM commerce_orders o WHERE o.cowrie_wallet_id IN (SELECT id FROM retention_active_wallet_holds) OR EXISTS(SELECT 1 FROM retention_holds h WHERE h.released_at IS NULL AND (h.scope='global' OR (h.scope='order' AND h.subject_id=o.id) OR (h.scope='result' AND h.subject_id=o.result_id) OR (h.scope='attempt' AND h.subject_id IN (SELECT attempt_id FROM results WHERE id=o.result_id)) OR (h.scope='case' AND h.subject_id IN (SELECT id FROM retention_cases WHERE order_id=o.id))));
--> statement-breakpoint
CREATE VIEW retention_active_case_holds AS SELECT DISTINCT c.id FROM retention_cases c WHERE c.wallet_id IN (SELECT id FROM retention_active_wallet_holds) OR c.order_id IN (SELECT id FROM retention_active_order_holds) OR EXISTS(SELECT 1 FROM retention_holds h WHERE h.released_at IS NULL AND (h.scope='global' OR (h.scope='case' AND h.subject_id=c.id)));
