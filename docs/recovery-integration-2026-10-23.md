# Recovery and private runtime integration — 23 October 2026

Source continuation from3ac33be. No hosted deployment, schema change, email send,
schedule, purchase, DNS change or public activation accompanies this work.
Existing seller/OAuth/key/alert setup remains complete.

## Completed, locally verified

- A verified v2 full snapshot can be combined with a v3 independently read-back
  authority tail. Tail checkpoints do not recapture every business table or perform
  another whole-history census. They do not advance the full-snapshot baseline.
- Offline recovery replays the exact original bounded SQL, sequence/hash chain and
  retention clocks into disposable SQLite. Each event and its cursor commit
  atomically. Lost responses resume without repeating money or deletion effects.
- Real repository fixtures cover a later refund and verified settlement, support
  closure, wallet closure, legal hold and attempt/result suppression. Source loss,
  interrupted import and a lost finalisation response are exercised. Full hashes
  and foreign keys match. A verification receipt never changes public access or
  the separately configured expected runtime receipt.
- New Drive objects have authenticated minimal identity/hash/clock/sequence headers.
  No SQL, customer identity or amount appears in this metadata. Recovery verifies
  required ciphertext; older unsigned objects retain their pinned-index/body path.
- A separate authenticated committed high-water mark detects loss of the LAST
  committed object after total source/index loss. Mutation acknowledgement waits
  for its independent publication/readback. An older restored fork cannot replace
  a newer head. An unresolved intent still blocks recovery.
  For new adapters, membership in its complete authenticated hash-linked prefix
  replaces redundant per-intent marker updates; legacy marker/.event proofs retain
  their old checks. Required ciphertext is still downloaded/read back. The new
  protocol rejects forks, missing final records and uncommitted/ambiguous tails.
- `discoverLatestAuthority` performs two matching complete unfiltered provider
  scans, preserves original file IDs/clocks and reconstructs a contiguous committed
  tail against that high-water mark. It is offline/disposable preparation, not a
  source-outbox fallback or an access grant. Unknown objects, gaps, forged markers,
  expiry, changing inventories and unsupported legacy identity loss fail closed.
- Finalisation requires complete target hash/FK verification, a fresh post-import
  independent inventory and matching latest head, under the shared target writer
  fence. It cannot release from a legacy head-adoption certificate.

## Confirmed concurrent-read defect and correction

The old adapter checked a global journal fence, read a row, then checked the fence
again. An unrelated wallet write could invalidate that read or its ephemeral
admission counter. Adding the necessary independent head readback exposed this
in the unchanged compiled two-start regression. No timeout/assertion was relaxed.

Configured production reads now use a private atomic D1 batch: readiness, the
expected restore receipt and the repository SELECT share one transaction.
The exact existing Quick Play admission INSERT uses the same atomic predicates;
a denied cut performs no increment. Reads create no persistent writer lock.
Only a known denied readiness result may wait within the existing bound; unknown
provider failures do not replay. Arbitrary writes, PRAGMA/WITH and non-allowlisted
admission statements reject. Legacy adapters retain their original stricter fence
checks, including the closure-during-read rejection regression.

The local compiled fixture including refresh/completion replay now passes both
overlapping application starts. Internal observations fall845→435 and reads about
4,430→2,835. The authenticated-prefix protocol reduces external observations60→44;
these are one local fixture, not production billing or throughput.
The stopped hosted32-second cancellation has NOT thereby been attributed or cleared.

## Deployment and adoption order — not executed

Keep all access/payment/operational gates OFF. Retain the new archive decoder with
every rollback after compressed objects are written. Deploy compatible private ops
before its matching application; reverse the application first on rollback.

An existing nonzero legacy journal without a high-water mark must be adopted once
by the operator: capture a complete cut; run private
`verifyLegacyHeadBootstrapStep` while the surviving source head matches; then
`initialiseIndependentHead`. The shared fence rechecks the same source and inventory.
No head is inferred from time or from a lost source. A zero-event baseline needs
no head until its first commit. Fresh independent verification is required after
adoption. Completed legacy archives remain readable; old read-only verification
progress may need restarting, never an archive rewrite or a new retention clock.

Then perform the separately approved isolated hosted confirmation and retained-stock
checks. The existing production database remains0000–0013 until its gated0014
application; no historical order/consent/confirmation is invented.

## Remaining architectural boundary

Full snapshot capture still fences its source across many bounded invocations.
The local90-day physical minimum requires over11,000 capture calls. Lowering archive
bytes does not make this a short write pause. The proposed correction is to snapshot
a private journal-fed recovery mirror, with its cut/lag pinned, while the application
continues on its existing source. Independent commit custody remains mandatory;
the same-provider mirror is NOT the independent backup. This resource/benchmark
change requires the concrete approval in revised-hosted-verification-2026-10-23.md.
Routine mirror capture must also avoid a daily whole-history seen-row census;
complete independent enumeration remains mandatory during recovery. The current
capture implementation has not yet made that mirror-specific change. Do not
deploy an unreviewed capture contract or claim the proposed mirror already exists.

Full99-day grace/outage stock, long-lived financial growth and30-day independent
inventory remain distinct from the90-day local completed-game fixture. No5k/day,
hosted RTO, whole-account bill or production-readiness claim follows from local tests.

Generated logs/ciphertext/databases remain ignored. Exact latest validation and
physical-stock results are recorded in current-handoff.md; no credentials or owner
address belongs in this document.
