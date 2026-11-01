# Snapshot correction — 24 October 2026

Source-only continuation of31288ff. No hosted resource, deployment, Secret, schema,
schedule, DNS, Stripe or spending changed. This is not hosted capacity/RTO proof.

## Correction and boundaries

The previous full source snapshot kept the source journal exporting across over
11,000 calls at the90-day minimum. Daily unrelated history census also inserted
and later deleted one scratch row per archive object. Compression did not fix it.

New optional recovery-mirror code uses existing checkpoints, unchanged0000–0013
and already approved0014. No new migration. A private, explicitly identified mirror
is initially populated through the existing verified import. Its empty access
receipt is mandatory; it cannot serve players. A same-Cloudflare mirror does not
replace independently encrypted recovery custody or independent-key custody.

Replay pins an authenticated independent committed head, applies at most25 ORIGINAL
events per call, and commits each business effect, outbox copy and cursor in one
transaction under only the MIRROR writer fence. Original clocks, SQL, accounting,
hold/closure/deletion semantics are unchanged. An interrupted cut is unsealed and
cannot be snapshotted. A lost reply resumes the exact stable operation/cursor.

Capture freezes only the mirror. Explicit v4 full boundaries carry authenticated
mirror identity/cut metadata and require complete inventory ON RECOVERY. Normal
mirror capture verifies full snapshot/proof bytes and journal cut without scanning
unrelated historical custody. Default legacy/source capture still performs its
existing census. V3 latest-authority tails may anchor v2 or v4 snapshots.

Source publication acknowledgement takes short steps of at most25 outbox rows,
checking the source cut and CURRENT independent head. It cannot acknowledge a
forged/stale publication. It never runs a full source census or snapshot fence.
Only operational checkpoint validity may advance to the new verified archive;
business/event clocks never restart. Full lost-index reconstruction, every inventory
page, current committed head, financial reconciliation and suppression checks are
STILL required before restored application access. Source-loss recovery cannot use
an incomplete cut or an old snapshot alone when newer acknowledged events exist.

## Meaningful local result

Actual migrations and repositories,1,000 physical completed-game rows/12,000 answers,
10,000 signed historical archive objects. These historical rows are synthetic stock,
not1,000 measured player completions. Real later refund/settlement, wallet closure,
legal hold and attempt/result deletion go through journalled authority writers.

-31 bounded capture calls;31 source writes completed while capture was still in
 flight. Source journal remained idle/ready. This proves actual local overlap,
 not a hosted latency/throughput guarantee.
-0 routine provider inventory calls and0 per-object census scratch rows for capture,
 despite10,000 historical objects. Full recovery still enumerated them.
-Crash after mirror business commit and lost capture-progress reply both resumed
 without duplicate accounting. Partial cuts, wrong identity, corrupt independent
 intent and forged snapshot publication failed closed.
-All file IDs were lost/reconstructed; latest authority after the snapshot cut was
 discovered and replayed. Protected table rows and foreign keys matched source,
 including financial relationships, holds, closed wallets and deletion suppression.
-No restore access receipt was installed. Snapshotting never opened recovery.

Compiled private operations expose only optional initialise/replay/capture/ack RPCs;
`#mirrorRuntime` is private, never a key-returning RPC. HTTP remains404. Existing
operations/mirror flags OFF or missing binding deny every new call. No configuration
file adds MIRROR_DB or enables the new flag. Mirror provisioning is outside the
currently approved hosted scope and remains in the one proposed validation package.

## Validation/evidence

Full shared data integration:409/433 passed initially;24 hit sandbox loopback/file
rename/lock restrictions. The eight affected files then passed62/62 with ordinary
local permissions and unchanged assertions. Thus all433 original checks are covered;
no source failure was waived. The new whole-account billing regression plus prior
capacity checks pass5/5 after that integration run. Compiled operations/archive5/5,
lint and typecheck pass. Initial synthetic mirror fixture failures led to fixing
checkpoint kind and realistic index reconstruction in tests; no guard was relaxed.

Ignored evidence: outputs/authority-preparation/20261024-mirror-{focus,recovery,data,
data-permissions,ops-build,ops-permissions,lint,typecheck}.log and20261024-cost-model.log.
Do not commit generated databases, encrypted archives, logs or credentials.
Reuse prior450k/5.4m physical local restore evidence for unchanged snapshot/import
format bounds. It is a90-day lower bound, not99-day/30-day-custody hosted recovery.

## Deployment and rollback requirements

No production mirror currently exists. Bootstrap before public access, with a
verified current initial cut and matching snapshot decoder; leave source untouched.
Only a private ops binding may reach the mirror. Stop snapshot scheduling on failure;
source acknowledgements still require independent delivery. Financial access must
fail closed if required custody/head protection fails. Normal mirror lag, capture
pause and catch-up must be measured separately; capture may exceed5minutes.

Roll back application code only to a decoder that supports archives already emitted.
Do not revert money/settlement/closure/suppression state. Keep source journal/custody,
stop new sales before payment rollback, and reconcile in-flight signed Stripe events.
A mirror may be rebuilt from independently verified archives, never declared a
replacement for them. No provider invoice or account-wide GBP hard cap is claimed.
